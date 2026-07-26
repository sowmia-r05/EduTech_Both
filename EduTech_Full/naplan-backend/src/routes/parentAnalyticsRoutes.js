/**
 * routes/parentAnalyticsRoutes.js
 *
 * Parent access analytics: who has USED the platform vs who signed up and never
 * came back. Admin-only.
 *
 *   GET /api/admin/analytics/parents          → counts + both lists (JSON)
 *   GET /api/admin/analytics/parents/export   → CSV download
 *
 * "USED" = any of three signals, using ONLY fields that exist today:
 *   • logged_in     → parent.email_verified === true
 *                     (OTP/Google auth completes ⇒ email_verified; parent.js has
 *                      no last_login_at, so this is the honest login proxy.)
 *   • purchased     → a Purchase for this parent with status ∈ {paid, refunded}
 *   • child_activity→ a Child of theirs with last_activity_at / last_login_at set
 *                     or login_count > 0 (last_activity_at denormalises quiz
 *                     submits, so no QuizAttempt join is needed).
 *
 * Only status ∈ {active, pending} parents are analysed; suspended/deleted are
 * excluded — they are removed accounts, not dormant users.
 *
 * Cost: 3 queries total (Parent.find + Purchase.distinct + Child.distinct),
 * classified in memory. Safe for M0. Cached per-instance for 60s.
 */

const express = require("express");
const router = express.Router();

const { adminOnly } = require("../middleware/adminAuth");
const connectDB = require("../config/db");
const Parent = require("../models/parent");
const Child = require("../models/child");
const Purchase = require("../models/purchase");

// A purchase counts once the money actually moved (refunds still prove usage).
const PAID_STATUSES = ["paid", "refunded"];
// Parent statuses we treat as "current users" for this report.
const ALLOWED_STATUSES = ["active", "pending", "suspended", "deleted"];
const DEFAULT_STATUSES = ["active", "pending"];

// ── tiny per-instance cache (60s) ─────────────────────────────────────────────
const CACHE_TTL_MS = 60 * 1000;
let _cache = { key: null, at: 0, payload: null };

function cacheGet(key) {
  if (_cache.key === key && Date.now() - _cache.at < CACHE_TTL_MS) {
    return _cache.payload;
  }
  return null;
}
function cacheSet(key, payload) {
  _cache = { key, at: Date.now(), payload };
}

function parseStatuses(raw) {
  if (!raw) return DEFAULT_STATUSES;
  const list = String(raw)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => ALLOWED_STATUSES.includes(s));
  return list.length ? list : DEFAULT_STATUSES;
}

// ── core classification ───────────────────────────────────────────────────────
async function computeParentAccess(statuses) {
  const [parents, purchasedIds, activeChildParentIds] = await Promise.all([
    Parent.find(
      { status: { $in: statuses } },
      {
        email: 1,
        firstName: 1,
        lastName: 1,
        email_verified: 1,
        status: 1,
        stripe_customer_id: 1,
        createdAt: 1,
      },
    ).lean(),
    Purchase.distinct("parent_id", { status: { $in: PAID_STATUSES } }),
    Child.distinct("parent_id", {
      $or: [
        { login_count: { $gt: 0 } },
        { last_activity_at: { $ne: null } },
        { last_login_at: { $ne: null } },
      ],
    }),
  ]);

  const paidSet = new Set(purchasedIds.map(String));
  const childActiveSet = new Set(activeChildParentIds.map(String));

  const used = [];
  const notUsed = [];

  for (const p of parents) {
    const id = String(p._id);
    const logged_in = p.email_verified === true;
    const purchased = paidSet.has(id);
    const child_activity = childActiveSet.has(id);
    const isUsed = logged_in || purchased || child_activity;

    const row = {
      parent_id: id,
      email: p.email,
      name: `${p.firstName || ""} ${p.lastName || ""}`.trim(),
      status: p.status,
      created_at: p.createdAt,
    };

    if (isUsed) {
      used.push({ ...row, signals: { logged_in, purchased, child_activity } });
    } else {
      notUsed.push(row);
    }
  }

  // Newest first — most relevant for an admin scanning recent signups.
  const byNewest = (a, b) => new Date(b.created_at) - new Date(a.created_at);
  used.sort(byNewest);
  notUsed.sort(byNewest);

  return {
    generated_at: new Date(),
    statuses,
    definition: {
      logged_in: "email_verified === true (OTP/Google auth completed at least once)",
      purchased: `Purchase status in [${PAID_STATUSES.join(", ")}]`,
      child_activity:
        "a child with last_activity_at / last_login_at set, or login_count > 0",
      note:
        "parent.js has no last_login_at yet; 'logged_in' is a proxy via email_verified.",
    },
    totals: {
      parents_considered: parents.length,
      used: used.length,
      not_used: notUsed.length,
      breakdown_of_used: {
        logged_in: used.filter((u) => u.signals.logged_in).length,
        purchased: used.filter((u) => u.signals.purchased).length,
        child_activity: used.filter((u) => u.signals.child_activity).length,
      },
    },
    used,
    not_used: notUsed,
  };
}

// ── GET /api/admin/analytics/parents ──────────────────────────────────────────
router.get("/", adminOnly, async (req, res) => {
  try {
    await connectDB();
    const statuses = parseStatuses(req.query.status);
    const key = statuses.join(",");

    const cached = cacheGet(key);
    if (cached) return res.json({ ...cached, cached: true });

    const payload = await computeParentAccess(statuses);
    cacheSet(key, payload);
    return res.json(payload);
  } catch (err) {
    console.error("[parent-analytics] failed:", err);
    return res.status(500).json({ error: "Failed to compute parent analytics" });
  }
});

// ── GET /api/admin/analytics/parents/export  (CSV) ────────────────────────────
router.get("/export", adminOnly, async (req, res) => {
  try {
    await connectDB();
    const statuses = parseStatuses(req.query.status);
    const { used, not_used } = await computeParentAccess(statuses);

    const esc = (v) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const header = [
      "email",
      "name",
      "status",
      "used",
      "logged_in",
      "purchased",
      "child_activity",
      "created_at",
    ];
    const lines = [header.join(",")];

    for (const u of used) {
      lines.push(
        [
          u.email,
          u.name,
          u.status,
          "yes",
          u.signals.logged_in,
          u.signals.purchased,
          u.signals.child_activity,
          u.created_at ? new Date(u.created_at).toISOString() : "",
        ].map(esc).join(","),
      );
    }
    for (const n of not_used) {
      lines.push(
        [n.email, n.name, n.status, "no", false, false, false,
          n.created_at ? new Date(n.created_at).toISOString() : ""]
          .map(esc).join(","),
      );
    }

    const csv = lines.join("\n");
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="parent-access-${stamp}.csv"`,
    );
    return res.send(csv);
  } catch (err) {
    console.error("[parent-analytics] export failed:", err);
    return res.status(500).json({ error: "Failed to export parent analytics" });
  }
});

module.exports = router;