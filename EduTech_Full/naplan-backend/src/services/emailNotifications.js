 /**
 * services/emailNotifications.js
 *
 * Branded email notification service for EduTech.
 * Uses existing sendBrevoEmail() for delivery.
 *
 * Exports:
 *   - sendQuizCompletionEmail({ parentEmail, childName, quizName, score, topicBreakdown, duration, dashboardUrl })
 *   - sendWeeklyProgressEmail({ parentEmail, childName, weeklyStats, dashboardUrl })
 *
 * Place in: naplan-backend/src/services/emailNotifications.js
 */

const { sendBrevoEmail } = require("./brevoEmail");
const Child = require("../models/child");
const Parent = require("../models/parent");

// ═══════════════════════════════════════
// SHARED TEMPLATE PARTS
// ═══════════════════════════════════════

const BRAND_COLOR = "#4F46E5"; // indigo-600
const BRAND_GRADIENT = "linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)"; // indigo → violet
const DASHBOARD_URL = process.env.FRONTEND_URL || "https://naplan.kaisolutions.ai/#/";

function emailWrapper(title, bodyContent) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background-color:#ffffff;">

    <!-- Header -->
    <div style="background:${BRAND_GRADIENT};padding:32px 24px;text-align:center;">
      <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">
        EduTech
      </h1>
      <p style="margin:6px 0 0;color:#e0e7ff;font-size:13px;font-weight:400;">
        NAPLAN Practice Platform
      </p>
    </div>

    <!-- Body -->
    <div style="padding:32px 28px;">
      ${bodyContent}
    </div>

    <!-- Footer -->
    <div style="background-color:#f9fafb;border-top:1px solid #e5e7eb;padding:24px 28px;text-align:center;">
      <p style="margin:0 0 8px;color:#6b7280;font-size:12px;">
        You're receiving this because you enabled email notifications for your child's account.
      </p>
      <p style="margin:0 0 8px;color:#6b7280;font-size:12px;">
        <a href="${DASHBOARD_URL}parent-dashboard" style="color:${BRAND_COLOR};text-decoration:underline;">
          Manage notification preferences
        </a>
      </p>
      <p style="margin:0;color:#9ca3af;font-size:11px;">
        &copy; ${new Date().getFullYear()} KAI Solutions. All rights reserved.
      </p>
    </div>

  </div>
</body>
</html>`;
}

// ═══════════════════════════════════════
// HELPER: Grade emoji & color
// ═══════════════════════════════════════

function gradeInfo(percentage) {
  if (percentage >= 90) return { grade: "A", color: "#059669", emoji: "🎉", label: "Outstanding!" };
  if (percentage >= 75) return { grade: "B", color: "#2563eb", emoji: "🌟", label: "Great job!" };
  if (percentage >= 60) return { grade: "C", color: "#d97706", emoji: "👍", label: "Good work!" };
  if (percentage >= 50) return { grade: "D", color: "#ea580c", emoji: "💪", label: "Keep practicing!" };
  return { grade: "F", color: "#dc2626", emoji: "📚", label: "More practice needed" };
}

function formatDuration(seconds) {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function topicBarHtml(name, scored, total) {
  const pct = total > 0 ? Math.round((scored / total) * 100) : 0;
  let barColor = "#dc2626"; // red
  if (pct >= 75) barColor = "#059669"; // green
  else if (pct >= 50) barColor = "#d97706"; // amber

  return `
    <tr>
      <td style="padding:8px 0;font-size:13px;color:#374151;width:40%;">${name}</td>
      <td style="padding:8px 0;width:45%;">
        <div style="background:#e5e7eb;border-radius:99px;height:10px;overflow:hidden;">
          <div style="background:${barColor};height:10px;border-radius:99px;width:${pct}%;"></div>
        </div>
      </td>
      <td style="padding:8px 0 8px 12px;font-size:12px;color:#6b7280;white-space:nowrap;text-align:right;width:15%;">
        ${scored}/${total} (${pct}%)
      </td>
    </tr>`;
}

// ═══════════════════════════════════════
// 1. QUIZ COMPLETION EMAIL  (updated — with parent summary)
// ═══════════════════════════════════════

/**
 * @param {Object}  opts
 * @param {string}  opts.parentEmail
 * @param {string}  opts.childName
 * @param {string}  opts.quizName
 * @param {Object}  opts.score          – { points, available, percentage, grade }
 * @param {Object}  opts.topicBreakdown – { "Topic": { scored, total }, ... }
 * @param {number}  opts.duration       – seconds
 * @param {string}  [opts.subject]      – e.g. "Numeracy"
 */
async function sendQuizCompletionEmail(opts) {
  const {
    parentEmail,
    childName,
    quizName,
    score,
    topicBreakdown = {},
    duration,
    subject,
  } = opts;

  const isWriting = (subject || "").toLowerCase() === "writing";
  const pct       = score?.percentage ?? 0;
  const gi        = gradeInfo(pct);

  // ── Tile colours (score-based) ────────────────────────────────
  let scoreBg     = "#f0fdf4"; let scoreBorder = "#bbf7d0"; let scoreValCol = "#059669";
  if (pct < 50)      { scoreBg = "#fef2f2"; scoreBorder = "#fecaca"; scoreValCol = "#dc2626"; }
  else if (pct < 60) { scoreBg = "#fff7ed"; scoreBorder = "#fed7aa"; scoreValCol = "#ea580c"; }
  else if (pct < 75) { scoreBg = "#fffbeb"; scoreBorder = "#fde68a"; scoreValCol = "#d97706"; }

  // ── Split topics → strengths / needs work ────────────────────
  const topicEntries = Object.entries(topicBreakdown);

  const strengths = topicEntries
    .map(([name, d]) => ({
      name,
      percentage: d.total > 0 ? Math.round((d.scored / d.total) * 100) : 0,
    }))
    .filter((t) => t.percentage >= 60)
    .sort((a, b) => b.percentage - a.percentage);

  const needsWork = topicEntries
    .map(([name, d]) => ({
      name,
      percentage: d.total > 0 ? Math.round((d.scored / d.total) * 100) : 0,
    }))
    .filter((t) => t.percentage < 60)
    .sort((a, b) => a.percentage - b.percentage);

  // ── Build dot-list for strengths/needs work columns ──────────
  function dotList(topics, dotColor) {
    if (!topics || topics.length === 0)
      return `<p style="margin:0;font-size:12px;color:#9ca3af;">No data yet</p>`;
    return topics
      .map(
        ({ name, percentage }) =>
          `<p style="margin:0 0 6px;font-size:13px;color:#374151;">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dotColor};margin-right:6px;vertical-align:middle;"></span>
            ${name} <span style="color:#6b7280;font-size:12px;">(${percentage}%)</span>
          </p>`
      )
      .join("");
  }

  // ── Build narrative summary sentences ─────────────────────────
  function buildSummary() {
    const goodAtLine = strengths.length > 0
      ? `<strong>${childName}</strong> is performing well in <strong>${strengths.map((t) => t.name).join(", ")}</strong>.`
      : `<strong>${childName}</strong> is working through all topics in this quiz.`;

    const nextStepsLine = needsWork.length > 0
      ? `The areas that need more attention are <strong>${needsWork.map((t) => t.name).join(", ")}</strong>. Focused practice on these topics will help improve the overall score.`
      : `Keep up the great work — ${childName} is performing well across all topics!`;

    return `${goodAtLine} ${nextStepsLine}`;
  }

  // ══════════════════════════════════════════════════════════════
  // WRITING PATH
  // ══════════════════════════════════════════════════════════════
  if (isWriting) {
    const hasScore  = score?.points != null && score?.available != null;
    const writingPct = hasScore && score.available > 0
      ? Math.round((score.points / score.available) * 100)
      : score?.percentage ?? null;

    const bandLabel  = score?.band || null;
    const bandBg     = bandLabel?.includes("Above") ? "#f0fdf4" : bandLabel?.includes("Below") ? "#fef2f2" : "#fffbeb";
    const bandBorder = bandLabel?.includes("Above") ? "#bbf7d0" : bandLabel?.includes("Below") ? "#fecaca" : "#fde68a";
    const bandColor  = bandLabel?.includes("Above") ? "#059669" : bandLabel?.includes("Below") ? "#dc2626" : "#d97706";
    const wScoreBg   = writingPct != null && writingPct >= 75 ? "#f0fdf4" : writingPct != null && writingPct >= 50 ? "#fffbeb" : writingPct != null ? "#fef2f2" : "#f5f3ff";
    const wScoreBdr  = writingPct != null && writingPct >= 75 ? "#bbf7d0" : writingPct != null && writingPct >= 50 ? "#fde68a" : writingPct != null ? "#fecaca" : "#e9d5ff";
    const wScoreCol  = writingPct != null && writingPct >= 75 ? "#059669" : writingPct != null && writingPct >= 50 ? "#d97706" : writingPct != null ? "#dc2626" : "#7c3aed";

    // Writing summary (band-based since no topic breakdown)
    const writingSummaryText = hasScore
      ? bandLabel?.includes("Above")
        ? `<strong>${childName}</strong> has demonstrated strong writing skills in this task — performing <strong>above the minimum standard</strong>. Keep encouraging regular writing practice to maintain this level.`
        : bandLabel?.includes("Below")
        ? `<strong>${childName}</strong> is working towards the writing standard. This is a great opportunity to focus on <strong>structure, vocabulary and idea development</strong>. Consistent practice will make a big difference.`
        : `<strong>${childName}</strong> is meeting the minimum writing standard. Next steps include expanding vocabulary, improving sentence variety, and developing ideas more fully.`
      : `<strong>${childName}</strong> has submitted their writing task. AI feedback with detailed strengths and next steps will be available on the dashboard shortly.`;

    const bodyContent = `
      <p style="margin:0 0 4px;color:#111827;font-size:16px;font-weight:600;">Quiz Results</p>
      <p style="margin:0 0 20px;color:#4b5563;font-size:14px;line-height:1.6;">
        Here's how <strong>${childName}</strong> did:
      </p>

      <!-- Quiz badge -->
      <div style="background:#f5f3ff;border:1px solid #e9d5ff;border-radius:8px;padding:12px 16px;margin-bottom:16px;">
        <p style="margin:0;color:#7c3aed;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Writing</p>
        <p style="margin:4px 0 0;color:#1e1b4b;font-size:15px;font-weight:600;">${quizName}</p>
      </div>

      ${hasScore ? `
      <!-- Stat tiles -->
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:8px;">
        <tr>
          <td style="width:50%;padding:4px;">
            <div style="background:${wScoreBg};border:1px solid ${wScoreBdr};border-radius:10px;padding:16px 12px;text-align:center;">
              <p style="margin:0;font-size:24px;font-weight:700;color:${wScoreCol};">${score.points}/${score.available}</p>
              <p style="margin:6px 0 0;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;">Score</p>
            </div>
          </td>
          <td style="width:50%;padding:4px;">
            <div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;padding:16px 12px;text-align:center;">
              <p style="margin:0;font-size:24px;font-weight:700;color:#4F46E5;">${writingPct != null ? writingPct + "%" : "—"}</p>
              <p style="margin:6px 0 0;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;">Percentage</p>
            </div>
          </td>
        </tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:16px;">
        <tr>
          <td style="width:50%;padding:4px;">
            <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px 12px;text-align:center;">
              <p style="margin:0;font-size:24px;font-weight:700;color:#d97706;">${formatDuration(duration)}</p>
              <p style="margin:6px 0 0;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;">Time Spent</p>
            </div>
          </td>
          <td style="width:50%;padding:4px;">
            <div style="background:${bandBg};border:1px solid ${bandBorder};border-radius:10px;padding:16px 12px;text-align:center;">
              <p style="margin:0;font-size:13px;font-weight:700;color:${bandColor};padding-top:4px;">${bandLabel ? bandLabel.replace(" Minimum Standard", "") : "—"}</p>
              <p style="margin:6px 0 0;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;">Band</p>
            </div>
          </td>
        </tr>
      </table>
      ` : `
      <!-- Fallback tiles (AI not done yet) -->
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:16px;">
        <tr>
          <td style="width:50%;padding:4px;">
            <div style="background:#f5f3ff;border:1px solid #e9d5ff;border-radius:10px;padding:16px 12px;text-align:center;">
              <p style="margin:0;font-size:18px;font-weight:700;color:#7c3aed;padding-top:4px;">Submitted</p>
              <p style="margin:6px 0 0;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;">Status</p>
            </div>
          </td>
          <td style="width:50%;padding:4px;">
            <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px 12px;text-align:center;">
              <p style="margin:0;font-size:24px;font-weight:700;color:#d97706;">${formatDuration(duration)}</p>
              <p style="margin:6px 0 0;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;">Time Spent</p>
            </div>
          </td>
        </tr>
      </table>
      `}

      <!-- ✅ Parent Summary -->
      <div style="background:#f8faff;border:1px solid #e0e7ff;border-radius:10px;padding:16px 18px;margin-bottom:16px;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:600;color:#4F46E5;text-transform:uppercase;letter-spacing:0.8px;">Summary for you</p>
        <p style="margin:0;font-size:13px;color:#374151;line-height:1.7;">${writingSummaryText}</p>
      </div>

      <!-- CTA -->
      <div style="text-align:center;margin:20px 0 12px;">
        <a href="${DASHBOARD_URL}parent-dashboard"
          style="display:inline-block;background:${BRAND_GRADIENT};color:#ffffff;font-size:14px;font-weight:600;padding:14px 32px;border-radius:8px;text-decoration:none;">
          View Full Results →
        </a>
      </div>
      <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
        Keep encouraging ${childName} — consistent practice makes a big difference!
      </p>
    `;

    const html = emailWrapper(`${childName}'s Quiz Results`, bodyContent);
    await sendBrevoEmail({
      toEmail: parentEmail,
      subject: hasScore
        ? `✍️ ${childName} scored ${score.points}/${score.available} on their Writing Quiz`
        : `✍️ ${childName} submitted their Writing Quiz`,
      text: hasScore
        ? `${childName} completed "${quizName}" and scored ${score.points}/${score.available} (${writingPct}%). Band: ${bandLabel || "—"}. View results at ${DASHBOARD_URL}parent-dashboard`
        : `${childName} submitted "${quizName}". AI feedback will be ready on the dashboard shortly.`,
      html,
    });
    return;
  }

  // ══════════════════════════════════════════════════════════════
  // MCQ PATH
  // ══════════════════════════════════════════════════════════════
  const summaryText = topicEntries.length > 0
    ? buildSummary()
    : `<strong>${childName}</strong> just completed <strong>${quizName}</strong> with a score of <strong>${pct}%</strong>. Detailed topic-level feedback is available on the dashboard.`;

  const bodyContent = `
    <p style="margin:0 0 4px;color:#111827;font-size:16px;font-weight:600;">Quiz Results</p>
    <p style="margin:0 0 20px;color:#4b5563;font-size:14px;line-height:1.6;">
      Here's how <strong>${childName}</strong> did:
    </p>

    <!-- Stat tiles — 2×2 -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:8px;">
      <tr>
        <td style="width:50%;padding:4px;">
          <div style="background:${scoreBg};border:1px solid ${scoreBorder};border-radius:10px;padding:16px 12px;text-align:center;">
            <p style="margin:0;font-size:28px;font-weight:700;color:${scoreValCol};">${pct}%</p>
            <p style="margin:6px 0 0;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;">Score</p>
          </div>
        </td>
        <td style="width:50%;padding:4px;">
          <div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;padding:16px 12px;text-align:center;">
            <p style="margin:0;font-size:28px;font-weight:700;color:#4F46E5;">${score?.grade || gi.grade}</p>
            <p style="margin:6px 0 0;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;">Grade</p>
          </div>
        </td>
      </tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:16px;">
      <tr>
        <td style="width:50%;padding:4px;">
          <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px 12px;text-align:center;">
            <p style="margin:0;font-size:24px;font-weight:700;color:#d97706;">${formatDuration(duration)}</p>
            <p style="margin:6px 0 0;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;">Time Spent</p>
          </div>
        </td>
        <td style="width:50%;padding:4px;">
          <div style="background:#f5f3ff;border:1px solid #e9d5ff;border-radius:10px;padding:16px 12px;text-align:center;">
            <p style="margin:0;font-size:24px;font-weight:700;color:#7c3aed;">${score?.points ?? 0}/${score?.available ?? 0}</p>
            <p style="margin:6px 0 0;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;">Points</p>
          </div>
        </td>
      </tr>
    </table>

    <!-- Quiz name badge -->
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;margin-bottom:16px;">
      <p style="margin:0;font-size:11px;color:#059669;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">${subject || "Quiz"}</p>
      <p style="margin:4px 0 0;font-size:14px;color:#111827;font-weight:600;">${quizName} — ${gi.emoji} ${gi.label}</p>
    </div>

    <!-- ✅ Parent Summary -->
    <div style="background:#f8faff;border:1px solid #e0e7ff;border-radius:10px;padding:16px 18px;margin-bottom:16px;">
      <p style="margin:0 0 6px;font-size:11px;font-weight:600;color:#4F46E5;text-transform:uppercase;letter-spacing:0.8px;">Summary for you</p>
      <p style="margin:0;font-size:13px;color:#374151;line-height:1.7;">${summaryText}</p>
    </div>

    <!-- Strengths & Needs Work (only when topic data exists) -->
    ${topicEntries.length > 0 ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:8px;margin-bottom:16px;">
      <tr>
        <td style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px;vertical-align:top;width:50%;">
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:0.5px;">✅ Good at</p>
          ${dotList(strengths, "#059669")}
        </td>
        <td style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px;vertical-align:top;width:50%;">
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:0.5px;">🔴 Next steps</p>
          ${dotList(needsWork, "#dc2626")}
        </td>
      </tr>
    </table>` : ""}

    <!-- CTA -->
    <div style="text-align:center;margin:20px 0 12px;">
      <a href="${DASHBOARD_URL}parent-dashboard"
        style="display:inline-block;background:${BRAND_GRADIENT};color:#ffffff;font-size:14px;font-weight:600;padding:14px 32px;border-radius:8px;text-decoration:none;">
        View Full Results →
      </a>
    </div>
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
      Keep encouraging ${childName} — consistent practice makes a big difference!
    </p>
  `;

  const html = emailWrapper(`${childName}'s Quiz Results`, bodyContent);
  await sendBrevoEmail({
    toEmail: parentEmail,
    subject: `${gi.emoji} ${childName} scored ${pct}% on ${quizName}`,
    text:    `${childName} completed "${quizName}" and scored ${pct}% (${score?.points ?? 0}/${score?.available ?? 0} points). View results at ${DASHBOARD_URL}parent-dashboard`,
    html,
  });
}


// ═══════════════════════════════════════
// 2. WEEKLY PROGRESS EMAIL
// ═══════════════════════════════════════

/**
 * @param {Object} opts
 * @param {string} opts.parentEmail
 * @param {string} opts.childName
 * @param {Object} opts.weeklyStats
 *   - quizzesCompleted: number
 *   - averageScore: number (percentage)
 *   - totalTimeMinutes: number
 *   - bestQuiz: { name, percentage }
 *   - weakestTopics: [{ name, percentage }]
 *   - strongestTopics: [{ name, percentage }]
 *   - scoreChange: number (vs last week, can be negative)
 */
async function sendWeeklyProgressEmail(opts) {
  const { parentEmail, childName, weeklyStats } = opts;

  const {
    quizzesCompleted = 0,
    averageScore = 0,
    totalTimeMinutes = 0,
    bestQuiz,
    weakestTopics = [],
    strongestTopics = [],
    scoreChange = 0,
  } = weeklyStats;

  const trendArrow = scoreChange > 0 ? "↑" : scoreChange < 0 ? "↓" : "→";
  const trendColor = scoreChange > 0 ? "#059669" : scoreChange < 0 ? "#dc2626" : "#6b7280";
  const trendText = scoreChange > 0
    ? `+${scoreChange}% from last week`
    : scoreChange < 0
      ? `${scoreChange}% from last week`
      : "Same as last week";

  // Build strengths / weaknesses
  function topicListHtml(topics, color) {
    if (!topics.length) return `<p style="color:#9ca3af;font-size:13px;margin:4px 0;">No data yet</p>`;
    return topics
      .slice(0, 3)
      .map(t => `<p style="margin:4px 0;font-size:13px;color:#374151;">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:8px;vertical-align:middle;"></span>
        ${t.name} <span style="color:#9ca3af;">(${t.percentage}%)</span>
      </p>`)
      .join("");
  }

  const bodyContent = `
    <!-- Greeting -->
    <p style="margin:0 0 4px;color:#111827;font-size:16px;font-weight:600;">
      Weekly Progress Report
    </p>
    <p style="margin:0 0 24px;color:#4b5563;font-size:14px;line-height:1.6;">
      Here's how <strong>${childName}</strong> did this week:
    </p>

    <!-- Stats Grid (2x2) -->
    <table style="width:100%;border-collapse:separate;border-spacing:8px;margin-bottom:20px;" cellpadding="0" cellspacing="0">
      <tr>
        <!-- Quizzes -->
        <td style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;text-align:center;width:50%;">
          <p style="margin:0;font-size:28px;font-weight:800;color:#059669;">
            ${quizzesCompleted}
          </p>
          <p style="margin:4px 0 0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">
            Quizzes Done
          </p>
        </td>
        <!-- Average -->
        <td style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;padding:16px;text-align:center;width:50%;">
          <p style="margin:0;font-size:28px;font-weight:800;color:${BRAND_COLOR};">
            ${averageScore}%
          </p>
          <p style="margin:4px 0 0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">
            Avg Score
          </p>
        </td>
      </tr>
      <tr>
        <!-- Time -->
        <td style="background:#fefce8;border:1px solid #fde68a;border-radius:10px;padding:16px;text-align:center;width:50%;">
          <p style="margin:0;font-size:28px;font-weight:800;color:#d97706;">
            ${totalTimeMinutes}m
          </p>
          <p style="margin:4px 0 0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">
            Time Spent
          </p>
        </td>
        <!-- Trend -->
        <td style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:10px;padding:16px;text-align:center;width:50%;">
          <p style="margin:0;font-size:28px;font-weight:800;color:${trendColor};">
            ${trendArrow} ${Math.abs(scoreChange)}%
          </p>
          <p style="margin:4px 0 0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">
            vs Last Week
          </p>
        </td>
      </tr>
    </table>

    ${bestQuiz ? `
    <!-- Best Quiz -->
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
      <p style="margin:0;font-size:11px;color:#059669;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">
        Best Quiz This Week
      </p>
      <p style="margin:4px 0 0;font-size:14px;color:#111827;font-weight:600;">
        ${bestQuiz.name} — ${bestQuiz.percentage}%
      </p>
    </div>
    ` : ""}

    <!-- Strengths & Weaknesses -->
    <table style="width:100%;border-collapse:separate;border-spacing:8px;margin-bottom:24px;" cellpadding="0" cellspacing="0">
      <tr>
        <td style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;vertical-align:top;width:50%;">
          <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:0.5px;">
            ✅ Strengths
          </p>
          ${topicListHtml(strongestTopics, "#059669")}
        </td>
        <td style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px;vertical-align:top;width:50%;">
          <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:0.5px;">
            🔴 Needs Work
          </p>
          ${topicListHtml(weakestTopics, "#dc2626")}
        </td>
      </tr>
    </table>

    <!-- CTA -->
    <div style="text-align:center;margin:28px 0 16px;">
      <a href="${DASHBOARD_URL}parent-dashboard"
         style="display:inline-block;background:${BRAND_GRADIENT};color:#ffffff;font-size:14px;font-weight:600;padding:14px 32px;border-radius:8px;text-decoration:none;">
        View Detailed Progress →
      </a>
    </div>

    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
      Keep encouraging ${childName} — consistent practice makes a big difference!
    </p>
  `;

  const html = emailWrapper(`${childName}'s Weekly Progress`, bodyContent);

  await sendBrevoEmail({
    toEmail: parentEmail,
    subject: `${childName}'s Weekly Progress: ${quizzesCompleted} quiz${quizzesCompleted !== 1 ? "zes" : ""}, ${averageScore}% avg`,
    text: `${childName}'s weekly progress: ${quizzesCompleted} quizzes completed, ${averageScore}% average score. View at ${DASHBOARD_URL}parent-dashboard`,
    html,
  });
}

// ═══════════════════════════════════════
// HELPER: Check if parent wants emails for a child
// ═══════════════════════════════════════

/**
 * Looks up child → parent, checks email_notifications flag.
 * Returns { shouldSend, parentEmail } or { shouldSend: false }
 */
async function checkNotificationEligibility(childId) {
  try {
    const child = await Child.findById(childId).lean();
    if (!child || !child.email_notifications) {
      return { shouldSend: false };
    }

    const parent = await Parent.findById(child.parent_id).lean();
    if (!parent?.email) {
      return { shouldSend: false };
    }

    return {
      shouldSend: true,
      parentEmail: parent.email,
      childName: child.display_name || child.username,
      yearLevel: child.year_level,
    };
  } catch (err) {
    console.error("checkNotificationEligibility error:", err.message);
    return { shouldSend: false };
  }
}

module.exports = {
  sendQuizCompletionEmail,
  sendWeeklyProgressEmail,
  checkNotificationEligibility,
};
