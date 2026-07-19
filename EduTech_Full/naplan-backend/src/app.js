require("dotenv").config();

// Force IPv4 — fixes ENETUNREACH to Gmail on Render/Railway
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");

// ─── Startup env validation ───────────────────────────────────────────────────
(function validateRequiredEnv() {
  const missing = [];

  if (!process.env.PARENT_JWT_SECRET && !process.env.JWT_SECRET) {
    missing.push("PARENT_JWT_SECRET (or JWT_SECRET)");
  }
  if (!process.env.MONGODB_URI) {
    missing.push("MONGODB_URI");
  }

  if (process.env.NODE_ENV === "production") {
    if (!process.env.FRONTEND_ORIGIN) missing.push("FRONTEND_ORIGIN");
    if (!process.env.STRIPE_SECRET_KEY) missing.push("STRIPE_SECRET_KEY");
    if (!process.env.STRIPE_WEBHOOK_SECRET)
      missing.push("STRIPE_WEBHOOK_SECRET");
  } else {
    ["FRONTEND_ORIGIN", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"].forEach(
      (k) => {
        if (!process.env[k])
          console.warn(`⚠️  [env] ${k} not set — required in production`);
      },
    );
  }

  if (missing.length > 0) {
    throw new Error(
      `\n🚨 Missing required environment variables:\n` +
        missing.map((k) => `   ✗ ${k}`).join("\n") +
        `\n\nAdd these to your .env file before starting the server.\n`,
    );
  }

  console.log("✅ Environment validation passed");
})();

// ─── Requires ─────────────────────────────────────────────────────────────────
const express = require("express");
const rateLimit = require("express-rate-limit");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const { s3, BUCKET } = require("./utils/s3Upload");
const { GetObjectCommand } = require("@aws-sdk/client-s3");
const sanitizeMongo = require("./middleware/sanitizeMongo");
const MongoRateLimitStore = require("./utils/mongoRateLimitStore");

const app = express();
app.set("trust proxy", 1);

// Skip rate limiting under jest so integration tests (many requests, one IP)
// don't trip 429s. No effect in dev/production.
const skipInTest = () => process.env.NODE_ENV === "test";

// ─── Security headers ─────────────────────────────────────────────────────────
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }, // allows images to load cross-origin
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https://*.stripe.com",
          "https://naplanapi.kaisolutions.ai",
          "https://naplan-bucket.s3.ap-southeast-2.amazonaws.com",
          "https:",
        ],
        connectSrc: [
          "'self'",
          "https://api.stripe.com",
          "https://checkout.stripe.com",
        ],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: [
          "'self'",
          "blob:",
          "https://naplanapi.kaisolutions.ai",
          "https:",
        ],
        frameSrc: ["https://checkout.stripe.com", "https://js.stripe.com"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
    frameguard: { action: "deny" },
    noSniff: true,
    hsts:
      process.env.NODE_ENV === "production"
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    crossOriginOpenerPolicy: { policy: "same-origin" },
    hidePoweredBy: true,
  }),
);

// ─── CORS ─────────────────────────────────────────────────────────────────────
const IS_DEV = process.env.NODE_ENV !== "production";

// Build the static allow-list from env (comma-separated)
const allowedOrigins = (process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// In dev, allow localhost by default if FRONTEND_ORIGIN isn't set
if (IS_DEV && allowedOrigins.length === 0) {
  allowedOrigins.push("http://localhost:5173", "http://localhost:3000");
}

// Regex patterns for dynamic origins (Vercel preview deploys, etc.)
const allowedOriginPatterns = [
  // Any edu-tech-both Vercel deploy: production + previews + branch deploys
  /^https:\/\/edu-tech-both(-[a-z0-9-]+)?\.vercel\.app$/,
];

function isAllowedOrigin(origin) {
  if (!origin) return true; // same-origin / curl / server-to-server

  // Static allow-list (prod custom domain from FRONTEND_ORIGIN) — ALL environments
  if (allowedOrigins.includes(origin)) return true;

  // Localhost + Vercel preview deploys — NON-PROD ONLY, never trusted in production
  if (IS_DEV) {
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
    if (allowedOriginPatterns.some((re) => re.test(origin))) return true;
  }

  return false;
}

console.log("✅ CORS allow-list:", allowedOrigins);
console.log("✅ CORS allow-patterns:", allowedOriginPatterns.map(String));

// NOTE (Express 5): do NOT add `app.options("*", cors())` — path-to-regexp v8
// rejects a bare "*" and the server crashes on boot. The global cors()
// middleware below already answers OPTIONS preflight with a 204.
app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        return callback(null, true);
      }
      console.warn(`[CORS] Rejected origin: ${origin}`);
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cache-Control", "Accept"],
  }),
);

app.use(cookieParser());

// ─── Request context — must precede metrics and all routers ──────────────────
// Assigns req.id and req.log (a pino child logger stamped with that id), and
// echoes x-request-id back. errorHandler returns the same id to the client, so
// a user-reported error can be grepped straight out of the Render logs.
const requestContext = require("./utils/requestContext");
app.use(requestContext);

// ─── Request metrics ─────────────────────────────────────────────────────────
// Must precede the body parsers and every router so that 413s (oversize
// payload, rejected by express.json), 429s (rate limiters) and 404s are all
// counted.
const metricsMiddleware = require("./middleware/metricsMiddleware");
app.use(metricsMiddleware);

// ── Stripe webhook — must be registered BEFORE express.json() ────────────────
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));

// ── All other routes — JSON body parser ──────────────────────────────────────
app.use(
  express.json({
    limit: "1mb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }),
);

// ── NoSQL injection sanitizer — after body parse, before routes (Express 5 safe) ──
app.use(sanitizeMongo);

// ─── Route imports ────────────────────────────────────────────────────────────
const healthRoutes = require("./routes/healthRoutes");
const supportRoutes = require("./routes/supportRoutes");
const examRoutes = require("./routes/examRoutes");
const studentRoutes = require("./routes/studentRoutes");
const writingRoutes = require("./routes/writingRoutes");
const catalogRoutes = require("./routes/catalogRoutes");
const parentRoutes = require("./routes/parentRoutes");
const googleAuthRoutes = require("./routes/googleAuthRoutes");
const parentAuthRoutes = require("./routes/parentAuthRoutes");
const childRoutes = require("./routes/childRoutes");
const childAuthRoutes = require("./routes/childAuthRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const adminRoutes = require("./routes/adminRoutes");
const tutorRoutes = require("./routes/Tutorroutes");
const adminAiFeedbackRoutes = require("./routes/adminAiFeedbackRoutes");
const quizRoutes = require("./routes/quizRoutes");
const availableQuizzesRoute = require("./routes/availableQuizzesRoute");
const flashcardsRoute = require("./routes/flashcardsRoute");
const explanationRoutes = require("./routes/explanationRoutes");
const cumulativeFeedbackRoutes = require("./routes/cumulativeFeedbackRoutes");
const ocrRoute = require("./routes/ocrRoute");
const sessionRoutes = require("./routes/sessionRoutes");
const resultRoutes = require("./routes/resultRoutes");
const regenerateAiRoute = require("./routes/regenerateAiRoute");
const quizExplanationsRoute = require("./routes/quizExplanationsRoute");
const quizChatRoute = require("./routes/quizChat");
const quizAiRoutes = require("./routes/quizAiRoutes");
const originalityRoutes = require("./routes/originalityRoutes");
const aiImageRoutes = require("./routes/aiImageRoutes");

const {
  secureLegacyResults,
  secureLegacyWriting,
} = require("./middleware/legacyRouteAuth");

// ─── Health check (no rate limit, no auth) ───────────────────────────────────
app.use("/api", healthRoutes);

// ─── Rate limiters ────────────────────────────────────────────────────────────
//
// STORE CHOICE — this matters, and the split is deliberate:
//
//   MemoryStore (default) is a plain object inside the Node process. Render's
//   free tier spins the service down after ~15 min idle and cold-starts on the
//   next request, so EVERY counter resets. Deploys and OOM restarts reset it
//   too. And with more than one instance, each process counts separately, so
//   the real limit becomes N × max.
//
//   • Abuse throttles (apiLimiter, chatGlobalLimiter, uploadsLimiter) STAY on
//     MemoryStore. They fire on huge volumes of ordinary traffic; a Mongo
//     round-trip per request would hammer the M0 free tier, and a reset on
//     restart costs us nothing.
//
//   • Security controls (authLimiter, otpLimiter, childLoginLimiter, plus
//     adminLoginLimiter over in routes/adminRoutes.js) get the Mongo-backed
//     store. For these, a counter reset IS the vulnerability — an attacker just
//     waits for a spin-down and gets a fresh set of attempts.
//
//   Every limiter needs its OWN `prefix`. Two limiters sharing a prefix share
//   (and corrupt) each other's counters.
//
//   NOTE: OCR has NO limiter here. Its limiters live inside routes/ocrRoute.js,
//   mounted after verifyToken so they key on verified identity rather than IP.

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 1000,
  message: { error: "Too many API requests", retryAfter: "60 seconds" },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
});

const authLimiter = rateLimit({
  windowMs: 11 * 60 * 1000,
  max: 10,
  message: { error: "Too many authentication requests. Please wait a minute." },
  standardHeaders: true,
  legacyHeaders: false,
  store: new MongoRateLimitStore({ prefix: "auth" }),
  skip: skipInTest,
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    error: "Too many OTP attempts. Please wait 15 minutes before trying again.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  store: new MongoRateLimitStore({ prefix: "otp" }),
  skip: skipInTest,
});

const childLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts. Please wait 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  store: new MongoRateLimitStore({ prefix: "childlogin" }),
  skip: skipInTest,
});

const chatGlobalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  message: { error: "Chat is busy right now. Please try again in a moment." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
});

app.use("/api", apiLimiter);
app.use("/api/support", supportRoutes);

// ─── Auth routes ──────────────────────────────────────────────────────────────
app.use("/api/auth/child-login", childLoginLimiter);
app.use("/api/auth", authLimiter, childAuthRoutes);
app.use("/api/auth", sessionRoutes);

// ─── Parent routes ────────────────────────────────────────────────────────────
app.use("/api/parents", parentRoutes);
app.use("/api/parents/auth/send-otp", otpLimiter);
app.use("/api/parents/auth/verify-otp", otpLimiter);
app.use("/api/parents/auth/login-otp", otpLimiter);
app.use("/api/parents/auth/verify-login-otp", otpLimiter);
app.use("/api/parents/auth", authLimiter, parentAuthRoutes);
app.use("/api/parents/auth", authLimiter, googleAuthRoutes);

// ─── Children routes ──────────────────────────────────────────────────────────
app.use("/api/children", childRoutes);
app.use("/api/children/:childId/cumulative-feedback", cumulativeFeedbackRoutes);

// ─── Writing & results ────────────────────────────────────────────────────────
app.use("/api/writing", secureLegacyWriting, writingRoutes);
app.use("/api/results", secureLegacyResults, resultRoutes);
app.use("/api/results", secureLegacyResults, regenerateAiRoute);

// ─── Catalog (public) ─────────────────────────────────────────────────────────
app.use("/api/catalog", catalogRoutes);

// ─── Legacy stubs ─────────────────────────────────────────────────────────────
app.use("/api/exams", examRoutes);
app.use("/api/students", studentRoutes);

// ─── Root health ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "NAPLAN backend alive", ts: Date.now() });
});

// ─── Admin ────────────────────────────────────────────────────────────────────
app.use("/api/admin", adminRoutes);
app.use("/api/admin", adminAiFeedbackRoutes);
app.use("/api/admin", quizAiRoutes);
app.use("/api/admin", aiImageRoutes);
app.use("/api/admin/originality", originalityRoutes);
app.use("/api/tutor", tutorRoutes);

// ─── Quiz, flashcards, available quizzes ─────────────────────────────────────
app.use("/api", quizRoutes);
app.use("/api", availableQuizzesRoute);
app.use("/api", flashcardsRoute);
app.use("/api", explanationRoutes);
app.use("/api", quizExplanationsRoute);

app.use("/api/quizzes", chatGlobalLimiter, quizChatRoute);

// ─── Payments ─────────────────────────────────────────────────────────────────
app.use("/api/payments", paymentRoutes);

// ─── OCR ──────────────────────────────────────────────────────────────────────
// Rate limiting lives INSIDE ocrRoute.js (ocrBurstLimit + ocrRateLimit), mounted
// after verifyToken so it keys on verified identity rather than IP.
app.use("/api/ocr", ocrRoute);

// ─── S3 image proxy (HARDENED) ───────────────────────────────────────────────
// Serves /uploads/... by streaming from S3/MinIO.
//   • Rate-limited per IP (images burst, so the window is generous)
//   • Path-validated (blocks traversal / null bytes / bad extensions)
//   • SVG served with a locked-down CSP + nosniff (no script execution)
//   • NO local filesystem fallback — a miss is a real 404
const uploadsLimiter = rateLimit({
  windowMs: Number(process.env.UPLOADS_RATE_WINDOW_MS || 60 * 1000),
  max: Number(process.env.UPLOADS_RATE_MAX || 600),
  message: { error: "Too many image requests, please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
});

const UPLOAD_IMG_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
};

app.use("/uploads", uploadsLimiter, async (req, res) => {
  // req.path is like "/2026-03/image.jpg" (already URL-decoded by Express)
  const rel = req.path.replace(/^\/+/, "");

  // Reject traversal / null bytes / oversize keys
  if (
    !rel ||
    rel.length > 512 ||
    rel.includes("..") ||
    rel.includes("\\") ||
    rel.includes("\0")
  ) {
    return res.status(400).json({ error: "Invalid image path" });
  }

  const ext = rel.split(".").pop().toLowerCase();
  const contentType = UPLOAD_IMG_TYPES[ext];
  if (!contentType) {
    return res.status(400).json({ error: "Unsupported image type" });
  }

  // Cross-origin headers so the child/parent dashboards can load these.
  // Reflect the caller's origin from the allow-list instead of "*", reusing the
  // same isAllowedOrigin() the CORS middleware uses. Vary:Origin is required —
  // this route sets a 1-year immutable Cache-Control, so without it a shared
  // cache would replay one origin's ACAO header to everyone.
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

  const s3Key = "uploads/" + rel; // e.g. "uploads/2026-03/image.jpg"

  try {
    const s3Response = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: s3Key }),
    );

    // Harden SVG: neutralise any embedded script / external reference
    if (contentType === "image/svg+xml") {
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      );
    }

    res.setHeader("Content-Type", contentType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    if (s3Response.ETag) res.setHeader("ETag", s3Response.ETag);

    s3Response.Body.on("error", (streamErr) => {
      console.error("[/uploads] stream error:", streamErr.message);
      if (!res.headersSent) res.status(502).end();
      else res.destroy(streamErr);
    });
    s3Response.Body.pipe(res);
  } catch (err) {
    const status = err && err.$metadata && err.$metadata.httpStatusCode;
    if (
      (err && (err.name === "NoSuchKey" || err.name === "NotFound")) ||
      status === 404
    ) {
      return res.status(404).json({ error: "Image not found" });
    }
    console.error("[/uploads] S3 error:", err && err.name, err && err.message);
    return res.status(502).json({ error: "Upstream storage error" });
  }
});

// ─── Cron jobs ────────────────────────────────────────────────────────────────
// Elect ONE cron leader across instances FIRST. The cron ticks are gated by
// amILeader(); without this call amILeader() stays false and NO crons run,
// even on a single instance.
//
// Skipped entirely when DISABLE_CRONS=true so that `require("./app")` is
// side-effect-free under Jest. Without this, integration tests hang on the
// open interval handles and the cleanup jobs mutate test data mid-run.
if (process.env.DISABLE_CRONS !== "true") {
  try {
    const { startCronLeadership } = require("./utils/cronLeader");
    startCronLeadership();
  } catch (err) {
    console.warn("⚠️ Could not start cron leadership:", err.message);
  }

  try {
    const {
      setupExpiredAttemptCleanup,
    } = require("./cron/cleanupExpiredAttempts");
    setupExpiredAttemptCleanup();
  } catch (err) {
    console.warn("⚠️ Could not start expired attempt cleanup cron:", err.message);
  }

  try {
    const { setupBundleExpiryCleanup } = require("./cron/cleanupExpiredBundles");
    setupBundleExpiryCleanup();
  } catch (err) {
    console.warn("⚠️ Could not start bundle expiry cleanup cron:", err.message);
  }
} else {
  console.log("⏸️  Crons disabled (DISABLE_CRONS=true)");
}

// ─── 404 handler ──────────────────────────────────────────────────────────────
// Express 5: NO path argument. `app.use("*", ...)` or `app.all("*", ...)` will
// crash on boot under path-to-regexp v8.
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ─── Sentry error handler ─────────────────────────────────────────────────────
const Sentry = require("@sentry/node");
Sentry.setupExpressErrorHandler(app);

// ─── Global error handler ─────────────────────────────────────────────────────
// Logs full detail server-side with the request id; returns only a safe message
// plus that id to the client. See src/middleware/errorHandler.js.
const errorHandler = require("./middleware/errorHandler");
app.use(errorHandler);

module.exports = app;