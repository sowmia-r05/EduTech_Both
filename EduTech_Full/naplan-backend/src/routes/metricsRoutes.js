// src/routes/metricsRoutes.js
//
// Internal metrics the platforms can't see: Python pool queue depth (your real
// concurrency ceiling), event-loop lag (latency proxy — spikes when the box is
// thrashing/OOM-starved), process memory (512MB Render box), and DB readyState.
//
// The endpoint returns a computed `healthy` boolean so you can alert WITHOUT a
// metrics backend: point an UptimeRobot "keyword" monitor at this URL and alert
// when the keyword  "healthy":false  is present. That single monitor then covers
// queue saturation + latency + memory + DB drop.
//
// Mount in app.js (after healthRoutes is fine):
//   const metricsRoutes = require("./routes/metricsRoutes");
//   app.use("/api", metricsRoutes);
//
// Protect it: set METRICS_TOKEN in Render, then call with
//   ?token=XXX   or   Authorization: Bearer XXX
// (UptimeRobot free can append ?token=... to the URL.)

const express = require("express");
const mongoose = require("mongoose");
const { monitorEventLoopDelay } = require("perf_hooks");

const router = express.Router();

// ── Python pool stats (the queue-depth source). Optional-safe: if the limiter
//    isn't present for some reason, we don't crash the metrics endpoint. ──
let pythonStats = () => ({ active: 0, queued: 0, maxConcurrent: 0, maxQueue: 0 });
try {
  ({ stats: pythonStats } = require("../utils/pythonSpawnLimiter"));
} catch (_) {
  /* limiter not found — report zeros */
}

// ── Event-loop delay histogram, sampled continuously from process start ──
const loopDelay = monitorEventLoopDelay({ resolution: 20 });
loopDelay.enable();

// ── Thresholds (override via env) ──
const MEM_LIMIT_MB   = Number(process.env.MEM_LIMIT_MB || 512);   // Render free tier
const MEM_WARN_PCT   = Number(process.env.MEM_WARN_PCT || 85);    // rss % of limit
const LOOP_LAG_MAX_MS = Number(process.env.LOOP_LAG_MAX_MS || 200); // p99 loop lag
const METRICS_TOKEN  = process.env.METRICS_TOKEN || "";

function checkToken(req) {
  if (!METRICS_TOKEN) return true; // open if no token configured
  const auth = req.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const token = bearer || req.query.token || "";
  return token === METRICS_TOKEN;
}

router.get("/metrics", (req, res) => {
  if (!checkToken(req)) return res.status(401).json({ error: "unauthorized" });

  const py = pythonStats();

  const mem = process.memoryUsage();
  const rssMb = Math.round(mem.rss / 1024 / 1024);
  const memPct = Math.round((rssMb / MEM_LIMIT_MB) * 100);

  // Histogram values are in nanoseconds → convert to ms.
  const loopP99Ms = Math.round(loopDelay.percentile(99) / 1e6);
  const loopMeanMs = Math.round(loopDelay.mean / 1e6);

  const dbState = mongoose.connection.readyState; // 1 = connected
  const dbConnected = dbState === 1;

  // Queue saturation: full pool AND anything waiting is the warning zone;
  // queue at/over its max means we're actively shedding load (503s).
  const queueSaturated =
    py.maxQueue > 0 && py.queued >= py.maxQueue;

  const memHigh  = memPct >= MEM_WARN_PCT;
  const loopHigh = loopP99Ms >= LOOP_LAG_MAX_MS;

  const healthy = dbConnected && !queueSaturated && !memHigh && !loopHigh;

  res.status(healthy ? 200 : 503).json({
    healthy,                       // ← alert keyword: "healthy":false
    ts: Date.now(),
    uptime_sec: Math.floor(process.uptime()),

    python_pool: {
      active: py.active,
      queued: py.queued,
      max_concurrent: py.maxConcurrent,
      max_queue: py.maxQueue,
      saturated: queueSaturated,   // queue depth signal
    },

    event_loop: {
      mean_ms: loopMeanMs,
      p99_ms: loopP99Ms,           // latency proxy
      high: loopHigh,
    },

    memory: {
      rss_mb: rssMb,
      heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
      limit_mb: MEM_LIMIT_MB,
      pct: memPct,
      high: memHigh,
    },

    db: {
      state: ["disconnected", "connected", "connecting", "disconnecting"][dbState] || "unknown",
      connected: dbConnected,
    },
  });
});

module.exports = router;