// src/chat/getChildHistory.js

const cache  = new Map();
const TTL_MS = 10 * 60 * 1000; // 10 minutes

async function getChildHistory(childId, db) {

  // ── L1: Node memory cache ──────────────────────
  const hit = cache.get(childId);
  if (hit && hit.expiresAt > Date.now()) return hit.data;

  // ── Guard ──────────────────────────────────────
  if (!db) return null;

  // ── L2: MongoDB ────────────────────────────────
  const attempts = await db.collection("quiz_attempts")
    .find(
      { child_id: childId, status: "completed" },
      {
        projection: {
          quiz_id:            1,
          quiz_name:          1,
          subject:            1,
          "score.percentage": 1,
          topic_breakdown:    1,
          submitted_at:       1,
        },
      }
    )
    .sort({ submitted_at: -1 })
    .limit(50)
    .toArray();

  const writing = await db.collection("writing_responses")
    .find(
      { child_id: childId },
      {
        projection: {
          quiz_name:                         1,
          "ai.feedback.overall.band":        1,
          "ai.feedback.overall.total_score": 1,
          "ai.feedback.overall.max_score":   1,
          submitted_at:                      1,
        },
      }
    )
    .sort({ submitted_at: -1 })
    .limit(10)
    .toArray();

  // Aggregate per-subject stats
  const bySubject = {};
  for (const a of attempts) {
    const subj = a.subject || "General";
    if (!bySubject[subj]) bySubject[subj] = { scores: [], topics: {} };
    const pct = Math.round(a.score?.percentage || 0);
    bySubject[subj].scores.push(pct);
    for (const [topic, vals] of Object.entries(a.topic_breakdown || {})) {
      if (!bySubject[subj].topics[topic])
        bySubject[subj].topics[topic] = { scored: 0, total: 0 };
      bySubject[subj].topics[topic].scored += vals.scored || 0;
      bySubject[subj].topics[topic].total  += vals.total  || 0;
    }
  }

  // Build plain-text history block
  const lines = ["=== STUDENT HISTORY (all quizzes) ==="];
  lines.push(`Total attempts: ${attempts.length + writing.length}`);

  for (const [subj, data] of Object.entries(bySubject)) {
    if (!data.scores.length) continue;
    const avg    = Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length);
    const best   = Math.max(...data.scores);
    const latest = data.scores[0];
    const trend  = data.scores.length >= 4
      ? (data.scores.slice(-3).reduce((a, b) => a + b, 0) / 3 >
         data.scores.slice(0, 3).reduce((a, b) => a + b, 0) / 3
          ? "improving" : "declining")
      : "early";

    lines.push(`\n${subj}: ${data.scores.length} attempt(s) | avg ${avg}% | best ${best}% | latest ${latest}% | trend: ${trend}`);

    const topicList = Object.entries(data.topics)
      .map(([t, v]) => ({ t, pct: v.total ? Math.round(v.scored / v.total * 100) : 0 }))
      .sort((a, b) => b.pct - a.pct);

    const strong = topicList.filter(x => x.pct >= 70).map(x => `${x.t}(${x.pct}%)`);
    const weak   = topicList.filter(x => x.pct <  50).map(x => `${x.t}(${x.pct}%)`);

    if (strong.length) lines.push(`  Strong: ${strong.slice(0, 3).join(", ")}`);
    if (weak.length)   lines.push(`  Needs work: ${weak.slice(0, 3).join(", ")}`);
  }

  if (writing.length) {
    lines.push(`\nWriting: ${writing.length} submission(s)`);
    for (const w of writing) {
      const band = w?.ai?.feedback?.overall?.band;
      if (band) lines.push(`  ${w.quiz_name || "Writing"}: ${band}`);
    }
  }

  lines.push("\n=== END HISTORY ===");
  const data = lines.join("\n");

  cache.set(childId, { data, expiresAt: Date.now() + TTL_MS });
  return data;
}

function invalidateChildHistory(childId) {
  cache.delete(childId);
}

module.exports = { getChildHistory, invalidateChildHistory };