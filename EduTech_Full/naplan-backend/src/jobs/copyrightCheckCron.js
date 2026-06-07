/**
 * jobs/copyrightCheckCron.js
 *
 * Nightly automated copyright / originality audit.
 *
 * What it does
 * ────────────
 *   1. Picks questions that have never been checked, OR whose last check
 *      is older than RECHECK_AFTER_DAYS (default 30).
 *   2. Runs the full 4-layer checkOriginality() on each — including the
 *      Google Cloud Vision web-detection image check.
 *   3. Persists the result on each Question doc (same shape as the
 *      runAndPersist() helper in originalityRoutes.js).
 *   4. After the batch finishes, if anything was flagged it emails the
 *      admin a summary report. Clean runs stay silent unless
 *      ALWAYS_SEND_AUDIT_EMAIL=true.
 *
 * Why in-process?
 *   Same pattern as weeklyProgressEmail.js and cleanupExpiredBundles.js —
 *   no extra Render service, no external scheduler.
 *
 * Place at: src/jobs/copyrightCheckCron.js
 *
 * Wire up in server.js:
 *   const { scheduleCopyrightCheck } = require("./jobs/copyrightCheckCron");
 *   scheduleCopyrightCheck();
 *
 * Configure via .env:
 *   COPYRIGHT_AUDIT_EMAIL=admin@kaisolutions.ai   (required — where to send reports)
 *   COPYRIGHT_CHECK_HOUR_UTC=16                   (default 16 UTC = 2am AEST)
 *   COPYRIGHT_CHECK_BATCH_SIZE=200                (max questions per nightly run)
 *   COPYRIGHT_RECHECK_AFTER_DAYS=30               (recheck cadence for already-clean items)
 *   COPYRIGHT_DELAY_MS=1500                       (pause between checks, kind to Vision API)
 *   ALWAYS_SEND_AUDIT_EMAIL=false                 (true = email even when nothing flagged)
 */

const connectDB  = require("../config/db");
const Question   = require("../models/question");
const { checkOriginality } = require("../utils/originalityCheck");
const { sendBrevoEmail }   = require("../services/brevoEmail");

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════

const AUDIT_EMAIL          = process.env.COPYRIGHT_AUDIT_EMAIL || "";
const RUN_HOUR_UTC         = parseInt(process.env.COPYRIGHT_CHECK_HOUR_UTC || "16", 10);  // 16 UTC = 2am AEST
const BATCH_SIZE           = parseInt(process.env.COPYRIGHT_CHECK_BATCH_SIZE || "200", 10);
const RECHECK_AFTER_DAYS   = parseInt(process.env.COPYRIGHT_RECHECK_AFTER_DAYS || "30", 10);
const DELAY_MS             = parseInt(process.env.COPYRIGHT_DELAY_MS || "1500", 10);
const ALWAYS_SEND          = process.env.ALWAYS_SEND_AUDIT_EMAIL === "true";
const FRONTEND_URL         = process.env.FRONTEND_URL || "https://naplan.kaisolutions.ai/#/";
const CHECK_INTERVAL_MS    = 60 * 60 * 1000; // wake hourly, only act at RUN_HOUR_UTC

// Statuses that should be reported. Anything that isn't "clean" or "skipped".
const FLAGGED_PREFIXES = ["blocked_", "review_", "duplicate_"];

function isFlagged(status) {
  if (!status || status === "clean" || status === "skipped") return false;
  return FLAGGED_PREFIXES.some((p) => status.startsWith(p)) || status === "error";
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ═══════════════════════════════════════════════════════════════
// CORE: pick questions and run checks
// ═══════════════════════════════════════════════════════════════

async function pickQuestionsToCheck() {
  const cutoff = new Date(Date.now() - RECHECK_AFTER_DAYS * 24 * 60 * 60 * 1000);

  // Never-checked questions first, then the oldest checks.
  // Sort ascending on last_checked_at so nulls (never-checked) come first.
  const questions = await Question.find({
    $or: [
      { "originality.last_checked_at": { $exists: false } },
      { "originality.last_checked_at": null },
      { "originality.last_checked_at": { $lt: cutoff } },
    ],
  })
    .select("question_id text options year_level subject quiz_ids image_url image_urls")
    .sort({ "originality.last_checked_at": 1 })
    .limit(BATCH_SIZE)
    .lean();

  return questions;
}

async function runAndPersist(question) {
  const result = await checkOriginality(
    {
      text:       question.text,
      options:    question.options,
      image_url:  question.image_url,
      image_urls: question.image_urls,
    },
    {
      excludeQuestionId: question.question_id,
      yearLevel:         question.year_level,
      subject:           question.subject,
    }
  );

  await Question.updateOne(
    { question_id: question.question_id },
    {
      $set: {
        "originality.status":          result.status,
        "originality.exact_hash":      result.fingerprints?.exact_hash,
        "originality.structural_hash": result.fingerprints?.structural_hash,
        "originality.embedding":       result.embedding,
        "originality.embedding_model": process.env.EMBEDDING_MODEL || null,
        "originality.layers":          result.layers,
        "originality.last_checked_at": result.checked_at || new Date(),
      },
    }
  );

  return result;
}

// ═══════════════════════════════════════════════════════════════
// EMAIL: build and send the audit report
// ═══════════════════════════════════════════════════════════════

const BRAND_COLOR    = "#4F46E5";
const BRAND_GRADIENT = "linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)";

function escape(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function statusBadge(status) {
  const isError   = status === "error";
  const isBlocked = String(status).startsWith("blocked_");
  const color = isBlocked ? "#dc2626" : isError ? "#6b7280" : "#d97706";
  const bg    = isBlocked ? "#fef2f2" : isError ? "#f3f4f6" : "#fffbeb";
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:${bg};color:${color};font-size:11px;font-weight:600;">${escape(status)}</span>`;
}

function buildReportHtml({ runStats, flagged }) {
  const flaggedRows = flagged.length === 0
    ? `<tr><td colspan="4" style="padding:16px;text-align:center;color:#6b7280;font-size:13px;">No flagged questions in this run.</td></tr>`
    : flagged.map((f) => {
        const reason = f.result?.reason || f.result?.layers?.image?.reason || "—";
        const topMatch =
          f.result?.layers?.image?.full_matches?.[0]?.domain ||
          f.result?.layers?.image?.pages?.[0]?.domain ||
          f.result?.layers?.semantic?.top?.[0]?.publisher ||
          "—";
        return `
          <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-family:monospace;font-size:12px;color:#111827;">${escape(f.question_id)}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${statusBadge(f.result.status)}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#374151;">${escape(reason)}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#374151;">${escape(topMatch)}</td>
          </tr>`;
      }).join("");

  return `
<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /><title>Copyright Audit Report</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
  <div style="max-width:720px;margin:0 auto;background:#ffffff;">
    <div style="background:${BRAND_GRADIENT};padding:28px 24px;text-align:center;">
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">Copyright Audit Report</h1>
      <p style="margin:6px 0 0;color:#e0e7ff;font-size:13px;">Nightly automated check — ${escape(runStats.startedAt.toISOString().slice(0,10))}</p>
    </div>

    <div style="padding:28px 28px 8px;">
      <table style="width:100%;border-collapse:separate;border-spacing:8px;margin-bottom:20px;" cellpadding="0" cellspacing="0">
        <tr>
          <td style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px;text-align:center;width:25%;">
            <p style="margin:0;font-size:11px;color:#059669;font-weight:600;text-transform:uppercase;">Checked</p>
            <p style="margin:4px 0 0;font-size:22px;font-weight:700;color:#111827;">${runStats.total}</p>
          </td>
          <td style="background:#ecfeff;border:1px solid #a5f3fc;border-radius:8px;padding:14px;text-align:center;width:25%;">
            <p style="margin:0;font-size:11px;color:#0891b2;font-weight:600;text-transform:uppercase;">Clean</p>
            <p style="margin:4px 0 0;font-size:22px;font-weight:700;color:#111827;">${runStats.clean}</p>
          </td>
          <td style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px;text-align:center;width:25%;">
            <p style="margin:0;font-size:11px;color:#d97706;font-weight:600;text-transform:uppercase;">Flagged</p>
            <p style="margin:4px 0 0;font-size:22px;font-weight:700;color:#111827;">${runStats.flagged}</p>
          </td>
          <td style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px;text-align:center;width:25%;">
            <p style="margin:0;font-size:11px;color:#dc2626;font-weight:600;text-transform:uppercase;">Errors</p>
            <p style="margin:4px 0 0;font-size:22px;font-weight:700;color:#111827;">${runStats.errors}</p>
          </td>
        </tr>
      </table>

      <h2 style="margin:24px 0 12px;font-size:15px;color:#111827;">Items needing your attention</h2>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Question</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Status</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Reason</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Top match</th>
          </tr>
        </thead>
        <tbody>${flaggedRows}</tbody>
      </table>

      <div style="text-align:center;margin:28px 0 16px;">
        <a href="${FRONTEND_URL}admin/originality"
           style="display:inline-block;background:${BRAND_GRADIENT};color:#fff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;">
          Open audit dashboard →
        </a>
      </div>

      <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">
        Run started ${escape(runStats.startedAt.toISOString())} · finished ${escape(runStats.finishedAt.toISOString())} · duration ${runStats.durationSec}s
      </p>
    </div>

    <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:18px;text-align:center;">
      <p style="margin:0;color:#9ca3af;font-size:11px;">&copy; ${new Date().getFullYear()} KAI Solutions · Automated copyright audit</p>
    </div>
  </div>
</body></html>`;
}

async function sendAuditReport({ runStats, flagged }) {
  if (!AUDIT_EMAIL) {
    console.warn("⚠️  COPYRIGHT_AUDIT_EMAIL not set — skipping report email.");
    return;
  }

  const subject = flagged.length === 0
    ? `✅ Copyright audit clean — ${runStats.total} checked`
    : `⚠️  Copyright audit: ${flagged.length} flagged of ${runStats.total} checked`;

  const html = buildReportHtml({ runStats, flagged });
  const text =
    `Copyright audit ${runStats.startedAt.toISOString().slice(0,10)}\n` +
    `Checked ${runStats.total}, clean ${runStats.clean}, flagged ${runStats.flagged}, errors ${runStats.errors}.\n` +
    (flagged.length
      ? flagged.map((f) => `- ${f.question_id} [${f.result.status}] ${f.result?.reason || ""}`).join("\n")
      : "Nothing flagged.");

  await sendBrevoEmail({ toEmail: AUDIT_EMAIL, subject, text, html });
  console.log(`📧 Audit report sent to ${AUDIT_EMAIL}`);
}

// ═══════════════════════════════════════════════════════════════
// MAIN: one full run
// ═══════════════════════════════════════════════════════════════

async function runCopyrightAudit() {
  const startedAt = new Date();
  console.log(`🛡️  Copyright audit starting at ${startedAt.toISOString()}`);

  try {
    await connectDB();
    const questions = await pickQuestionsToCheck();
    console.log(`   Picked ${questions.length} question(s) to check (limit ${BATCH_SIZE}).`);

    if (questions.length === 0) {
      console.log("   Nothing to check — all questions are within the recheck window.");
      return;
    }

    const flagged = [];
    let clean   = 0;
    let errors  = 0;

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      try {
        const result = await runAndPersist(q);
        if (isFlagged(result.status)) {
          flagged.push({ question_id: q.question_id, quiz_ids: q.quiz_ids || [], result });
          if (result.status === "error") errors++;
          console.log(`   [${i + 1}/${questions.length}] ⚠️  ${q.question_id} → ${result.status}`);
        } else {
          clean++;
          if ((i + 1) % 25 === 0) console.log(`   [${i + 1}/${questions.length}] ✅ progress checkpoint`);
        }
      } catch (err) {
        errors++;
        flagged.push({
          question_id: q.question_id,
          quiz_ids:    q.quiz_ids || [],
          result:      { status: "error", reason: err.message },
        });
        console.error(`   [${i + 1}/${questions.length}] ❌ ${q.question_id} —`, err.message);
      }

      if (i < questions.length - 1) await sleep(DELAY_MS);
    }

    const finishedAt = new Date();
    const runStats = {
      startedAt,
      finishedAt,
      durationSec: Math.round((finishedAt - startedAt) / 1000),
      total:       questions.length,
      clean,
      flagged:     flagged.length - errors,
      errors,
    };

    console.log(
      `🛡️  Audit done — checked ${runStats.total}, clean ${runStats.clean}, ` +
      `flagged ${runStats.flagged}, errors ${runStats.errors} (${runStats.durationSec}s).`
    );

    if (flagged.length > 0 || ALWAYS_SEND) {
      await sendAuditReport({ runStats, flagged });
    } else {
      console.log("   Nothing flagged — skipping email (set ALWAYS_SEND_AUDIT_EMAIL=true to override).");
    }
  } catch (err) {
    console.error("❌ Copyright audit fatal error:", err);
    // Try to still email so admin knows the job failed.
    if (AUDIT_EMAIL) {
      try {
        await sendBrevoEmail({
          toEmail: AUDIT_EMAIL,
          subject: "❌ Copyright audit job FAILED",
          text:    `The nightly copyright audit job crashed.\n\n${err.stack || err.message}`,
          html:    `<p>The nightly copyright audit job crashed.</p><pre>${escape(err.stack || err.message)}</pre>`,
        });
      } catch (mailErr) {
        console.error("   Also failed to send failure email:", mailErr.message);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// SCHEDULER
// ═══════════════════════════════════════════════════════════════

function scheduleCopyrightCheck() {
  let lastRunDate = null;

  const tick = async () => {
    const now = new Date();
    if (now.getUTCHours() !== RUN_HOUR_UTC) return;

    const today = now.toISOString().slice(0, 10);
    if (lastRunDate === today) return;
    lastRunDate = today;

    await runCopyrightAudit();
  };

  // Run immediately on boot if env says so (handy for testing)
  if (process.env.COPYRIGHT_RUN_ON_BOOT === "true") {
    setTimeout(() => runCopyrightAudit().catch(console.error), 5000);
  }

  const interval = setInterval(tick, CHECK_INTERVAL_MS);
  if (interval.unref) interval.unref();

  console.log(`⏰ Copyright audit scheduled (daily at ${RUN_HOUR_UTC}:00 UTC, batch ${BATCH_SIZE}).`);
  return interval;
}

module.exports = {
  scheduleCopyrightCheck,
  runCopyrightAudit, // exported so you can also trigger manually from a route or REPL
};