// src/routes/healthRoutes.js
//
// ✅ NEW FILE — Health check endpoints to prevent Render cold starts
//
// Provides two endpoints:
//   GET /api/health       → Lightweight instant ping (no DB, no auth)
//   GET /api/health/ready → Deep check with MongoDB readyState
//
// Place in: naplan-backend/src/routes/healthRoutes.js
//
// Register in app.js:
//   const healthRoutes = require("./routes/healthRoutes");
//   app.use("/api", healthRoutes);
//
// Then set up a free cron ping (UptimeRobot / cron-job.org / BetterStack)
// to hit GET https://your-backend.onrender.com/api/health every 5 minutes.
// This keeps the Render instance warm and eliminates 10-30s cold starts.

const router = require("express").Router();

// ── Lightweight ping — no DB query, no auth, instant response ──
// Use this for keep-alive cron pings
router.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// ── Deep health check — verifies MongoDB connection ──
// Use this for monitoring dashboards (e.g. Render health check path)
router.get("/health/ready", async (req, res) => {
  try {
    const mongoose = require("mongoose");
    const dbState = mongoose.connection.readyState;
    // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting

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
    return res.status(503).json({
      status: "error",
      message: err.message,
    });
  }
});

module.exports = router;
