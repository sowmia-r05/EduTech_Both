
const Result = require("../../models/result");
const Writing = require("../../models/writing");
const {
  buildWritingDoc,
  fetchQuizNameById,
} = require("../../services/flexiQuizWritingService");

const { runPythonEval } = require("../../services/writingAiService");
const { getResponseQuestions } = require("../../services/flexiQuizApiCaller");
const { runResultFeedback } = require("../../services/resultAiService");
const { runSubjectFeedbackPython } = require("../../services/subjectFeedbackService");
// --- Writing length rules (advisory only) ---
const WORD_RANGES = {
  3: { min: 80, max: 150, strongMax: 200 },
  5: { min: 180, max: 300, strongMax: 350 },
  7: { min: 300, max: 500, strongMax: 600 },
  9: { min: 450, max: 700, strongMax: 700 },
};

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

/**
 * ✅ FIXED: Generate subject feedback with retry logic
 * Waits for topicBreakdown to be available before generating feedback
 */
async function generateSubjectFeedbackWithRetry(resultId, maxRetries = 3, delayMs = 2000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Feedback generation attempt ${attempt}/${maxRetries} for result ${resultId}`);
      
      const fresh = await Result.findOne({ _id: resultId });
      
      if (!fresh) {
        console.error(`❌ Result not found: ${resultId}`);
        return;
      }
      
      // Check if feedback already exists
      if (fresh.ai_feedback && fresh.ai_feedback.overall_feedback) {
        console.log(`✅ Feedback already exists for ${fresh.response_id}, skipping`);
        return;
      }
      
      // Validate topicBreakdown exists and is not empty
      const hasTopics = fresh.topicBreakdown && 
                       typeof fresh.topicBreakdown === 'object' && 
                       Object.keys(fresh.topicBreakdown).length > 0;
      
      if (!hasTopics) {
        if (attempt < maxRetries) {
          console.log(`⏳ topicBreakdown not ready yet, waiting ${delayMs}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue; // Retry
        } else {
          console.error(`❌ topicBreakdown still empty after ${maxRetries} attempts for ${fresh.response_id}`);
          await Result.updateOne(
            { _id: resultId },
            { 
              $set: { 
                "ai.status": "error",
                "ai.message": "Topic breakdown not available",
                "ai.error": "topicBreakdown is required but was not populated after multiple retries",
                "ai.evaluated_at": new Date()
              } 
            }
          );
          return;
        }
      }
      
      // topicBreakdown exists, proceed with feedback generation
      console.log(`✅ topicBreakdown ready with ${Object.keys(fresh.topicBreakdown).length} topics`);
      console.log(`🤖 Generating subject feedback for: ${fresh.response_id}`);
      
      await Result.updateOne(
        { _id: resultId },
        { 
          $set: { 
            "ai.status": "generating", 
            "ai.message": "AI is generating feedback…", 
            "ai.error": null 
          } 
        }
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
        console.error(`❌ Subject feedback generation failed for ${fresh.response_id}:`, errMsg);
        await Result.updateOne(
          { _id: resultId },
          { 
            $set: { 
              "ai.status": "error", 
              "ai.message": "AI generation failed", 
              "ai.error": errMsg, 
              "ai.evaluated_at": new Date() 
            } 
          }
        );
        return;
      }

      console.log(`✅ Subject feedback generated successfully for ${fresh.response_id}`);

      // Convert generated_at from ISO string to Date
      const generatedAt = py?.ai_feedback_meta?.generated_at
        ? new Date(py.ai_feedback_meta.generated_at)
        : new Date();

      await Result.updateOne(
        { _id: resultId },
        {
          $set: {
            performance_analysis: py.performance_analysis || {},
            ai_feedback: py.ai_feedback || {},
            ai_feedback_meta: {
              ...(py.ai_feedback_meta || {}),
              generated_at: generatedAt,
            },
            "ai.status": "done",
            "ai.message": "Feedback ready",
            "ai.error": null,
            "ai.evaluated_at": new Date(),
          },
        }
      );
      
      console.log(`✅ Subject feedback saved to database for ${fresh.response_id}`);
      
      // Success - exit retry loop
      return;
      
    } catch (e) {
      console.error(`❌ Feedback generation error (attempt ${attempt}/${maxRetries}):`, e.message);
      
      if (attempt === maxRetries) {
        // Final attempt failed
        await Result.updateOne(
          { _id: resultId },
          { 
            $set: { 
              "ai.status": "error",
              "ai.message": "Feedback generation failed",
              "ai.error": e.message,
              "ai.evaluated_at": new Date()
            } 
          }
        );
      } else {
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
}

module.exports = async function responseSubmitted(payload) {
  const { event_id, event_type, delivery_attempt } = payload || {};
  const data = payload?.data || payload?.Data || {};
  
  // Enhanced user data debugging
  console.log("🔍 Checking all possible user data locations:");
  const possibleUserPaths = [
    'data.user_id', 'data.user.user_id', 'data.student.user_id', 'data.student.id',
    'data.user_name', 'data.user.user_name', 'data.student.user_name', 'data.student.name',
    'data.first_name', 'data.user.first_name', 'data.student.first_name', 'data.respondent.first_name',
    'data.last_name', 'data.user.last_name', 'data.student.last_name', 'data.respondent.last_name',
    'data.email_address', 'data.user.email_address', 'data.student.email_address', 'data.respondent.email_address'
  ];
  
  possibleUserPaths.forEach(path => {
    const value = path.split('.').reduce((obj, key) => obj?.[key], payload);
    if (value !== undefined && value !== null && value !== '') {
      console.log(`  ✅ ${path}:`, value);
    }
  });

  // ---- Required identifiers ----
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

  // Resolve quiz_name via API when missing.
  if ((!quiz_name || String(quiz_name).trim() === "") && quiz_id) {
    try {
      quiz_name = await fetchQuizNameById(quiz_id);
    } catch (e) {
      console.warn(`⚠️ Could not resolve quiz name for quiz_id=${quiz_id}: ${e.message}`);
    }
  }

  // Writing detection
  const isWriting = String(quiz_name || "").toLowerCase().includes("writing");

  // -------------------------
  // WRITING FLOW
  // -------------------------
  if (isWriting) {
    console.log(`📩 response.submitted received for WRITING quiz (response_id=${response_id})`);

    try {
      // Safety: if this response_id was previously stored in Result, remove it.
      await Result.deleteOne({ $or: [{ response_id }, { responseId: response_id }] });

      const writingDoc = await buildWritingDoc({
        event_id,
        event_type,
        delivery_attempt,
        quiz_id,
        quiz_name,
        response_id,
      });

      // Non-submitted attempts are ignored (buildWritingDoc can return null)
      if (!writingDoc) return;

      const newWriting = new Writing(writingDoc);
      await newWriting.save();

      console.log(`✅ Saved WRITING submission in MongoDB (response_id=${response_id})`);

      // ✅ Kick off AI evaluation async (do not block webhook)
      setImmediate(async () => {
        try {
          const doc = await Writing.findOne({ _id: newWriting._id });
          if (!doc) return;

          await Writing.updateOne(
            { response_id },
            { $set: { "ai.status": "verifying", "ai.message": "Answer received. Verifying…" } }
          );

          const first = (doc.qna || [])[0] || {};
          const writing_prompt = first.question_text || "";
          const student_writing = first.answer_text || "";

          const year_level = inferYearLevel({ quiz_name: doc.quiz_name, writing_prompt });
          const wordCount = countWords(student_writing);
          const lineCount = countNonEmptyLines(student_writing);
          const range = WORD_RANGES[year_level] || WORD_RANGES[3];

          // ---- Hard-stop rules (skip AI) ----
          // 1) No answer => Not Attempted
          if (wordCount === 0) {
            await Writing.updateOne(
              { _id: newWriting._id },
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

          // 2) Below 20 words => Not enough response provided
          if (wordCount < 20) {
            await Writing.updateOne(
              { _id: newWriting._id },
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

          // 3) One line & short => Insufficient response
          if (lineCount === 1 && wordCount < 40) {
            await Writing.updateOne(
              { _id: newWriting._id },
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

          // Advisory note if below typical range
          const wordLimitNote =
            wordCount < range.min
              ? `Word count (${wordCount}) is below the expected range for Year ${year_level} (about ${range.min}–${range.max} words). Try to write within the proper limit.`
              : null;

          await Writing.updateOne(
            { _id: newWriting._id },
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
              { _id: newWriting._id },
              { $set: { "ai.status": "error", "ai.error": errMsg, "ai.message": "AI failed" } }
            );
            return;
          }

          // Attach advisory note + word count
          const mergedFeedback = {
            ...(result.result || {}),
            meta: {
              ...(result?.result?.meta || {}),
              year_level,
              word_count: wordCount,
              ...(wordLimitNote ? { word_limit_note: wordLimitNote } : {}),
            },
          };

          await Writing.updateOne(
            { _id: newWriting._id },
            {
              $set: {
                "ai.status": "done",
                "ai.message": "Ready",
                "ai.feedback": mergedFeedback,
                "ai.error": null,
                "ai.evaluated_at": new Date(),
              },
            }
          );
        } catch (e) {
          await Writing.updateOne(
            { _id: newWriting._id },
            { $set: { "ai.status": "error", "ai.error": e.message, "ai.message": "AI failed" } }
          );
        }
      });
    } catch (err) {
      console.error(
        `❌ Failed saving WRITING submission (response_id=${response_id}):`,
        err.message
      );
    }

    return; // Exit after writing processing
  }

  // -------------------------
  // NORMAL QUIZ FLOW (Result)
  // -------------------------
  const doc = {
    // webhook level
    event_id: event_id || undefined,
    eventId: (event_id || response_id || undefined),
    event_type,
    delivery_attempt,

    // data level (keep both styles for compatibility)
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
  };

  console.log(`📩 response.submitted received (response_id=${response_id},event_id=${event_id})`);

  // ✅ Create new document
  const newResult = new Result(doc);
  await newResult.save();
  console.log(`✅ Saved result document (response_id=${response_id}, event_id=${event_id})`);

  // ✅ STEP 1: Fetch topic breakdown via API (WAIT for this to complete)
  let topicBreakdownSuccess = false;
  try {
    if (quiz_id && response_id) {
      console.log(`🔍 Fetching topic breakdown for quiz_id=${quiz_id}, response_id=${response_id}`);
      
      const questions = await getResponseQuestions(quiz_id, response_id);
      const topicBreakdown = buildTopicBreakdownFromQuestions(questions);
      
      const topicCount = Object.keys(topicBreakdown).length;
      console.log(`📊 Built topic breakdown with ${topicCount} topics:`, Object.keys(topicBreakdown));

      await Result.updateOne({ _id: newResult._id }, { $set: { topicBreakdown } });
      
      console.log(`✅ Topic breakdown saved successfully`);
      topicBreakdownSuccess = true;
    } else {
      console.warn(`⚠️ Missing quiz_id or response_id; topic breakdown skipped`);
    }
  } catch (e) {
    console.error(`❌ Topic breakdown fetch failed for ${response_id}:`, e.message);
  }

  // ✅ STEP 2: Generate subject feedback (with retry logic)
  // Run in background but with better error handling
  setImmediate(() => {
    generateSubjectFeedbackWithRetry(newResult._id, 3, 2000)
      .catch(err => {
        console.error(`❌ Fatal error in feedback generation for ${response_id}:`, err);
      });
  });

  console.log(`✅ Completed processing response.submitted (response_id=${response_id})`);
};