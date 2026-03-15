require("dotenv").config();

// Force IPv4 — fixes ENETUNREACH to Gmail on Render/Railway
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");

// ─── Startup env validation ───────────────────────────────────────────────────
// Throw immediately with a clear message if critical vars are missing.
// Prevents silent failures like CORS blocking all requests in production.
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
    // Warn (don't throw) in dev
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
const path = require("path");

const app = express();
app.set("trust proxy", 1);

// ─── Security headers ─────────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:", "https://*.stripe.com"],
        connectSrc: [
          "'self'",
          "https://api.stripe.com",
          "https://checkout.stripe.com",
        ],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'", "blob:"],
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
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN;
const IS_DEV = process.env.NODE_ENV !== "production";

app.use(
  cors({
    origin: FRONTEND_ORIGIN
      ? FRONTEND_ORIGIN.split(",").map((s) => s.trim())
      : IS_DEV
        ? ["http://localhost:5173", "http://localhost:3000"]
        : false,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  }),
);

// ─── Core middleware ──────────────────────────────────────────────────────────
app.use(cookieParser());

// FIX: was 100mb — reduced to 1mb to prevent large-payload DoS.
// Image/file uploads use multer (multipart) and are not affected by this limit.
// Stripe webhook needs raw body — the verify callback captures it.
app.use(
  express.json({
    limit: "1mb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }),
);

// ─── Route imports ────────────────────────────────────────────────────────────
const healthRoutes = require("./routes/healthRoutes");
const examRoutes = require("./routes/examRoutes");
const studentRoutes = require("./routes/studentRoutes");
const writingRoutes = require("./routes/writingRoutes");
const catalogRoutes = require("./routes/catalogRoutes");
const otpAuth = require("./routes/otpAuth");
const parentRoutes = require("./routes/parentRoutes");
const googleAuthRoutes = require("./routes/googleAuthRoutes");
const parentAuthRoutes = require("./routes/parentAuthRoutes");
const childRoutes = require("./routes/childRoutes");
const childAuthRoutes = require("./routes/childAuthRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const adminRoutes = require("./routes/adminRoutes");
const adminAiFeedbackRoutes = require("./routes/adminAiFeedbackRoutes");
const quizRoutes = require("./routes/quizRoutes");
const availableQuizzesRoute = require("./routes/availableQuizzesRoute");
const flashcardsRoute = require("./routes/flashcardsRoute");
const cumulativeFeedbackRoutes = require("./routes/cumulativeFeedbackRoutes");
const ocrRoute = require("./routes/ocrRoute");
const sessionRoutes = require("./routes/sessionRoutes");
const resultRoutes = require("./routes/resultRoutes");
const regenerateAiRoute = require("./routes/regenerateAiRoute");

// FIX: FlexiQuiz is removed — legacy routes now require auth on ALL methods.
// No more unauthenticated POST allowed through.
const {
  secureLegacyResults,
  secureLegacyWriting,
} = require("./middleware/legacyRouteAuth");

// ─── Health check (no rate limit, no auth) ───────────────────────────────────
app.use("/api", healthRoutes);

// ─── Rate limiters ────────────────────────────────────────────────────────────

// General: 1000 req/min across all API routes
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 1000,
  message: { error: "Too many API requests", retryAfter: "60 seconds" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth: 10 req/min on signup/login routes (prevents credential stuffing)
const authLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 10,
  message: { error: "Too many authentication requests. Please wait a minute." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api", apiLimiter);

// ─── Auth routes ──────────────────────────────────────────────────────────────
app.use("/api/auth", authLimiter, otpAuth);
app.use("/api/auth", authLimiter, childAuthRoutes);
app.use("/api/auth", sessionRoutes);

// ─── Parent routes ────────────────────────────────────────────────────────────
app.use("/api/parents", parentRoutes);
app.use("/api/parents/auth", authLimiter, parentAuthRoutes);
app.use("/api/parents/auth", authLimiter, googleAuthRoutes);

// ─── Children routes ──────────────────────────────────────────────────────────
app.use("/api/children", childRoutes);
app.use("/api/children/:childId/cumulative-feedback", cumulativeFeedbackRoutes);

// ─── Writing & results (auth required on all methods — FlexiQuiz removed) ────
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

// ─── Quiz, flashcards, available quizzes ─────────────────────────────────────
app.use("/api", quizRoutes);
app.use("/api", availableQuizzesRoute);
app.use("/api", flashcardsRoute);

// ─── Payments ─────────────────────────────────────────────────────────────────
app.use("/api/payments", paymentRoutes);

// ─── OCR ──────────────────────────────────────────────────────────────────────
app.use("/api/ocr", ocrRoute);

// ─── Static file serving ──────────────────────────────────────────────────────
app.use("/uploads", express.static(path.join(__dirname, "public", "uploads")));

// ─── Cron jobs ────────────────────────────────────────────────────────────────
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

// ─── Global error handler ─────────────────────────────────────────────────────
// Catches any error thrown inside a route handler and returns clean JSON
// instead of crashing the process or leaking a stack trace to the client.
// Must be defined LAST, after all routes.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  console.error(`[Error] ${req.method} ${req.path} — ${err.message}`);
  if (IS_DEV) console.error(err.stack);

  res.status(status).json({
    error: status === 500 ? "Internal server error" : err.message || "Error",
    ...(IS_DEV ? { detail: err.message } : {}),
  });
});

module.exports = app;
