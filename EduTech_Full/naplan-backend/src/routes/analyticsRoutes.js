/**
 * routes/analyticsRoutes.js  (v1 — ENGAGE-1)
 *
 * Admin-only engagement analytics.
 *
 *   GET /api/admin/analytics/engagement            → cohort counts
 *   GET /api/admin/analytics/engagement/:cohort    → paginated drilldown
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ THE THING THAT MAKES THIS NON-OBVIOUS: TWO ACTIVITY COLLECTIONS
 *
 *   aiFeedbackService.saveWritingToCollection() ends with
 *       await QuizAttempt.deleteOne({ attempt_id: attemptId });
 *
 *   Writing attempts are MOVED to the Writing collection, not copied. So a
 *   child who only ever does writing tasks has ZERO QuizAttempt documents.
 *
 *   Any dormancy query built on QuizAttempt alone would report your most
 *   engaged writing students as "never quizzed" and mail them a re-engagement
 *   nudge. Both collections must be unioned. Every activity lookup below does.
 *
 *   If a third activity collection is ever added, it must be added to
 *   lastActivityByChild() or this silently under-reports again.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ON THE CACHE
 *
 *   This is a per-process in-memory cache, which normally violates the
 *   stateless-web-tier rule. It is deliberate and safe here, because a CACHE is
 *   not STATE: nothing is read back as truth, entries are recomputed on miss,
 *   and the worst case with N instances is N recomputations instead of one.
 *   Contrast with the OTP store or rate-limit counters, which ARE state and
 *   correctly live in Mongo.
 *
 *   Admin-only, low-traffic, and the aggregations are collection scans that M0
 *   should not repeat on every dashboard refresh.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ VERIFY BEFORE MOUNTING — two things I could not confirm from source:
 *   1. The middleware export names/path below. adminRoutes.js uses `adminOnly`
 *      and reads req.admin.role. Match whatever that file imports.
 *   2. The Writing model path (../models/writing).
 */

const router = require("express").Router();
const connectDB = require("../config/db");

const Child = require("../models/child");
const QuizAttempt = require("../models/quizAttempt");
const Writing = require("../models/writing");

const { adminOnly } = require("../middleware/adminAuth");
const {
  ATTEMPT_STATUS,
  FEEDBACK_STATUS,
} = require("../constants/attemptStatus");

const DORMANT_DAYS = 14;
const LAPSED_DAYS = 30;
const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_PAGE_SIZE = 50;

const COHORTS = [
  "never_logged_in",
  "logged_in_never_quizzed",
  "dormant",
  "lapsed",
  "stalled",
  "active",
];

const _cache = new Map();

function cacheGet(key) {
  const hit = _cache.get(key);
  if (!hit || Date.now() > hit.expires) return null;
  return hit.value;
}

function cacheSet(key, value) {
  _cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
}

function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

/**
 * Most recent completed activity per child, across BOTH activity collections.
 * Returns Map<childIdString, Date>.
 *
 * Uses submitted_at, not createdAt — starting a quiz and abandoning it is not
 * engagement, and counting it would hide exactly the children this is meant to
 * surface.
 */
async function lastActivityByChild() {
  const [attempts, writings] = await Promise.all([
    QuizAttempt.aggregate([
      { $match: { submitted_at: { $ne: null } } },
      { $group: { _id: "$child_id", last: { $max: "$submitted_at" } } },
    ]),
    Writing.aggregate([
      { $match: { submitted_at: { $ne: null } } },
      { $group: { _id: "$child_id", last: { $max: "$submitted_at" } } },
    ]),
  ]);

  const map = new Map();
  for (const row of [...attempts, ...writings]) {
    if (!row._id) continue;
    const id = String(row._id);
    const prev = map.get(id);
    if (!prev || row.last > prev) map.set(id, row.last);
  }
  return map;
}

/**
 * Children with an attempt stuck in_progress past its expiry.
 *
 * The cleanupExpiredAttempts cron flips these to "expired" every 5 minutes, so
 * a genuinely stalled attempt is usually already reclassified. We therefore
 * count EXPIRED attempts in the recent window rather than live in_progress
 * rows — expired IS the fingerprint of "started and never finished".
 *
 * This is where an iOS Safari fullscreen problem would surface (Tracker row
 * IOS-SAFARI): a device-specific proctor failure arrives as a pile of expired
 * attempts, not as a bug report.
 */
async function stalledChildIds() {
  const rows = await QuizAttempt.aggregate([
    {
      $match: {
        status: ATTEMPT_STATUS.EXPIRED,
        started_at: { $gte: daysAgo(LAPSED_DAYS) },
      },
    },
    { $group: { _id: "$child_id", n: { $sum: 1 } } },
  ]);
  return new Set(rows.map((r) => String(r._id)));
}

/**
 * Classify every child into exactly one cohort. Order matters — the first
 * match wins, so the buckets are mutually exclusive and sum to the total.
 */
async function classify() {
  const [children, activity, stalled] = await Promise.all([
    Child.find({}, {
      display_name: 1,
      username: 1,
      year_level: 1,
      status: 1,
      parent_id: 1,
      last_login_at: 1,
      login_count: 1,
      createdAt: 1,
    }).lean(),
    lastActivityByChild(),
    stalledChildIds(),
  ]);

  const dormantCut = daysAgo(DORMANT_DAYS);
  const lapsedCut = daysAgo(LAPSED_DAYS);

  const buckets = {};
  for (const c of COHORTS) buckets[c] = [];

  for (const child of children) {
    const id = String(child._id);
    const last = activity.get(id) || null;
    const row = {
      child_id: id,
      display_name: child.display_name,
      username: child.username,
      year_level: child.year_level,
      status: child.status,
      parent_id: child.parent_id ? String(child.parent_id) : null,
      last_login_at: child.last_login_at || null,
      login_count: child.login_count || 0,
      last_activity_at: last,
      created_at: child.createdAt,
    };

    // last_login_at is null both for a child who never logged in AND for every
    // child who last logged in before the stamping deploy. Until enough time
    // has passed, treat a child WITH activity but no recorded login as active
    // rather than "never logged in" — activity proves a login happened.
    if (!child.last_login_at && !last) {
      buckets.never_logged_in.push(row);
    } else if (!last) {
      buckets.logged_in_never_quizzed.push(row);
    } else if (last < lapsedCut) {
      buckets.lapsed.push(row);
    } else if (last < dormantCut) {
      buckets.dormant.push(row);
    } else if (stalled.has(id)) {
      buckets.stalled.push(row);
    } else {
      buckets.active.push(row);
    }
  }

  return buckets;
}

// ═══════════════════════════════════════════════════════════
// GET /api/admin/analytics/engagement
// ═══════════════════════════════════════════════════════════
router.get("/engagement", adminOnly, async (req, res) => {
  try {
    await connectDB();

    const cached = cacheGet("engagement:summary");
    if (cached) return res.json({ ...cached, cached: true });

    const buckets = await classify();

    // AI feedback failure rate — parents who paid for feedback they never got.
    // Writing failures live in Writing.ai.status, MCQ failures in
    // QuizAttempt.ai_feedback_meta.status. Both counted.
    const [mcqTotal, mcqErr, wTotal, wErr] = await Promise.all([
      QuizAttempt.countDocuments({ submitted_at: { $ne: null } }),
      QuizAttempt.countDocuments({
        submitted_at: { $ne: null },
        "ai_feedback_meta.status": FEEDBACK_STATUS.ERROR,
      }),
      Writing.countDocuments({ submitted_at: { $ne: null } }),
      Writing.countDocuments({
        submitted_at: { $ne: null },
        "ai.status": "error",
      }),
    ]);

    const totalFeedback = mcqTotal + wTotal;
    const failedFeedback = mcqErr + wErr;

    const payload = {
      generated_at: new Date(),
      window: { dormant_days: DORMANT_DAYS, lapsed_days: LAPSED_DAYS },
      cohorts: Object.fromEntries(
        COHORTS.map((c) => [c, buckets[c].length]),
      ),
      total_children: COHORTS.reduce((n, c) => n + buckets[c].length, 0),
      ai_feedback: {
        total: totalFeedback,
        failed: failedFeedback,
        failure_rate_pct:
          totalFeedback > 0
            ? Number(((failedFeedback / totalFeedback) * 100).toFixed(1))
            : 0,
      },
      cached: false,
    };

    cacheSet("engagement:summary", payload);
    cacheSet("engagement:buckets", buckets);
    return res.json(payload);
  } catch (err) {
    console.error("analytics/engagement error:", err.message);
    return res.status(500).json({ error: "Failed to build engagement report" });
  }
});

// ═══════════════════════════════════════════════════════════
// GET /api/admin/analytics/engagement/:cohort?page=1
// ═══════════════════════════════════════════════════════════
router.get("/engagement/:cohort", adminOnly, async (req, res) => {
  try {
    await connectDB();

    const cohort = String(req.params.cohort || "");
    if (!COHORTS.includes(cohort)) {
      return res.status(400).json({
        error: "Unknown cohort",
        valid: COHORTS,
      });
    }

    // Page size is clamped SERVER-side. A client-supplied limit is a request,
    // not an instruction — ?limit=100000 on an M0 instance is a self-inflicted
    // outage.
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, parseInt(req.query.limit, 10) || 25),
    );

    let buckets = cacheGet("engagement:buckets");
    if (!buckets) {
      buckets = await classify();
      cacheSet("engagement:buckets", buckets);
    }

    const all = buckets[cohort] || [];
    // Oldest activity first — the most neglected accounts surface at the top.
    const sorted = [...all].sort((a, b) => {
      const av = a.last_activity_at || a.last_login_at || a.created_at || 0;
      const bv = b.last_activity_at || b.last_login_at || b.created_at || 0;
      return new Date(av) - new Date(bv);
    });

    const start = (page - 1) * limit;
    return res.json({
      cohort,
      total: sorted.length,
      page,
      limit,
      pages: Math.ceil(sorted.length / limit) || 1,
      results: sorted.slice(start, start + limit),
    });
  } catch (err) {
    console.error("analytics/engagement/:cohort error:", err.message);
    return res.status(500).json({ error: "Failed to load cohort" });
  }
});

module.exports = router;