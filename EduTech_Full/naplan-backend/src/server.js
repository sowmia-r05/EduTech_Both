// src/server.js
//
// Eager MongoDB connection before Express starts
// + graceful shutdown (drains in-flight requests on SIGTERM/SIGINT)
// + explicit 0.0.0.0 bind so Render's port scan can detect the open port
//
// Place in: naplan-backend/src/server.js (replaces existing file)

const app = require("./app");
const connectDB = require("./config/db");
const mongoose = require("mongoose");

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0"; // MUST be 0.0.0.0 on Render — "localhost" is unreachable
                        // from outside the container and the port scan will fail.

let server; // captured HTTP server, used by the shutdown handler
let shuttingDown = false;

async function startServer() {
  try {
    // 1. Connect to MongoDB FIRST — fail fast if unreachable
    await connectDB();
    app.locals.db = mongoose.connection.db;
    console.log("✅ MongoDB connected — ready to accept requests");

    // 2. THEN start Express — capture the server so we can close it gracefully
    server = app.listen(PORT, HOST, () => {
      const addr = server.address();
      console.log(
        `NAPLAN backend listening on ${addr.address}:${addr.port} (family: ${addr.family})`,
      );
    });

    // Surface bind failures instead of dying silently (EADDRINUSE, EACCES, etc.)
    server.on("error", (err) => {
      console.error(`❌ server.listen failed on ${HOST}:${PORT} —`, err.message);
      process.exit(1);
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
  if (shuttingDown) return; // ignore repeated signals
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
process.on("SIGINT", () => shutdown("SIGINT")); // Ctrl+C in dev

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

startServer();