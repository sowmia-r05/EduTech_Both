/**
 * config/db.js  (v2 — WITH TIMEOUTS)
 *
 * ✅ Gap 3: Added serverSelectionTimeoutMS and connectTimeoutMS
 * to prevent infinite hangs when MongoDB Atlas is unreachable.
 *
 * Previous behavior: mongoose.connect() would hang forever if
 * Atlas IP wasn't whitelisted or cluster was paused.
 *
 * New behavior: Fails with a clear error after 5-10 seconds.
 */

const mongoose = require("mongoose");
require("dotenv").config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI missing in .env");
}

// Global cached connection
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI, {
        bufferCommands: false,

        // ✅ CRITICAL: These timeouts prevent infinite hangs
        serverSelectionTimeoutMS: 5000, // Fail after 5s if can't find a server
        connectTimeoutMS: 10000, // TCP connection timeout 10s
        socketTimeoutMS: 45000, // Socket timeout for operations 45s

        // Connection pool settings for production
        maxPoolSize: 10,
        minPoolSize: 2,
      })
      .then((m) => {
        console.log("✅ MongoDB connected");
        return m;
      })
      .catch((err) => {
        // Reset the cached promise so the next request retries
        cached.promise = null;
        cached.conn = null;
        console.error("❌ MongoDB connection failed:", err.message);
        throw err;
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

module.exports = connectDB;
