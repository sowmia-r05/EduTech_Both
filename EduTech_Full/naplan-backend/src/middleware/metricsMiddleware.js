// src/middleware/metricsMiddleware.js
//
// Records every request into utils/metrics.js.
//
// MOUNT EARLY — in app.js, after cookieParser and before the routers. It has
// to run before routing so that 404s and rate-limiter 429s are counted too.
// Those are exactly the responses you most want visibility on, and a
// middleware mounted after the routers never sees them.

const { record } = require("../utils/metrics");

// Paths excluded from the latency window.
//
// UptimeRobot hits /api/health every 5 minutes and it does no DB work, so it
// returns in ~1ms. Left in, those pings drag p50 toward zero and make the
// window describe the monitor rather than your users. /health/metrics and
// /health/deep are excluded for the same reason plus self-reference.
const EXCLUDED = new Set([
  "/api/health",
  "/api/health/ready",
  "/api/health/deep",
  "/api/health/metrics",
]);

// ─── Route normalisation ─────────────────────────────────────────────────────
//
// This is the load-bearing part. Without it, every distinct ID becomes its own
// route key: /api/children/68f3.../results, /api/children/a91b.../results, and
// so on. metrics.js caps routeStats at 50 entries, so an unnormalised path
// fills that cap with 50 arbitrary one-hit URLs within seconds and every real
// route is then silently dropped. Worse, a 404 scanner could do it deliberately.
//
// Prefer Express's own matched route pattern when it exists — that is already
// the parameterised form ("/:childId/results"). Fall back to regex scrubbing
// for anything unmatched (404s, static, errors thrown before routing).

const OBJECT_ID   = /^[0-9a-fA-F]{24}$/;
const UUID        = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const NUMERIC     = /^\d+$/;
const LONG_TOKEN  = /^[A-Za-z0-9_-]{20,}$/;   // Stripe session ids, JWTs in paths, etc.

function scrubSegment(seg) {
  if (OBJECT_ID.test(seg))  return ":id";
  if (UUID.test(seg))       return ":uuid";
  if (NUMERIC.test(seg))    return ":n";
  if (LONG_TOKEN.test(seg)) return ":token";
  return seg;
}

function normaliseRoute(req) {
  // req.route is populated only once a handler has matched.
  if (req.route && req.route.path) {
    const base = req.baseUrl || "";
    const path = req.route.path === "/" ? "" : req.route.path;
    return `${base}${path}` || "/";
  }

  // Unmatched — scrub it ourselves. Cap depth so a deep scan can't create
  // long unique keys.
  const parts = (req.path || "/").split("/").filter(Boolean).slice(0, 6);
  if (!parts.length) return "/";
  return "/" + parts.map(scrubSegment).join("/");
}

// ─── Middleware ──────────────────────────────────────────────────────────────
function metricsMiddleware(req, res, next) {
  if (EXCLUDED.has(req.path)) return next();

  const start = process.hrtime.bigint();
  let recorded = false;

  const finish = () => {
    if (recorded) return;   // "finish" and "close" can both fire
    recorded = true;

    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;

    try {
      record({
        route:      normaliseRoute(req),
        method:     req.method,
        statusCode: res.statusCode,
        durationMs,
      });
    } catch (err) {
      // Metrics must never break a request. Swallow and move on.
      console.error("[metrics] record failed:", err.message);
    }
  };

  // "finish" = response sent successfully.
  // "close"  = client disconnected mid-response. Counting those matters: a
  //            burst of aborted requests is exactly what a timing-out AI
  //            submission looks like from the outside.
  res.on("finish", finish);
  res.on("close", finish);

  next();
}

module.exports = metricsMiddleware;