// src/utils/metrics.js
//
// In-process metrics. Deliberately NOT Prometheus.
//
// On a single 512MB Render instance a metrics agent costs more headroom than
// the visibility is worth. This is a fixed-size ring buffer plus a few
// counters — bounded memory, no dependencies, no network.
//
// TRADE-OFF, understand it before relying on this: all of it is in process
// memory. A Render restart, deploy, or OOM kill resets every number to zero.
// That is fine for "how is the box RIGHT NOW" (latency, queue depth, live
// error rate) and useless for "what happened last Tuesday". Historical error
// tracking is Sentry's job, and it already has it.

const WINDOW_SIZE = 1000; // last N requests. ~1000 × 40 bytes ≈ 40KB. Bounded.

const latencies = new Array(WINDOW_SIZE).fill(0);
const statuses  = new Array(WINDOW_SIZE).fill(0);
let cursor = 0;
let filled = 0;

const counters = {
  total:      0,
  status_2xx: 0,
  status_3xx: 0,
  status_4xx: 0,
  status_5xx: 0,
  status_429: 0,   // rate-limit shedding, tracked separately from other 4xx
  status_503: 0,   // load shedding (PythonBusyError), tracked separately
};

const startedAt = Date.now();

// Slowest routes seen in the current window, keyed by "METHOD /path".
// Bounded to MAX_ROUTES entries so a 404 scanner can't grow it without limit.
const MAX_ROUTES = 50;
const routeStats = new Map();

function record({ route, method, statusCode, durationMs }) {
  latencies[cursor] = durationMs;
  statuses[cursor]  = statusCode;
  cursor = (cursor + 1) % WINDOW_SIZE;
  if (filled < WINDOW_SIZE) filled += 1;

  counters.total += 1;
  if (statusCode >= 500)      counters.status_5xx += 1;
  else if (statusCode >= 400) counters.status_4xx += 1;
  else if (statusCode >= 300) counters.status_3xx += 1;
  else                        counters.status_2xx += 1;

  if (statusCode === 429) counters.status_429 += 1;
  if (statusCode === 503) counters.status_503 += 1;

  const key = `${method} ${route}`;
  const existing = routeStats.get(key);
  if (existing) {
    existing.count += 1;
    existing.totalMs += durationMs;
    if (durationMs > existing.maxMs) existing.maxMs = durationMs;
  } else if (routeStats.size < MAX_ROUTES) {
    routeStats.set(key, { count: 1, totalMs: durationMs, maxMs: durationMs });
  }
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return Math.round(sorted[idx]);
}

function snapshot() {
  const window = latencies.slice(0, filled).sort((a, b) => a - b);
  const windowStatuses = statuses.slice(0, filled);
  const windowErrors = windowStatuses.filter((s) => s >= 500).length;

  const slowest = [...routeStats.entries()]
    .map(([route, s]) => ({
      route,
      count: s.count,
      avgMs: Math.round(s.totalMs / s.count),
      maxMs: Math.round(s.maxMs),
    }))
    .sort((a, b) => b.avgMs - a.avgMs)
    .slice(0, 10);

  return {
    uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
    window_size: filled,
    latency_ms: {
      p50: percentile(window, 50),
      p95: percentile(window, 95),
      p99: percentile(window, 99),
      max: window.length ? Math.round(window[window.length - 1]) : 0,
    },
    // Error rate over the WINDOW, not since boot. This is the number you
    // alert on — a lifetime rate is diluted into uselessness by good traffic.
    error_rate_window: filled ? Number((windowErrors / filled).toFixed(4)) : 0,
    counters: { ...counters },
    slowest_routes: slowest,
  };
}

function reset() {
  latencies.fill(0);
  statuses.fill(0);
  cursor = 0;
  filled = 0;
  routeStats.clear();
  Object.keys(counters).forEach((k) => { counters[k] = 0; });
}

module.exports = { record, snapshot, reset };