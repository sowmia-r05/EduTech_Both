// src/server.js
//
// ✅ UPDATED — Eager MongoDB connection before Express starts
//
// WHAT CHANGED:
//   - connectDB() is now AWAITED before app.listen()
//   - This ensures MongoDB is ready when the first request hits
//   - Saves 1-3 seconds on cold start because the DB pool is already warm
//   - If DB connection fails, the process exits with a clear error instead of
//     silently serving 500s
//
// Place in: naplan-backend/src/server.js (replaces existing file)

const app = require("./app");
const connectDB = require("./config/db");


const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // 1. Connect to MongoDB FIRST — fail fast if unreachable
    await connectDB();
    console.log("✅ MongoDB connected — ready to accept requests");

    // 2. THEN start Express
    app.listen(PORT, () => {
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

startServer();
  