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
// 1. QUIZ COMPLETION EMAIL
// ═══════════════════════════════════════

/**
 * @param {Object} opts
 * @param {string} opts.parentEmail
 * @param {string} opts.childName
 * @param {string} opts.quizName
 * @param {Object} opts.score       - { points, available, percentage, grade }
 * @param {Object} opts.topicBreakdown - { "Topic": { scored, total }, ... }
 * @param {number} opts.duration    - seconds
 * @param {string} [opts.subject]   - e.g. "Numeracy"
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
  const pct = score?.percentage || 0;
  const gi = gradeInfo(pct);

  const scoreCardHtml = isWriting
    ? `
  <div style="background:#f5f3ff;border:2px solid #e9d5ff;border-radius:12px;padding:28px;text-align:center;margin-bottom:24px;">
    <p style="margin:0;font-size:36px;">✍️</p>
    <p style="margin:8px 0 4px;color:#7c3aed;font-size:22px;font-weight:800;">Writing Submitted!</p>
    <p style="margin:0;color:#6b7280;font-size:14px;line-height:1.6;">
      ${childName}'s writing is being evaluated by our AI.<br/>
      Full feedback will appear on the dashboard in 1–2 minutes.
    </p>
    ${duration ? `<p style="margin:8px 0 0;color:#9ca3af;font-size:12px;">Time spent: ${formatDuration(duration)}</p>` : ""}
  </div>
`
    : `
  <div style="background:${gi.color};border-radius:12px;padding:28px;text-align:center;margin-bottom:24px;">
    <p style="margin:0;font-size:36px;">${gi.emoji}</p>
    <p style="margin:8px 0 4px;color:#ffffff;font-size:40px;font-weight:800;letter-spacing:-1px;">${pct}%</p>
    <p style="margin:0 0 4px;color:rgba(255,255,255,0.9);font-size:16px;font-weight:600;">${gi.label}</p>
    <p style="margin:0;color:rgba(255,255,255,0.75);font-size:13px;">
      ${score?.points || 0} / ${score?.available || 0} points &nbsp;·&nbsp; Grade ${score?.grade || gi.grade} &nbsp;·&nbsp; ${formatDuration(duration)}
    </p>
  </div>
`;

  // Build topic rows
  const topicEntries = Object.entries(topicBreakdown).sort((a, b) => {
    const pA = a[1].total > 0 ? a[1].scored / a[1].total : 0;
    const pB = b[1].total > 0 ? b[1].scored / b[1].total : 0;
    return pA - pB; // weakest first
  });

  const topicRowsHtml =
      topicEntries.length > 0
        ? topicEntries
            .map(([n, d]) => topicBarHtml(n, d.scored, d.total))
            .join("")
    : `<tr><td colspan="3" style="padding:12px 0;color:#9ca3af;font-size:13px;text-align:center;">No topic data available</td></tr>`;

  // ✅ Topic breakdown — only for MCQ
  const topicSectionHtml = isWriting
    ? ""
    : `
  <p style="margin:0 0 12px;color:#111827;font-size:14px;font-weight:600;">Topic Breakdown</p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px;" cellpadding="0" cellspacing="0">
    ${topicRowsHtml}
  </table>
  `;

  const bodyContent = `
    <p style="margin:0 0 4px;color:#111827;font-size:16px;font-weight:600;">Hi there,</p>
    <p style="margin:0 0 24px;color:#4b5563;font-size:14px;line-height:1.6;">
      <strong>${childName}</strong> just completed a quiz! Here's how they did:
    </p>

    <!-- Quiz Name Badge -->
    <div style="background:#f0f0ff;border:1px solid #e0e7ff;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
      <p style="margin:0;color:#6366f1;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">${subject || "Quiz"}</p>
      <p style="margin:4px 0 0;color:#1e1b4b;font-size:15px;font-weight:600;">${quizName}</p>
    </div>

    ${scoreCardHtml}
    ${topicSectionHtml}

    <div style="text-align:center;margin:28px 0 16px;">
      <a href="${DASHBOARD_URL}parent-dashboard"
        style="display:inline-block;background:${BRAND_GRADIENT};color:#ffffff;font-size:14px;font-weight:600;padding:14px 32px;border-radius:8px;text-decoration:none;">
        View Full Results →
      </a>
    </div>

    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
      Detailed AI-powered feedback is available on the dashboard.
    </p>
  `;

  const html = emailWrapper(`${childName}'s Quiz Results`, bodyContent);

  await sendBrevoEmail({
    toEmail: parentEmail,
    // ✅ Different subject for writing vs MCQ
    subject: isWriting
      ? `✍️ ${childName} submitted their Writing Quiz`
      : `${gi.emoji} ${childName} scored ${pct}% on ${quizName}`,
    text: isWriting
      ? `${childName} submitted "${quizName}". AI feedback will be ready on the dashboard shortly.`
      : `${childName} completed "${quizName}" and scored ${pct}% (${score?.points || 0}/${score?.available || 0}). View results at ${DASHBOARD_URL}parent-dashboard`,
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
