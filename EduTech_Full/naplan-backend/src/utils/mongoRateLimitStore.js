// src/utils/mongoRateLimitStore.js
//
// ═══════════════════════════════════════════════════════════════════════════
// A MongoDB-backed store for express-rate-limit (v7 / v8 Store interface).
//
// WHY: the default MemoryStore keeps counters in the Node process. On Render's
// free tier the service spins down after ~15 min idle and cold-starts on the
// next request — so every counter resets. A 5-attempts-per-15-min login limit
// is not actually 5 attempts per 15 minutes; it's 5 attempts per uptime window.
// Deploys and OOM restarts reset it too. And with >1 instance, each process
// keeps its own count, so the effective limit is N × max.
//
// This store persists counters in Mongo, so they survive restarts and are shared
// across instances.
//
// COST WARNING (MongoDB Atlas M0):
//   Every rate-limited request costs 1–2 Mongo ops. Do NOT put this behind
//   apiLimiter (1000/min on every /api route) or uploadsLimiter — you will
//   hammer the free tier for no security benefit; those are abuse throttles,
//   not security controls, and MemoryStore is fine for them.
//
//   Use this ONLY for the limiters where a reset is a real security hole:
//     • authLimiter
//     • otpLimiter
//     • childLoginLimiter
//     • adminLoginLimiter   (in routes/adminRoutes.js)
//
// USAGE:
//   const MongoRateLimitStore = require("../utils/mongoRateLimitStore");
//
//   const otpLimiter = rateLimit({
//     windowMs: 15 * 60 * 1000,
//     max: 5,
//     store: new MongoRateLimitStore({ prefix: "otp" }),   // ← the only new line
//     ...
//   });
//
// Each limiter MUST get its own `prefix`, or they share counters.
// ═══════════════════════════════════════════════════════════════════════════

const mongoose = require("mongoose");
const connectDB = require("../config/db");

const COLLECTION = "rate_limits";

let ttlIndexEnsured = false;

async function collection() {
  await connectDB();
  const coll = mongoose.connection.db.collection(COLLECTION);

  // Let Mongo garbage-collect expired windows for us. Idempotent — createIndex
  // is a no-op if the index already exists.
  if (!ttlIndexEnsured) {
    try {
      await coll.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      ttlIndexEnsured = true;
    } catch (err) {
      // Non-fatal: without the TTL index, docs linger but the expiresAt check
      // below still enforces correct windows. Log and carry on.
      console.warn("[rateLimitStore] could not create TTL index:", err.message);
    }
  }

  return coll;
}

class MongoRateLimitStore {
  /**
   * @param {object} opts
   * @param {string} opts.prefix  Unique per limiter. Two limiters sharing a
   *                              prefix will share (and corrupt) each other's
   *                              counters.
   */
  constructor({ prefix = "default" } = {}) {
    this.prefix = prefix;
    this.windowMs = 60_000; // overwritten by init()
    // Tells express-rate-limit the counters are NOT process-local, so it won't
    // try to be clever about them.
    this.localKeys = false;
  }

  /** Called once by express-rate-limit with the limiter's resolved options. */
  init(options) {
    this.windowMs = options.windowMs;
  }

  _key(key) {
    return `${this.prefix}:${key}`;
  }

  /**
   * Record a hit. Returns the running total and when the window resets.
   *
   * Two-step so an expired window restarts cleanly:
   *   1. Try to $inc a window that is still live.
   *   2. If there wasn't one, (re)start the window at 1 hit.
   *
   * There is a small race here: two concurrent requests arriving exactly as a
   * window expires can both take step 2, losing one hit. That is an acceptable
   * trade — the alternative is a transaction per request, which M0 will not
   * thank you for.
   */
  async increment(key) {
    const coll = await collection();
    const _id = this._key(key);
    const now = new Date();

    // 1. Live window → just increment.
    let doc = await coll.findOneAndUpdate(
      { _id, expiresAt: { $gt: now } },
      { $inc: { hits: 1 } },
      { returnDocument: "after" }
    );

    // 2. No live window (never seen, or expired) → start a fresh one.
    if (!doc) {
      const expiresAt = new Date(now.getTime() + this.windowMs);
      doc = await coll.findOneAndUpdate(
        { _id },
        { $set: { hits: 1, expiresAt } },
        { upsert: true, returnDocument: "after" }
      );
    }

    return {
      totalHits: doc.hits,
      resetTime: doc.expiresAt,
    };
  }

  /**
   * Used by `skipSuccessfulRequests` / `skipFailedRequests` to refund a hit.
   * Never lets the count go below zero.
   */
  async decrement(key) {
    const coll = await collection();
    await coll.updateOne(
      { _id: this._key(key), hits: { $gt: 0 } },
      { $inc: { hits: -1 } }
    );
  }

  /** Clear one key's counter (e.g. after a successful login). */
  async resetKey(key) {
    const coll = await collection();
    await coll.deleteOne({ _id: this._key(key) });
  }

  /** Clear every counter for THIS limiter only — not the whole collection. */
  async resetAll() {
    const coll = await collection();
    await coll.deleteMany({ _id: { $regex: `^${this.prefix}:` } });
  }

  /** Read a counter without incrementing it (express-rate-limit v7+). */
  async get(key) {
    const coll = await collection();
    const doc = await coll.findOne({
      _id: this._key(key),
      expiresAt: { $gt: new Date() },
    });
    if (!doc) return undefined;
    return { totalHits: doc.hits, resetTime: doc.expiresAt };
  }
}

module.exports = MongoRateLimitStore;