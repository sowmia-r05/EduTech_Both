/**
 * Export route — add inside adminRoutes.js (or mount separately)
 *
 * GET /api/admin/quizzes/:quizId/export
 *
 * Downloads an .xlsx file with all questions for a quiz.
 * Columns: #, question_text, type, option_a…e, correct_answer,
 *          points, category, image_url, explanation
 *
 * Images: if question_text contains a base64 <img>, the image is
 *         stripped from the text and its S3 URL is placed in image_url.
 *
 * Install: npm install exceljs
 */

// ── Paste this block inside adminRoutes.js, AFTER requireAdmin is applied ──

const ExcelJS = require("exceljs");

router.get("/quizzes/:quizId/export", requireAdmin, async (req, res) => {
  try {
    await connectDB();

    // Fetch quiz
    let quiz = await Quiz.findOne({ quiz_id: req.params.quizId }).lean();
    if (!quiz) quiz = await Quiz.findById(req.params.quizId).lean();
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    // Fetch questions
    const questions = await Question.find({ quiz_id: quiz.quiz_id || quiz._id })
      .sort({ order: 1 })
      .lean();

    // ── Build workbook ────────────────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    wb.creator  = "NAPLAN Admin";
    wb.created  = new Date();

    // ── Sheet 1: Questions ────────────────────────────────────────────────────
    const qs = wb.addWorksheet("Questions");

    // Header row
    qs.columns = [
      { header: "#",              key: "num",           width: 5  },
      { header: "question_text",  key: "question_text", width: 60 },
      { header: "type",           key: "type",          width: 16 },
      { header: "option_a",       key: "option_a",      width: 30 },
      { header: "option_b",       key: "option_b",      width: 30 },
      { header: "option_c",       key: "option_c",      width: 30 },
      { header: "option_d",       key: "option_d",      width: 30 },
      { header: "option_e",       key: "option_e",      width: 30 },
      { header: "correct_answer", key: "correct_answer",width: 16 },
      { header: "points",         key: "points",        width: 8  },
      { header: "category",       key: "category",      width: 20 },
      { header: "image_url",      key: "image_url",     width: 60 },
      { header: "explanation",    key: "explanation",   width: 50 },
    ];

    // Style header row
    qs.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern", pattern: "solid",
        fgColor: { argb: "FF4F46E5" }, // indigo
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });
    qs.getRow(1).height = 22;

    // Helper: strip base64 <img> from HTML question_text
    // Returns { cleanText, imageUrl }
    function extractImageFromText(rawText) {
      if (!rawText) return { cleanText: "", imageUrl: "" };

      // Match <img src="data:image/...;base64,..." ...> or <img src="https://..." ...>
      const base64Match = rawText.match(/<img[^>]+src="(data:image\/[^"]+)"[^>]*>/i);
      const httpMatch   = rawText.match(/<img[^>]+src="(https?:\/\/[^"]+)"[^>]*>/i);

      let imageUrl = "";
      let cleanText = rawText;

      if (base64Match) {
        // base64 embedded — strip the whole <img> tag; no downloadable URL
        imageUrl  = "[base64 image — re-upload to get URL]";
        cleanText = rawText.replace(base64Match[0], "").trim();
      } else if (httpMatch) {
        imageUrl  = httpMatch[1];
        cleanText = rawText.replace(httpMatch[0], "").trim();
      }

      // Strip remaining HTML tags for readable cell text
      cleanText = cleanText
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ")
        .trim();

      return { cleanText, imageUrl };
    }

    // Add question rows
    questions.forEach((q, idx) => {
      const { cleanText, imageUrl } = extractImageFromText(q.question_text);

      // Options: support both array-of-objects and flat fields
      const opts    = Array.isArray(q.options) ? q.options : [];
      const getOpt  = (i) => {
        const o = opts[i];
        if (!o) return "";
        return [o.text, o.image_url].filter(Boolean).join(" | ") || "";
      };

      // Correct answer: labels of correct options joined by comma
      const correctAnswer = opts
        .filter((o) => o.correct)
        .map((o) => o.label || o.text?.slice(0, 1)?.toUpperCase())
        .join(", ") || q.correct_answer || "";

      // Image URL: prefer question.image_url, fall back to extracted from text
      const finalImageUrl = q.image_url || imageUrl;

      const row = qs.addRow({
        num:           idx + 1,
        question_text: cleanText,
        type:          q.type || "radio_button",
        option_a:      getOpt(0),
        option_b:      getOpt(1),
        option_c:      getOpt(2),
        option_d:      getOpt(3),
        option_e:      getOpt(4),
        correct_answer: correctAnswer,
        points:        q.points || 1,
        category:      q.category || "",
        image_url:     finalImageUrl,
        explanation:   q.explanation || "",
      });

      // Zebra striping
      if (idx % 2 === 1) {
        row.eachCell((cell) => {
          cell.fill = {
            type: "pattern", pattern: "solid",
            fgColor: { argb: "FFF1F5F9" },
          };
        });
      }

      // Wrap text in question_text and explanation cells
      row.getCell("question_text").alignment = { wrapText: true };
      row.getCell("explanation").alignment   = { wrapText: true };

      // Make image_url a hyperlink if it's a real URL
      if (finalImageUrl && finalImageUrl.startsWith("http")) {
        row.getCell("image_url").value = {
          text:      finalImageUrl,
          hyperlink: finalImageUrl,
        };
        row.getCell("image_url").font = {
          color:     { argb: "FF4F46E5" },
          underline: true,
        };
      }
    });

    // Freeze header row
    qs.views = [{ state: "frozen", ySplit: 1 }];

    // Auto-filter
    qs.autoFilter = {
      from: { row: 1, column: 1 },
      to:   { row: 1, column: qs.columns.length },
    };

    // ── Sheet 2: Quiz Info ────────────────────────────────────────────────────
    const qi = wb.addWorksheet("Quiz Info");
    qi.columns = [
      { header: "Field", key: "field", width: 24 },
      { header: "Value", key: "value", width: 50 },
    ];
    qi.getRow(1).font = { bold: true };

    const infoRows = [
      ["quiz_name",          quiz.quiz_name          || ""],
      ["year_level",         quiz.year_level          || ""],
      ["subject",            quiz.subject             || ""],
      ["tier",               quiz.tier                || "A"],
      ["set_number",         quiz.set_number          || 1],
      ["difficulty",         quiz.difficulty          || ""],
      ["time_limit_minutes", quiz.time_limit_minutes  || ""],
      ["is_trial",           quiz.is_trial ? "true" : "false"],
      ["total_questions",    questions.length],
      ["exported_at",        new Date().toISOString()],
    ];
    infoRows.forEach(([field, value]) => qi.addRow({ field, value }));

    // ── Stream response ───────────────────────────────────────────────────────
    const safeQuizName = (quiz.quiz_name || "quiz")
      .replace(/[^a-zA-Z0-9_\- ]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 60);
    const filename = `${safeQuizName}_questions.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );

    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Quiz export error:", err);
    // Only send error if headers haven't been sent
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});