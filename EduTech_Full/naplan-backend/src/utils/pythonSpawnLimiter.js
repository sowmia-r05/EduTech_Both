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
//   MAX_CONCURRENT_PYTHON  (default 1)   — how many may run at once
//   MAX_PYTHON_QUEUE       (default 10)  — how many may wait before we shed load

const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_PYTHON || "1", 10);
const MAX_QUEUE       = parseInt(process.env.MAX_PYTHON_QUEUE || "10", 10);

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

function drain() {
  if (active >= MAX_CONCURRENT) return;
  const next = queue.shift();
  if (!next) return;

  active += 1;
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
 * pool and queue are both full.
 */
function runWithPythonLimit(task) {
  if (typeof task !== "function") {
    return Promise.reject(new TypeError("runWithPythonLimit expects a function"));
  }

  // Room to run right now.
  if (active < MAX_CONCURRENT) {
    active += 1;
    return Promise.resolve()
      .then(task)
      .finally(() => {
        active -= 1;
        drain();
      });
  }

  // Pool full — can we queue?
  if (queue.length >= MAX_QUEUE) {
    return Promise.reject(new PythonBusyError());
  }

  return new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject });
  });
}

function stats() {
  return { active, queued: queue.length, maxConcurrent: MAX_CONCURRENT, maxQueue: MAX_QUEUE };
}

module.exports = { runWithPythonLimit, PythonBusyError, stats };