const Result = require("../../models/result");
const Writing = require("../../models/writing");

const {
  buildWritingDoc,
  fetchQuizNameById,
} = require("../../services/flexiQuizWritingService");

const { runPythonEval } = require("../../services/writingAiService");
const { getResponseQuestions } = require("../../services/flexiQuizApiCaller");
const { runSubjectFeedbackPython } = require("../../services/subjectFeedbackService");

// --- Writing length rules (advisory only) ---
const WORD_RANGES = {
  3: { min: 80, max: 150, strongMax: 200 },
  5: { min: 180, max: 300, strongMax: 350 },
  7: { min: 300, max: 500, strongMax: 600 },
  9: { min: 450, max: 700, strongMax: 700 },
};

/* -------------------- helpers -------------------- */

function countWords(text) {
  const t = String(text || "").trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

function countNonEmptyLines(text) {
  const t = String(text || "");
  return t
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean).length;
}

function inferYearLevel({ quiz_name, writing_prompt }) {
  const hay = `${quiz_name || ""} ${writing_prompt || ""}`.toLowerCase();
  const m = hay.match(/\byear\s*(3|5|7|9)\b/);
  if (m && m[1]) return Number(m[1]);
  return 3;
}

function buildLocalFeedback({ year, wordCount, status, message, wordLimitNote }) {
  return {
    local_eval: true,
    year_level: year,
    word_count: wordCount,
    status,
    message,
    ...(wordLimitNote ? { word_limit_note: wordLimitNote } : {}),
  };
}

function pickFirst(...vals) {
  for (const v of vals) {
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

// Normalize date strings like "2018-11-02 00:10:56" into a valid Date
function parseFlexiDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;

  // Convert "YYYY-MM-DD HH:mm:ss" -> "YYYY-MM-DDTHH:mm:ssZ"
  if (typeof value === "string" && value.includes(" ")) {
    const iso = value.replace(" ", "T") + "Z";
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function buildTopicBreakdownFromQuestions(questions) {
  const topicBreakdown = {};
  (questions || []).forEach((q) => {
    (q.categories || []).forEach((cat) => {
      const name = cat?.name;
      if (!name) return;

      if (!topicBreakdown[name]) topicBreakdown[name] = { scored: 0, total: 0 };
      topicBreakdown[name].scored += q.points_scored || 0;
      topicBreakdown[name].total += q.points_available || 0;
    });
  });
  return topicBreakdown;
}

/* -------------------- background enrichment: Result -------------------- */

async function getQuestionsWithRetry(quiz_id, response_id, retries = 3, delayMs = 1500) {
  let lastErr = null;

  for (let i = 1; i <= retries; i++) {
    try {
      console.log(`🔁 getResponseQuestions attempt ${i}/${retries} for response_id=${response_id}`);
      const questions = await getResponseQuestions(quiz_id, response_id);

      if (!Array.isArray(questions) || questions.length === 0) {
        throw new Error("Questions empty (likely not finalized yet)");
      }
      return questions;
    } catch (e) {
      lastErr = e;
      if (i < retries) {
        console.log(`⏳ Waiting ${delayMs}ms before retry... (${e.message})`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  throw lastErr || new Error("Failed to fetch questions after retries");
}

async function generateSubjectFeedbackWithRetry(resultId, maxRetries = 3, delayMs = 2000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Subject feedback attempt ${attempt}/${maxRetries} for result ${resultId}`);

      const fresh = await Result.findOne({ _id: resultId });
      if (!fresh) {
        console.error(`❌ Result not found: ${resultId}`);
        return;
      }

      // skip if already exists
      if (fresh.ai_feedback && fresh.ai_feedback.overall_feedback) {
        console.log(`✅ Feedback already exists for ${fresh.response_id}, skipping`);
        return;
      }

      const hasTopics =
        fresh.topicBreakdown &&
        typeof fresh.topicBreakdown === "object" &&
        Object.keys(fresh.topicBreakdown).length > 0;

      if (!hasTopics) {
        if (attempt < maxRetries) {
          console.log(`⏳ topicBreakdown not ready yet, waiting ${delayMs}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        await Result.updateOne(
          { _id: resultId },
          {
            $set: {
              "ai.status": "error",
              "ai.message": "Topic breakdown not available",
              "ai.error": "topicBreakdown not populated after retries",
              "ai.evaluated_at": new Date(),
            },
          }
        );
        return;
      }

      await Result.updateOne(
        { _id: resultId },
        { $set: { "ai.status": "generating", "ai.message": "Generating feedback…", "ai.error": null } }
      );

      const py = await runSubjectFeedbackPython({
        doc: {
          response_id: fresh.response_id,
          quiz_name: fresh.quiz_name,
          score: fresh.score,
          topicBreakdown: fresh.topicBreakdown,
          duration: fresh.duration,
        },
      });

      if (!py || py.success !== true) {
        const errMsg = py?.error || "AI did not return feedback";
        await Result.updateOne(
          { _id: resultId },
          {
            $set: {
              "ai.status": "error",
              "ai.message": "AI generation failed",
              "ai.error": errMsg,
              "ai.evaluated_at": new Date(),
            },
          }
        );
        return;
      }

      const generatedAt = py?.ai_feedback_meta?.generated_at
        ? new Date(py.ai_feedback_meta.generated_at)
        : new Date();

      await Result.updateOne(
        { _id: resultId },
        {
          $set: {
            performance_analysis: py.performance_analysis || {},
            ai_feedback: py.ai_feedback || {},
            ai_feedback_meta: { ...(py.ai_feedback_meta || {}), generated_at: generatedAt },
            "ai.status": "done",
            "ai.message": "Feedback ready",
            "ai.error": null,
            "ai.evaluated_at": new Date(),
          },
        }
      );

      console.log(`✅ Subject feedback saved for ${fresh.response_id}`);
      return;
    } catch (e) {
      console.error(`❌ Subject feedback error attempt ${attempt}/${maxRetries}:`, e.message);

      if (attempt === maxRetries) {
        await Result.updateOne(
          { _id: resultId },
          {
            $set: {
              "ai.status": "error",
              "ai.message": "Feedback generation failed",
              "ai.error": e.message,
              "ai.evaluated_at": new Date(),
            },
          }
        );
      } else {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
}

async function enrichResultInBackground({ resultId, quiz_id, response_id }) {
  const startedAt = Date.now();

  await Result.updateOne(
    { _id: resultId },
    { $set: { "ai.status": "queued", "ai.message": "Queued for topic analysis & feedback…" } }
  );

  const questionsPromise =
    quiz_id && response_id
      ? getQuestionsWithRetry(quiz_id, response_id, 3, 1500)
      : Promise.resolve(null);

  const topicPromise = questionsPromise
    .then(async (questions) => {
      if (!questions) return null;

      const topicBreakdown = buildTopicBreakdownFromQuestions(questions);
      const topicCount = Object.keys(topicBreakdown).length;

      await Result.updateOne(
        { _id: resultId },
        {
          $set: {
            topicBreakdown,
            "ai.message": `Topic breakdown ready (${topicCount} topics). Generating feedback…`,
          },
        }
      );

      console.log(`📊 topicBreakdown saved (${topicCount}) for response_id=${response_id}`);
      return topicBreakdown;
    })
    .catch(async (e) => {
      console.error(`❌ Topic breakdown failed for response_id=${response_id}:`, e.message);
      await Result.updateOne(
        { _id: resultId },
        { $set: { "ai.topic_error": e.message, "ai.message": "Topic breakdown failed." } }
      );
      return null;
    });

  const feedbackPromise = topicPromise.then(async (topicBreakdown) => {
    if (!topicBreakdown || Object.keys(topicBreakdown).length === 0) return;
    await generateSubjectFeedbackWithRetry(resultId, 3, 2000);
  });

  await Promise.allSettled([questionsPromise, topicPromise, feedbackPromise]);

  const fresh = await Result.findById(resultId).lean();
  if (fresh?.ai?.status !== "done" && fresh?.ai?.status !== "error") {
    const tookMs = Date.now() - startedAt;
    await Result.updateOne(
      { _id: resultId },
      {
        $set: {
          "ai.status": "done",
          "ai.message": `Ready (enrichment took ~${Math.round(tookMs / 1000)}s)`,
          "ai.evaluated_at": new Date(),
        },
      }
    );
  }
}

/* -------------------- background enrichment: Writing -------------------- */

async function enrichWritingInBackground({
  writingId,
  event_id,
  event_type,
  delivery_attempt,
  quiz_id,
  quiz_name,
  response_id,
}) {
  const startedAt = Date.now();

  await Writing.updateOne(
    { _id: writingId },
    { $set: { "ai.status": "fetching", "ai.message": "Fetching writing submission…" } }
  );

  const writingDoc = await buildWritingDoc({
    event_id,
    event_type,
    delivery_attempt,
    quiz_id,
    quiz_name,
    response_id,
  });

  // non-submitted attempts ignored
  if (!writingDoc) {
    await Writing.updateOne(
      { _id: writingId },
      {
        $set: {
          status: "ignored",
          "ai.status": "done",
          "ai.message": "No submitted writing found",
          "ai.evaluated_at": new Date(),
        },
      }
    );
    return;
  }

  // update placeholder with full doc (qna etc.)
  await Writing.updateOne(
    { _id: writingId },
    {
      $set: {
        ...writingDoc,
        "ai.status": "verifying",
        "ai.message": "Answer received. Verifying…",
        "ai.error": null,
      },
    }
  );

  const doc = await Writing.findById(writingId);
  if (!doc) return;

  const first = (doc.qna || [])[0] || {};
  const writing_prompt = first.question_text || "";
  const student_writing = first.answer_text || "";

  const year_level = inferYearLevel({ quiz_name: doc.quiz_name, writing_prompt });
  const wordCount = countWords(student_writing);
  const lineCount = countNonEmptyLines(student_writing);
  const range = WORD_RANGES[year_level] || WORD_RANGES[3];

  // ---- Hard-stop rules (skip AI) ----
  if (wordCount === 0) {
    await Writing.updateOne(
      { _id: writingId },
      {
        $set: {
          "ai.status": "done",
          "ai.message": "Ready",
          "ai.feedback": buildLocalFeedback({
            year: year_level,
            wordCount,
            status: "not_attempted",
            message: "Not Attempted",
          }),
          "ai.error": null,
          "ai.evaluated_at": new Date(),
        },
      }
    );
    return;
  }

  if (wordCount < 20) {
    await Writing.updateOne(
      { _id: writingId },
      {
        $set: {
          "ai.status": "done",
          "ai.message": "Ready",
          "ai.feedback": buildLocalFeedback({
            year: year_level,
            wordCount,
            status: "not_enough_response",
            message: "Not enough response provided",
          }),
          "ai.error": null,
          "ai.evaluated_at": new Date(),
        },
      }
    );
    return;
  }

  if (lineCount === 1 && wordCount < 40) {
    await Writing.updateOne(
      { _id: writingId },
      {
        $set: {
          "ai.status": "done",
          "ai.message": "Ready",
          "ai.feedback": buildLocalFeedback({
            year: year_level,
            wordCount,
            status: "insufficient_response",
            message: "Insufficient response",
          }),
          "ai.error": null,
          "ai.evaluated_at": new Date(),
        },
      }
    );
    return;
  }

  const wordLimitNote =
    wordCount < range.min
      ? `Word count (${wordCount}) is below the expected range for Year ${year_level} (about ${range.min}–${range.max} words). Try to write within the proper limit.`
      : null;

  await Writing.updateOne(
    { _id: writingId },
    { $set: { "ai.status": "generating", "ai.message": "Generating feedback…" } }
  );

  const result = await runPythonEval({
    student_year: year_level,
    writing_prompt,
    student_writing,
  });

  if (!result || result.success !== true) {
    const errMsg = result?.error ? result.error : "Unknown AI error";
    await Writing.updateOne(
      { _id: writingId },
      {
        $set: {
          "ai.status": "error",
          "ai.error": errMsg,
          "ai.message": "AI failed",
          "ai.evaluated_at": new Date(),
        },
      }
    );
    return;
  }

  const mergedFeedback = {
    ...(result.result || {}),
    meta: {
      ...(result?.result?.meta || {}),
      year_level,
      word_count: wordCount,
      ...(wordLimitNote ? { word_limit_note: wordLimitNote } : {}),
    },
  };

  const tookMs = Date.now() - startedAt;

  await Writing.updateOne(
    { _id: writingId },
    {
      $set: {
        "ai.status": "done",
        "ai.message": `Ready (took ~${Math.round(tookMs / 1000)}s)`,
        "ai.feedback": mergedFeedback,
        "ai.error": null,
        "ai.evaluated_at": new Date(),
      },
    }
  );
}

/* -------------------- MAIN HANDLER -------------------- */

module.exports = async function responseSubmitted(payload) {
  const { event_id, event_type, delivery_attempt } = payload || {};
  const data = payload?.data || payload?.Data || {};

  // Required identifiers
  const response_id = pickFirst(data.response_id, data.responseId, data?.response?.id);
  if (!response_id) {
    console.error("❌ response.submitted missing data.response_id. Skipping DB save.");
    return;
  }

  const quiz_id = pickFirst(data.quiz_id, data.quizId, data?.quiz?.quiz_id, data?.quiz?.quizId);

  let quiz_name = pickFirst(
    data.quiz_name,
    data.quizName,
    data?.quiz?.name,
    data?.quiz?.quiz_name,
    payload?.quiz_name,
    payload?.quizName,
    payload?.quiz?.name
  );

  // Resolve quiz_name via API when missing
  if ((!quiz_name || String(quiz_name).trim() === "") && quiz_id) {
    try {
      quiz_name = await fetchQuizNameById(quiz_id);
    } catch (e) {
      console.warn(`⚠️ Could not resolve quiz name for quiz_id=${quiz_id}: ${e.message}`);
    }
  }

  const isWriting = String(quiz_name || "").toLowerCase().includes("writing");

  // -------------------------
  // WRITING: SAVE FAST → ENRICH IN BACKGROUND
  // -------------------------
  if (isWriting) {
    console.log(`📩 response.submitted (WRITING) response_id=${response_id}`);

    try {
      // Safety: if this response_id was previously stored in Result, remove it.
      await Result.deleteOne({ $or: [{ response_id }, { responseId: response_id }] });

      // ✅ FAST placeholder save (no FlexiQuiz API call here)
      const placeholder = await Writing.create({
        event_id,
        event_type,
        delivery_attempt,
        quiz_id,
        quiz_name,
        response_id,
        responseId: response_id,
        status: "received",
        qna: [],
        ai: {
          status: "queued",
          message: "Saved. Preparing writing content…",
          error: null,
          evaluated_at: null,
        },
        created_at: new Date(),
      });

      // ✅ background: build writing doc + AI
      setImmediate(() => {
        enrichWritingInBackground({
          writingId: placeholder._id,
          event_id,
          event_type,
          delivery_attempt,
          quiz_id,
          quiz_name,
          response_id,
        }).catch((err) => {
          console.error(`❌ WRITING enrichment fatal (response_id=${response_id}):`, err);
        });
      });

      return;
    } catch (err) {
      console.error(`❌ WRITING placeholder save failed (response_id=${response_id}):`, err.message);
      return;
    }
  }

  // -------------------------
  // NON-WRITING: SAVE FAST → ENRICH IN BACKGROUND
  // -------------------------
  const doc = {
    event_id: event_id || undefined,
    eventId: event_id || response_id || undefined,
    event_type,
    delivery_attempt,

    response_id,
    responseId: response_id,
    quiz_id,
    quiz_name,
    date_submitted: parseFlexiDate(data.date_submitted),

    score: {
      points: Number(data.points ?? 0),
      available: Number(data.available_points ?? 0),
      percentage: Number(data.percentage_score ?? 0),
      grade: data.grade ?? "",
      pass: !!data.pass,
    },

    user: {
      user_id: pickFirst(
        data.user_id,
        data?.user?.user_id,
        data?.user?.id,
        data?.student?.user_id,
        data?.student?.id,
        data?.account_user_id,
        data?.userId,
        null
      ),
      user_name: pickFirst(
        data.user_name,
        data?.user?.user_name,
        data?.user?.username,
        data?.user?.name,
        data?.student?.user_name,
        data?.student?.name,
        null
      ),
      first_name: pickFirst(
        data.first_name,
        data?.user?.first_name,
        data?.user?.firstName,
        data?.student?.first_name,
        data?.student?.firstName,
        data?.respondent?.first_name,
        data?.respondent?.firstName,
        ""
      ),
      last_name: pickFirst(
        data.last_name,
        data?.user?.last_name,
        data?.user?.lastName,
        data?.student?.last_name,
        data?.student?.lastName,
        data?.respondent?.last_name,
        data?.respondent?.lastName,
        ""
      ),
      email_address: pickFirst(
        data.email_address,
        data?.user?.email_address,
        data?.user?.email,
        data?.student?.email_address,
        data?.student?.email,
        data?.respondent?.email_address,
        data?.respondent?.email,
        ""
      ),
    },

    duration: data.duration,
    attempt: data.attempt,
    status: data.status,

    ai: {
      status: "queued",
      message: "Saved. Starting analysis…",
      error: null,
      evaluated_at: null,
    },
  };

  console.log(`📩 response.submitted (RESULT) response_id=${response_id}, event_id=${event_id}`);

  // ✅ FAST save
  const newResult = new Result(doc);
  await newResult.save();

  // ✅ background enrichment: questions → topicBreakdown → feedback
  setImmediate(() => {
    enrichResultInBackground({
      resultId: newResult._id,
      quiz_id,
      response_id,
    }).catch((err) => {
      console.error(`❌ RESULT enrichment fatal (response_id=${response_id}):`, err);
    });
  });
};