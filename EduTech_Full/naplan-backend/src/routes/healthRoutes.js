// src/routes/healthRoutes.js
//
// Health + metrics endpoints.
//
//   GET /api/health          → lightweight ping (no DB, no auth)      [unchanged]
//   GET /api/health/ready    → MongoDB readyState check               [unchanged]
//   GET /api/health/metrics  → full metrics JSON       [ADMIN AUTH REQUIRED]
//   GET /api/health/deep     → threshold check, 503 on breach  [token in query]
//
// Registered in app.js as: app.use("/api", healthRoutes);

const router   = require("express").Router();
const mongoose = require("mongoose");

const { snapshot } = require("../utils/metrics");
const { stats: pythonStats } = require("../utils/pythonSpawnLimiter");
const { requireAdmin } = require("../middleware/adminAuth");

// ─── Alert thresholds ────────────────────────────────────────────────────────
// Tune these after you have a baseline. Guessing thresholds before you know
// your normal p95 produces alerts you learn to ignore, which is worse than
// no alerting at all.
const T = {
  P95_MS:            Number(process.env.ALERT_P95_MS            || 3000),
  ERROR_RATE:        Number(process.env.ALERT_ERROR_RATE        || 0.05), // 5% of window
  PYTHON_QUEUE:      Number(process.env.ALERT_PYTHON_QUEUE      || 8),    // of MAX_PYTHON_QUEUE=10
  DB_POOL_PENDING:   Number(process.env.ALERT_DB_POOL_PENDING   || 5),
  HEAP_USED_MB:      Number(process.env.ALERT_HEAP_USED_MB      || 400),  // of 512MB instance
};

const DEEP_TOKEN = process.env.HEALTH_CHECK_TOKEN || "";

// ─── MongoDB pool monitoring ─────────────────────────────────────────────────
//
// Read client-side from driver CMAP events, NOT from serverStatus().
//
// This matters: Atlas M0 restricts db.serverStatus(), so the obvious approach
// throws "not authorized" on your actual production cluster while working fine
// against a local mongod. Driver events are emitted by the client and work on
// any tier.
const pool = {
  created: 0,   // sockets opened
  closed:  0,   // sockets closed
  checkedOut: 0,
  pending: 0,   // waiters queued for a connection — the number that matters
  attached: false,
};

function attachPoolMonitor() {
  if (pool.attached) return;
  let client;
  try {
    client = mongoose.connection.getClient();
  } catch {
    return; // not connected yet; retried on next request
  }
  if (!client) return;

  client.on("connectionCreated",       () => { pool.created += 1; });
  client.on("connectionClosed",        () => { pool.closed  += 1; });
  client.on("connectionCheckedOut",    () => { pool.checkedOut += 1; });
  client.on("connectionCheckedIn",     () => { if (pool.checkedOut > 0) pool.checkedOut -= 1; });
  client.on("connectionCheckOutStarted", () => { pool.pending += 1; });
  client.on("connectionCheckOutFailed",  () => { if (pool.pending > 0) pool.pending -= 1; });
  client.on("connectionCheckedOut",      () => { if (pool.pending > 0) pool.pending -= 1; });

  pool.attached = true;
  console.log("Mongo pool monitor attached");
}

function dbSnapshot() {
  attachPoolMonitor();
  const state = mongoose.connection.readyState;
  return {
    state: ["disconnected", "connected", "connecting", "disconnecting"][state] || "unknown",
    ready: state === 1,
    pool: {
      open:    pool.created - pool.closed,
      in_use:  pool.checkedOut,
      pending: pool.pending,
      max:     Number(process.env.DB_MAX_POOL_SIZE || 10),
    },
    monitor_attached: pool.attached,
  };
}

function memSnapshot() {
  const m = process.memoryUsage();
  return {
    heap_used_mb: Math.round(m.heapUsed / 1024 / 1024),
    rss_mb:       Math.round(m.rss / 1024 / 1024),
  };
}

// ─── Threshold evaluation ────────────────────────────────────────────────────
function evaluate() {
  const metrics = snapshot();
  const python  = pythonStats();
  const db      = dbSnapshot();
  const mem     = memSnapshot();

  const breaches = [];

  if (!db.ready) {
    breaches.push({ check: "db_disconnected", value: db.state });
  }
  if (db.pool.pending > T.DB_POOL_PENDING) {
    breaches.push({ check: "db_pool_saturated", value: db.pool.pending, threshold: T.DB_POOL_PENDING });
  }
  // Only judge latency once the window has real data. A cold instance with
  // three requests in it will otherwise alert on noise.
  if (metrics.window_size >= 20 && metrics.latency_ms.p95 > T.P95_MS) {
    breaches.push({ check: "latency_p95", value: metrics.latency_ms.p95, threshold: T.P95_MS });
  }
  if (metrics.window_size >= 20 && metrics.error_rate_window > T.ERROR_RATE) {
    breaches.push({ check: "error_rate", value: metrics.error_rate_window, threshold: T.ERROR_RATE });
  }
  if (python.queued > T.PYTHON_QUEUE) {
    breaches.push({ check: "python_queue_depth", value: python.queued, threshold: T.PYTHON_QUEUE });
  }
  if (mem.heap_used_mb > T.HEAP_USED_MB) {
    breaches.push({ check: "heap_pressure", value: mem.heap_used_mb, threshold: T.HEAP_USED_MB });
  }

  return { metrics, python, db, mem, breaches };
}

// ─── GET /api/health — unchanged ─────────────────────────────────────────────
router.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// ─── GET /api/health/ready — unchanged ───────────────────────────────────────
router.get("/health/ready", async (req, res) => {
  try {
    const dbState = mongoose.connection.readyState;
    if (dbState === 1) {
      return res.status(200).json({
        status: "ready",
        db: "connected",
        uptime: Math.floor(process.uptime()),
      });
    }
    return res.status(503).json({
      status: "degraded",
      db: ["disconnected", "connected", "connecting", "disconnecting"][dbState] || "unknown",
    });
  } catch (err) {
    return res.status(503).json({ status: "error", message: err.message });
  }
});

// ─── GET /api/health/deep — the alerting target ──────────────────────────────
//
// Returns 200 + "HEALTHY" when everything is inside thresholds, 503 +
// "DEGRADED" when anything breaches. Point an UptimeRobot keyword monitor at
// it: alert when the keyword HEALTHY is NOT present.
//
// Unauthenticated by necessity (free-tier monitors can't send auth headers),
// so it is gated by a shared token and returns only which check failed —
// never traffic volumes or route names.
router.get("/health/deep", (req, res) => {
  if (DEEP_TOKEN && req.query.key !== DEEP_TOKEN) {
    return res.status(404).json({ error: "Not found" });
  }

  try {
    const { breaches } = evaluate();
    if (breaches.length === 0) {
      return res.status(200).json({ health: "HEALTHY" });
    }
    return res.status(503).json({
      health: "DEGRADED",
      failing: breaches.map((b) => b.check),
    });
  } catch (err) {
    return res.status(503).json({ health: "DEGRADED", failing: ["evaluation_error"] });
  }
});

// ─── GET /api/health/metrics — full detail, admin only ───────────────────────
router.get("/health/metrics", requireAdmin, (req, res) => {
  try {
    const { metrics, python, db, mem, breaches } = evaluate();
    return res.json({
      status: breaches.length ? "degraded" : "healthy",
      uptime_seconds: Math.floor(process.uptime()),
      requests: metrics,
      python_pool: python,
      database: db,
      memory: mem,
      thresholds: T,
      breaches,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ error: "Metrics unavailable", message: err.message });
  }
});

module.exports = router;