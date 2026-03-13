/**
 * jobs/weeklyProgressCron.js
 *
 * In-process weekly cron for progress emails.
 * Runs inside server.js — no extra Render service needed.
 */

const Child = require("../models/child");
const Parent = require("../models/parent");
const QuizAttempt = require("../models/quizAttempt");
const { sendWeeklyProgressEmail } = require("../services/emailNotifications");

function scheduleWeekly() {
  // Check every hour if it's time to send
  const INTERVAL = 60 * 60 * 1000; // 1 hour
  let lastRunDate = null;

  setInterval(async () => {
    const now = new Date();
    const utcDay = now.getUTCDay();    // 0 = Sunday
    const utcHour = now.getUTCHours(); // 22 = 8am AEST

    // Run on Sunday 10pm UTC (= Monday 8am AEST)
    if (utcDay !== 0 || utcHour !== 22) return;

    // Prevent running twice in the same day
    const today = now.toISOString().slice(0, 10);
    if (lastRunDate === today) return;
    lastRunDate = today;

    console.log("📧 Weekly progress email cron triggered...");

    try {
      const children = await Child.find({ email_notifications: true }).lean();
      console.log(`  Found ${children.length} children with notifications enabled`);

      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      let sent = 0;

      for (const child of children) {
        try {
          const parent = await Parent.findById(child.parent_id).lean();
          if (!parent?.email) continue;

          const thisWeek = await QuizAttempt.find({
            child_id: child._id,
            status: { $in: ["scored", "ai_done"] },
            submitted_at: { $gte: oneWeekAgo },
          }).lean();

          if (thisWeek.length === 0) continue;

          const lastWeek = await QuizAttempt.find({
            child_id: child._id,
            status: { $in: ["scored", "ai_done"] },
            submitted_at: { $gte: twoWeeksAgo, $lt: oneWeekAgo },
          }).lean();

          // Stats
          const quizzesCompleted = thisWeek.length;
          const averageScore = Math.round(
            thisWeek.reduce((s, a) => s + (a.score?.percentage || 0), 0) / quizzesCompleted
          );
          const totalTimeMinutes = Math.round(
            thisWeek.reduce((s, a) => s + (a.duration_sec || 0), 0) / 60
          );

          const sorted = [...thisWeek].sort((a, b) => (b.score?.percentage || 0) - (a.score?.percentage || 0));
          const bestQuiz = sorted[0]
            ? { name: sorted[0].quiz_name || "Practice Quiz", percentage: sorted[0].score?.percentage || 0 }
            : null;

          const lastWeekAvg = lastWeek.length > 0
            ? Math.round(lastWeek.reduce((s, a) => s + (a.score?.percentage || 0), 0) / lastWeek.length)
            : averageScore;

          // Topic aggregation
          const topicAgg = {};
          for (const a of thisWeek) {
            const tb = a.topic_breakdown instanceof Map
              ? Object.fromEntries(a.topic_breakdown)
              : (a.topic_breakdown || {});
            for (const [name, data] of Object.entries(tb)) {
              if (!topicAgg[name]) topicAgg[name] = { scored: 0, total: 0 };
              topicAgg[name].scored += data.scored || 0;
              topicAgg[name].total += data.total || 0;
            }
          }

          const topicList = Object.entries(topicAgg)
            .map(([name, d]) => ({
              name,
              percentage: d.total > 0 ? Math.round((d.scored / d.total) * 100) : 0,
            }))
            .sort((a, b) => a.percentage - b.percentage);

          await sendWeeklyProgressEmail({
            parentEmail: parent.email,
            childName: child.display_name || child.username,
            weeklyStats: {
              quizzesCompleted,
              averageScore,
              totalTimeMinutes,
              bestQuiz,
              weakestTopics: topicList.slice(0, 3),
              strongestTopics: [...topicList].reverse().slice(0, 3),
              scoreChange: averageScore - lastWeekAvg,
            },
          });

          sent++;
          console.log(`  ✅ Sent to ${parent.email} for ${child.display_name}`);
        } catch (err) {
          console.error(`  ❌ Failed for child ${child._id}:`, err.message);
        }
      }

      console.log(`📧 Weekly job done: ${sent} emails sent`);
    } catch (err) {
      console.error("📧 Weekly cron error:", err.message);
    }
  }, INTERVAL);

  console.log("⏰ Weekly progress email cron scheduled (Monday 8am AEST)");
}

module.exports = { scheduleWeekly };