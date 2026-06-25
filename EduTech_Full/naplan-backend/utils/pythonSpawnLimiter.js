/**
 * src/utils/pythonSpawnLimiter.js
 *
 * Process-wide concurrency limiter for spawned Python processes.
 *
 * Every AI feature (subject feedback, writing eval, explanations, cumulative
 * feedback, chat, per-question explanations) forks a full Python process.
 * Each loads its libraries, calls Gemini, and can run up to ~2 minutes. With
 * no cap, a burst of submissions forks one process PER request at once, which
 * exhausts RAM/CPU and takes the whole instance down.
 *
 * This is ONE module singleton. Every file that imports `runWithPythonLimit`
 * shares the SAME ceiling, so the total concurrent Python processes across ALL
 * features is bounded.
 *
 * Tune via env:
 *   MAX_CONCURRENT_PYTHON  (default 3)  — simultaneous Python processes.
 *     ⚠️ Size to instance RAM: each process ~150–300MB. On a 512MB box use 1–2.
 *   MAX_PYTHON_QUEUE       (default 50) — how many may WAIT for a slot before
 *     new requests are rejected with PythonBusyError (HTTP 503). 0 = unbounded
 *     (NOT recommended — a burst then piles up in memory and hangs requests).
 *
 * ⚠️ PER-PROCESS ONLY: this does not coordinate across multiple instances.
 *    With N web instances, total concurrency = MAX_CONCURRENT_PYTHON × N.
 *    For true multi-instance control, move AI work to a job queue + workers.
 *
 * No new npm dependencies.
 */

const MAX_CONCURRENT = Math.max(
  1,
  parseInt(process.env.MAX_CONCURRENT_PYTHON || "3", 10)
);

// 0 = unbounded queue. Any positive number caps how many can wait.
const MAX_QUEUE = Math.max(
  0,
  parseInt(process.env.MAX_PYTHON_QUEUE || "50", 10)
);

let active = 0;
const queue = []; // array of { resolve }

// Thrown when the pool AND the wait-queue are both full.
// Routes can check `err.code === "PYTHON_BUSY"` (or err.status === 503).
class PythonBusyError extends Error {
  constructor() {
    super("AI processing pool is busy. Please try again in a moment.");
    this.name = "PythonBusyError";
    this.code = "PYTHON_BUSY";
    this.status = 503;
  }
}

function _pump() {
  if (active >= MAX_CONCURRENT) return;
  const next = queue.shift();
  if (!next) return;
  active += 1;
  next.resolve();
}

function acquire() {
  return new Promise((resolve, reject) => {
    // Slot free → take it immediately.
    if (active < MAX_CONCURRENT) {
      active += 1;
      return resolve();
    }
    // Pool full but queue has room → wait.
    if (MAX_QUEUE === 0 || queue.length < MAX_QUEUE) {
      queue.push({ resolve });
      return;
    }
    // Pool full AND queue full → fail fast.
    return reject(new PythonBusyError());
  });
}

function release() {
  active = Math.max(0, active - 1);
  _pump();
}

/**
 * Run `task` (a function returning a Promise) only once a slot is free.
 * ALWAYS releases the slot, even if the task throws/rejects.
 * May reject with PythonBusyError before the task runs if the queue is full.
 *
 *   const result = await runWithPythonLimit(() => new Promise((res, rej) => { ...spawn... }));
 */
async function runWithPythonLimit(task) {
  await acquire();
  try {
    return await task();
  } finally {
    release();
  }
}

function spawnLimiterStats() {
  return {
    active,
    queued: queue.length,
    max: MAX_CONCURRENT,
    maxQueue: MAX_QUEUE,
  };
}

module.exports = { runWithPythonLimit, spawnLimiterStats, PythonBusyError };