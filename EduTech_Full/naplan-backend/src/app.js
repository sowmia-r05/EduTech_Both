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
const path = require("path");
const { s3, BUCKET } = require("./utils/s3Upload");
const { GetObjectCommand } = require("@aws-sdk/client-s3");

const app = express();
app.set("trust proxy", 1);

// ─── Security headers ─────────────────────────────────────────────────────────
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }, // ✅ FIX — allows images to load cross-origin
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

app.use(cookieParser());

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
const tutorRoutes = require("./routes/Tutorroutes");
const adminAiFeedbackRoutes = require("./routes/adminAiFeedbackRoutes");
const quizRoutes = require("./routes/quizRoutes");
const availableQuizzesRoute = require("./routes/availableQuizzesRoute");
const flashcardsRoute = require("./routes/flashcardsRoute");
const explanationRoutes = require("./routes/explanationRoutes");  // ✅ ADD HERE (with other requires)
const cumulativeFeedbackRoutes = require("./routes/cumulativeFeedbackRoutes");
const ocrRoute = require("./routes/ocrRoute");
const sessionRoutes = require("./routes/sessionRoutes");
const resultRoutes = require("./routes/resultRoutes");
const regenerateAiRoute = require("./routes/regenerateAiRoute");
const quizExplanationsRoute = require("./routes/quizExplanationsRoute");

const {
  secureLegacyResults,
  secureLegacyWriting,
} = require("./middleware/legacyRouteAuth");

// ─── Health check (no rate limit, no auth) ───────────────────────────────────
app.use("/api", healthRoutes);

// ─── Rate limiters ────────────────────────────────────────────────────────────

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 1000,
  message: { error: "Too many API requests", retryAfter: "60 seconds" },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 11 * 60 * 1000,
  max: 10,
  message: { error: "Too many authentication requests. Please wait a minute." },
  standardHeaders: true,
  legacyHeaders: false,
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "Too many OTP attempts. Please wait 15 minutes before trying again." },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

const childLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts. Please wait 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

app.use("/api", apiLimiter);

// ─── Auth routes ──────────────────────────────────────────────────────────────
app.use("/api/auth", authLimiter, otpAuth);
app.use("/api/auth/child-login", childLoginLimiter);
app.use("/api/auth", authLimiter, childAuthRoutes);
app.use("/api/auth", sessionRoutes);

// ─── Parent routes ────────────────────────────────────────────────────────────
app.use("/api/parents", parentRoutes);
app.use("/api/parents/auth/send-otp",   otpLimiter);
app.use("/api/parents/auth/verify-otp", otpLimiter);
app.use("/api/parents/auth/login-otp",  otpLimiter);
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
app.use("/api/admin", quizExplanationsRoute);
// add right below it:
app.use("/api/tutor", tutorRoutes);

// ─── Quiz, flashcards, available quizzes ─────────────────────────────────────
app.use("/api", quizRoutes);
app.use("/api", availableQuizzesRoute);
app.use("/api", flashcardsRoute);
app.use("/api", explanationRoutes);  // ✅ ADD HERE


// ─── Payments ─────────────────────────────────────────────────────────────────
app.use("/api/payments", paymentRoutes);

// ─── OCR ──────────────────────────────────────────────────────────────────────
app.use("/api/ocr", ocrRoute);

// ─── S3 image proxy ───────────────────────────────────────────────────────────
// Serves /uploads/... paths by proxying from S3.
// ✅ Cross-origin headers set FIRST so browsers (child dashboard) can load images.
app.use("/uploads", async (req, res) => {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const s3Key = "uploads" + req.path; // e.g. "uploads/2026-03/image.jpg"
  try {
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: s3Key });
    const s3Response = await s3.send(command);
    res.setHeader("Content-Type", s3Response.ContentType || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000");
    s3Response.Body.pipe(res);
  } catch (err) {
    const localPath = path.join(__dirname, "public", "uploads", req.path);
    res.sendFile(localPath, (sendErr) => {
      if (sendErr) res.status(404).json({ error: "Image not found" });
    });
  }
});

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
