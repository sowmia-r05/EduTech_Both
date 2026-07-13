// src/server.js
//
// ✅ UPDATED — Eager MongoDB connection before Express starts
//              + graceful shutdown (drains in-flight requests on SIGTERM/SIGINT)
//
// WHAT CHANGED:
//   - connectDB() is AWAITED before app.listen() (DB ready on first request)
//   - app.listen() reference is captured so we can close it cleanly
//   - SIGTERM/SIGINT handlers: stop accepting new requests, let in-flight
//     requests finish, close MongoDB, then exit. Render sends SIGTERM on every
//     redeploy/restart — this prevents dropping a request mid-flight (e.g. a
//     Stripe webhook or a quiz submission).
//
// Place in: naplan-backend/src/server.js (replaces existing file)

const app = require("./app");
const connectDB = require("./config/db");
const mongoose = require("mongoose");

const PORT = process.env.PORT || 3000;

let server;           // captured HTTP server, used by the shutdown handler
let shuttingDown = false;

async function startServer() {
  try {
    // 1. Connect to MongoDB FIRST — fail fast if unreachable
    await connectDB();
    app.locals.db = mongoose.connection.db;
    console.log("✅ MongoDB connected — ready to accept requests");

    // 2. THEN start Express — capture the server so we can close it gracefully
    server = app.listen(PORT, () => {
      console.log(`NAPLAN backend running on port ${PORT}`);
    });

    // Weekly progress email cron (runs inside this process)
    const { scheduleWeekly } = require("./jobs/weeklyProgressEmail");
    scheduleWeekly();
  } catch (err) {
    console.error("❌ Failed to start server:", err.message);
    // Exit so Render/Docker can restart the process
    process.exit(1);
  }
}

// ─────────────────────────────────────────────────────────────
// Graceful shutdown
// ─────────────────────────────────────────────────────────────
async function shutdown(signal) {
  if (shuttingDown) return;        // ignore repeated signals
  shuttingDown = true;
  console.log(`\n${signal} received — shutting down gracefully...`);

  // If the server never started, just exit.
  if (!server) {
    process.exit(0);
    return;
  }

  // Stop accepting new connections; callback fires once in-flight requests done.
  server.close(async () => {
    console.log("HTTP server closed (in-flight requests drained).");
    try {
      await mongoose.connection.close(false);
      console.log("MongoDB connection closed.");
    } catch (e) {
      console.error("Error closing MongoDB:", e.message);
    }
    process.exit(0);
  });

  // Safety net: force-exit if something hangs, so the platform doesn't SIGKILL
  // us mid-write. 30s is comfortably under Render's shutdown grace window.
  setTimeout(() => {
    console.error("Forced shutdown after 30s timeout.");
    process.exit(1);
  }, 30000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM")); // Render/Docker stop
process.on("SIGINT",  () => shutdown("SIGINT"));  // Ctrl+C in dev

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

startServer();