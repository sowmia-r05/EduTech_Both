// ✅ Force IPv4 first (fixes ENETUNREACH to Gmail IPv6 on Render)
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");

require("dotenv").config();
const express = require("express");
const rateLimit = require("express-rate-limit");
const cors = require("cors");

// ─── Existing routes ───
const examRoutes = require("./routes/examRoutes");
const studentRoutes = require("./routes/studentRoutes");
const webhookRoutes = require("./routes/webhookRoutes");
const resultsRoutes = require("./routes/resultRoutes");
const writingRoutes = require("./routes/writingRoutes");
const catalogRoutes = require("./routes/catalogRoutes");
const userRoutes = require("./routes/userRoutes");
const flexiQuizRoutes = require("./routes/flexiQuizRoutes");
const otpAuth = require("./routes/otpAuth");
const flexiquizSso = require("./routes/flexiquizSso");
const parentRoutes = require("./routes/parentRoutes");
const parentAuthRoutes = require("./routes/parentAuthRoutes");
const regenerateAiRoute = require("./routes/regenerateAiRoute");

// ─── NEW routes ───
const childRoutes = require("./routes/childRoutes");
const childAuthRoutes = require("./routes/childAuthRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const adminRoutes = require("./routes/adminRoutes");
const quizRoutes = require("./routes/quizRoutes");
const availableQuizzesRoute = require("./routes/availableQuizzesRoute"); // ✅ ADDED
const flashcardsRoute = require("./routes/flashcardsRoute");             // ✅ ADDED
const adminAiFeedbackRoutes = require("./routes/adminAiFeedbackRoutes");

// ✅ Issue #6: Legacy route auth middleware
const { secureLegacyResults, secureLegacyWriting } = require("./middleware/legacyRouteAuth");

const app = express();

// ✅ If you're running behind a reverse proxy (ngrok/Cloudflare Tunnel/etc.)
app.set("trust proxy", 1);

// ✅ CORS (ONLY ONCE)
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN;

app.use(
  cors({
    origin: FRONTEND_ORIGIN
      ? FRONTEND_ORIGIN.split(",").map((s) => s.trim())
      : true, // allow all in dev if not set
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  })
);

// ✅ JSON + keep raw body for webhook signature verification if needed
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

// 🛡️ Webhook rate limiting - allow 100 requests per minute
const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  message: { error: "Too many webhook requests", retryAfter: "60 seconds" },
  standardHeaders: true,
  legacyHeaders: false,
});

// 🛡️ General API rate limiting - allow 1000 requests per minute
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 1000,
  message: { error: "Too many API requests", retryAfter: "60 seconds" },
  standardHeaders: true,
  legacyHeaders: false,
});

// ✅ Apply rate limiting
app.use("/api/webhooks", webhookLimiter);
app.use("/api", apiLimiter);

//AI Refetch
app.use("/api/results", secureLegacyResults, regenerateAiRoute);

// ✅ Routes — webhooks (no auth)
app.use("/api/webhooks", webhookRoutes);

// ✅ Routes — FlexiQuiz
app.use("/api/flexiquiz", flexiQuizRoutes);
app.use("/api/flexiquiz", flexiquizSso);

// ✅ Routes — Auth (no auth middleware — these ARE the login endpoints)
app.use("/api/auth", otpAuth);
app.use("/api/auth", childAuthRoutes); // POST /api/auth/child-login

// ✅ Routes — Parent auth (OTP send/verify)
app.use("/api/parents", parentRoutes);
app.use("/api/parents/auth", parentAuthRoutes);

// ✅ Routes — Children (auth applied inside the route file per-endpoint)
app.use("/api/children", childRoutes);

// ✅ Issue #6: Routes — Data (SECURED with legacy auth middleware)
// GET requests require JWT auth; POST webhooks pass through
app.use("/api/results", secureLegacyResults, resultsRoutes);
app.use("/api/writing", secureLegacyWriting, writingRoutes);

// ✅ Routes — Catalog (public)
app.use("/api/catalog", catalogRoutes);
app.use("/api/users", userRoutes);

// ✅ Routes — Legacy (exam/student stubs)
app.use("/api/exams", examRoutes);
app.use("/api/students", studentRoutes);

// ✅ Health check
app.get("/", (req, res) => {
  res.json({ status: "NAPLAN backend alive" });
});

// ✅ Test if FlexiQuiz key is set (safe: no secret printed)
app.get("/api/test-flexiquiz-key", (req, res) => {
  res.json({ hasKey: !!process.env.FLEXIQUIZ_API_KEY });
});

// ✅ Routes — Admin, Quiz, Payments
app.use("/api/admin", adminRoutes);
app.use("/api/admin", adminAiFeedbackRoutes);
app.use("/api", quizRoutes);
app.use("/api", availableQuizzesRoute);  // ✅ ADDED — powers child dashboard quiz list
app.use("/api", flashcardsRoute);        // ✅ ADDED — powers flashcard review
app.use("/api/payments", paymentRoutes);

// ═══════════════════════════════════════
// CRON JOBS
// ═══════════════════════════════════════

// ✅ Round 1: Clean up expired quiz attempts (every 5 min)
try {
  const { setupExpiredAttemptCleanup } = require("./cron/cleanupExpiredAttempts");
  setupExpiredAttemptCleanup();
} catch (err) {
  console.warn("⚠️ Could not start expired attempt cleanup cron:", err.message);
}

// ✅ Issue #4: Clean up expired bundle purchases (every 1 hour)
try {
  const { setupBundleExpiryCleanup } = require("./cron/cleanupExpiredBundles");
  setupBundleExpiryCleanup();
} catch (err) {
  console.warn("⚠️ Could not start bundle expiry cleanup cron:", err.message);
}

module.exports = app;
