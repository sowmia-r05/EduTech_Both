/**
 * utils/pythonSpawnLimiter.js
 *
 * Global concurrency limiter for spawned Python processes.
 *
 * Every AI feature (subject feedback, writing eval, explanations, cumulative
 * feedback, chat) forks a full Python process — each loads its libraries,
 * calls Gemini, and can run up to ~2 minutes. With no cap, a burst of quiz
 * submissions forks one process PER submission at once, which can exhaust
 * RAM/CPU on the Render instance and take the whole server down.
 *
 * This is ONE process-wide semaphore. Because it's a module singleton, every
 * file that imports `runWithPythonLimit` shares the SAME ceiling — so the
 * total concurrent Python processes across ALL features is bounded.
 *
 * Tune via env:  MAX_CONCURRENT_PYTHON  (default 3)
 * No new npm dependencies.
 */

const MAX_CONCURRENT = Math.max(
  1,
  parseInt(process.env.MAX_CONCURRENT_PYTHON || "3", 10)
);

let active = 0;
const queue = [];

function _pump() {
  if (active >= MAX_CONCURRENT) return;
  const resolve = queue.shift();
  if (!resolve) return;
  active += 1;
  resolve();
}

function acquire() {
  return new Promise((resolve) => {
    queue.push(resolve);
    _pump();
  });
}

function release() {
  active = Math.max(0, active - 1);
  _pump();
}

/**
 * Runs `task` (a function returning a Promise) only once a slot is free.
 * ALWAYS releases the slot, even if the task throws/rejects.
 *
 *   const result = await runWithPythonLimit(() => new Promise(...spawn...));
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
  return { active, queued: queue.length, max: MAX_CONCURRENT };
}

module.exports = { runWithPythonLimit, spawnLimiterStats };