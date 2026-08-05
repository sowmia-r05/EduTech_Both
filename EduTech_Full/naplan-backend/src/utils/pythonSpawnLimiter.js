// src/utils/pythonSpawnLimiter.js
//
// Process-wide cap on concurrent Python subprocesses.
//
// Every AI feature spawns a Python process; unbounded, a burst forks enough of
// them to exhaust RAM and OOM-kill the instance. This limiter runs at most
// MAX_CONCURRENT_PYTHON tasks at once and queues the rest up to MAX_PYTHON_QUEUE.
// When the pool AND the queue are both full, it rejects immediately with
// PythonBusyError (status 503) instead of forking another process.
//
// Env:
//   MAX_CONCURRENT_PYTHON  (default 1)    — how many may run at once
//   MAX_PYTHON_QUEUE       (default 10)   — how many may wait before we shed load
//   PYTHON_QUEUE_WAIT_MS   (default 45000)— max time a task may sit queued
//
// ═══════════════════════════════════════════════════════════════════════════
// 🔴 FIX 1 — NaN DEADLOCK
//
//   BEFORE: parseInt(process.env.MAX_CONCURRENT_PYTHON || "1", 10)
//
//   The `|| "1"` only catches an UNSET var. A var set to an empty string, a
//   stray space, or a typo ("five") passes the guard and parseInt returns NaN.
//   Every comparison against NaN is false, so:
//
//       active < NaN            → false  → fast path never taken
//       queue.length >= NaN     → false  → never rejects
//       → task pushed to queue
//
//   drain() is only ever called from a running task's .finally(). With nothing
//   running, drain() is never called, so the queue is never serviced. Every AI
//   request hangs forever — no error, no timeout, no log line. AI feedback
//   stops platform-wide and the only symptom is requests that never return.
//
//   AFTER: readPositiveInt() validates the parse and falls back to the default
//   on NaN or a non-positive value, logging loudly when it does.
//
// 🔴 FIX 2 — UNBOUNDED QUEUE WAIT
//
//   A queued task had no deadline. If a running task hangs (e.g. a Gemini call
//   with no SIGKILL timer — see resultAiService.js), it holds its slot forever
//   and everything behind it waits forever too. One hang degrades throughput;
//   MAX_CONCURRENT hangs stop the pool completely.
//
//   AFTER: each queued entry gets a PYTHON_QUEUE_WAIT_MS timer. On expiry it is
//   removed from the queue and rejected with PythonBusyError, so the caller
//   gets a 503 it can surface instead of an open connection that never closes.
//
//   This is a backstop, NOT a substitute for a per-task timeout in the spawn
//   sites themselves. A task that has already STARTED is not affected by this
//   timer — only queued ones. Each service that spawns Python still needs its
//   own SIGKILL timer.
//
// ✅ ADD — BOOT LOG
//
//   The resolved limits are printed once at startup. Without this there is no
//   way to confirm from the outside whether an env var actually took effect;
//   checking the Render dashboard proves the var is SET, not that the process
//   READ it (a var saved without a restart is invisible to a running process).
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parse a positive integer from env, falling back on anything unusable.
 * Logs when the fallback fires — a silently wrong concurrency limit is the
 * failure mode this whole module exists to prevent.
 */
function readPositiveInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return fallback;
  }
  const parsed = parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn(
      `[pythonLimiter] ${name}="${raw}" is not a positive integer — using ${fallback}`
    );
    return fallback;
  }
  return parsed;
}

const MAX_CONCURRENT = readPositiveInt("MAX_CONCURRENT_PYTHON", 1);
const MAX_QUEUE      = readPositiveInt("MAX_PYTHON_QUEUE", 10);
const QUEUE_WAIT_MS  = readPositiveInt("PYTHON_QUEUE_WAIT_MS", 45000);

// Printed once at boot. Grep the Render logs for "[pythonLimiter]" to confirm
// the resolved values without guessing at env vars.
console.log("[pythonLimiter] resolved config:", {
  maxConcurrent: MAX_CONCURRENT,
  maxQueue: MAX_QUEUE,
  queueWaitMs: QUEUE_WAIT_MS,
  raw: {
    MAX_CONCURRENT_PYTHON: process.env.MAX_CONCURRENT_PYTHON || "(unset)",
    MAX_PYTHON_QUEUE: process.env.MAX_PYTHON_QUEUE || "(unset)",
    PYTHON_QUEUE_WAIT_MS: process.env.PYTHON_QUEUE_WAIT_MS || "(unset)",
  },
});

class PythonBusyError extends Error {
  constructor(msg = "AI processing pool is busy, please retry shortly") {
    super(msg);
    this.name = "PythonBusyError";
    this.status = 503;
    this.statusCode = 503;
  }
}

let active = 0;
const queue = [];

// Counters for stats() — useful on a health/diagnostics route to see whether
// the pool is actually being exercised, or shedding load.
let totalRun = 0;
let totalRejected = 0;
let totalTimedOutInQueue = 0;
let peakActive = 0;
let peakQueued = 0;

function drain() {
  if (active >= MAX_CONCURRENT) return;

  const next = queue.shift();
  if (!next) return;

  // Cancel the queue-wait timer — this entry is starting, so the deadline for
  // WAITING no longer applies. (Its own execution timeout is the caller's job.)
  next.settle();

  active += 1;
  if (active > peakActive) peakActive = active;
  totalRun += 1;

  Promise.resolve()
    .then(next.task)
    .then(next.resolve, next.reject)
    .finally(() => {
      active -= 1;
      drain();
    });
}

/**
 * Run `task` (a function returning a Promise) under the global concurrency cap.
 * Resolves/rejects with the task's result. Rejects with PythonBusyError if the
 * pool and queue are both full, or if the task waited longer than
 * PYTHON_QUEUE_WAIT_MS without a slot opening up.
 */
function runWithPythonLimit(task) {
  if (typeof task !== "function") {
    return Promise.reject(new TypeError("runWithPythonLimit expects a function"));
  }

  // Room to run right now.
  if (active < MAX_CONCURRENT) {
    active += 1;
    if (active > peakActive) peakActive = active;
    totalRun += 1;

    return Promise.resolve()
      .then(task)
      .finally(() => {
        active -= 1;
        drain();
      });
  }

  // Pool full — can we queue?
  if (queue.length >= MAX_QUEUE) {
    totalRejected += 1;
    return Promise.reject(new PythonBusyError());
  }

  return new Promise((resolve, reject) => {
    const entry = { task, resolve, reject, settle: () => {} };

    // Deadline for WAITING. If no slot frees up in time, drop out of the queue
    // and 503 rather than holding the request open indefinitely.
    const timer = setTimeout(() => {
      const idx = queue.indexOf(entry);
      if (idx !== -1) queue.splice(idx, 1);
      totalTimedOutInQueue += 1;
      console.warn(
        `[pythonLimiter] queued task waited >${QUEUE_WAIT_MS}ms — shedding ` +
        `(active=${active}, queued=${queue.length})`
      );
      reject(new PythonBusyError("AI processing timed out waiting for a slot"));
    }, QUEUE_WAIT_MS);

    // Node-only: don't let a pending timer keep the process alive on shutdown.
    if (typeof timer.unref === "function") timer.unref();

    entry.settle = () => clearTimeout(timer);

    queue.push(entry);
    if (queue.length > peakQueued) peakQueued = queue.length;
  });
}

function stats() {
  return {
    active,
    queued: queue.length,
    maxConcurrent: MAX_CONCURRENT,
    maxQueue: MAX_QUEUE,
    queueWaitMs: QUEUE_WAIT_MS,
    peakActive,
    peakQueued,
    totalRun,
    totalRejected,
    totalTimedOutInQueue,
  };
}

module.exports = { runWithPythonLimit, PythonBusyError, stats };