// src/utils/cronLeader.js
//
// Single-leader election for in-process crons, so they fire ONCE across N
// instances instead of once PER instance.
//
// Two layers:
//   1. RUN_CRONS=false  → this instance NEVER runs crons (hard off). Set it on
//      instances you want to keep cron-free (e.g. if you later add a dedicated
//      worker service); leave it unset everywhere else.
//   2. Mongo lease      → among instances that ARE allowed to run crons, exactly
//      one holds a renewable lease at a time and is "leader". Every cron tick
//      calls amILeader() and skips if it isn't the holder. If the leader dies,
//      its lease expires (after LEASE_MS) and another instance takes over on its
//      next heartbeat — automatic failover, no manual intervention.
//
// No Redis: the lease is ONE document in Mongo with a fixed _id, so the _id
// uniqueness itself arbitrates the race (a losing instance's upsert-insert hits
// a duplicate-key error and simply isn't leader).

const mongoose = require("mongoose");
const os = require("os");
const crypto = require("crypto");
const connectDB = require("../config/db");

const LEASE_ID     = "cron-leader";
const HEARTBEAT_MS = Number(process.env.CRON_HEARTBEAT_MS || 30 * 1000); // renew every 30s
const LEASE_MS     = Number(process.env.CRON_LEASE_MS || 90 * 1000);     // lease valid 90s (3× heartbeat)

// Unique enough to distinguish co-located instances (same host, diff pid).
const INSTANCE_ID =
  `${os.hostname()}-${process.pid}-${crypto.randomBytes(3).toString("hex")}`;

const leaseSchema = new mongoose.Schema(
  {
    _id:       { type: String }, // always LEASE_ID — one doc, ever
    holder:    { type: String },
    expiresAt: { type: Date },
  },
  { versionKey: false }
);

const CronLease =
  mongoose.models.CronLease || mongoose.model("CronLease", leaseSchema);

let _isLeader = false;
let _started = false;

/**
 * Sync, cheap leadership check for cron ticks to call. Honours RUN_CRONS=false
 * as a hard override regardless of lease state.
 */
function amILeader() {
  return _isLeader === true && process.env.RUN_CRONS !== "false";
}

async function heartbeat() {
  if (process.env.RUN_CRONS === "false") {
    _isLeader = false;
    return;
  }

  try {
    await connectDB();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + LEASE_MS);

    // Acquire/renew: match if the lease is ALREADY ours (renew) or EXPIRED
    // (take over). If another instance holds a LIVE lease, this filter matches
    // nothing, so the upsert attempts to insert a second doc with the same _id
    // → E11000 → we're not the leader.
    const res = await CronLease.findOneAndUpdate(
      {
        _id: LEASE_ID,
        $or: [{ holder: INSTANCE_ID }, { expiresAt: { $lt: now } }],
      },
      { $set: { holder: INSTANCE_ID, expiresAt } },
      { upsert: true, new: true }
    );

    const wasLeader = _isLeader;
    _isLeader = !!res && res.holder === INSTANCE_ID;

    if (_isLeader && !wasLeader) {
      console.log(`🗳️  This instance is now the CRON LEADER (${INSTANCE_ID})`);
    } else if (!_isLeader && wasLeader) {
      console.log(`↩️  This instance is no longer the cron leader`);
    }
  } catch (err) {
    if (err && err.code === 11000) {
      _isLeader = false; // another live leader beat us to the insert
      return;
    }
    // Fail CLOSED: if we can't confirm leadership, don't run crons.
    _isLeader = false;
    console.warn("⚠️ cron leadership heartbeat failed:", err.message);
  }
}

/**
 * Call ONCE at startup (idempotent). Starts the heartbeat that keeps this
 * instance's lease renewed while it is leader.
 */
function startCronLeadership() {
  if (_started) return;
  _started = true;

  if (process.env.RUN_CRONS === "false") {
    console.log("⛔ RUN_CRONS=false — this instance will not run crons");
    return;
  }

  heartbeat(); // fire immediately so leadership settles within a second or two
  const iv = setInterval(heartbeat, HEARTBEAT_MS);
  if (iv.unref) iv.unref(); // don't keep the process alive just for this
  console.log(
    `⏰ Cron leadership heartbeat started (renew ${HEARTBEAT_MS}ms / lease ${LEASE_MS}ms)`
  );
}

module.exports = { startCronLeadership, amILeader, INSTANCE_ID };