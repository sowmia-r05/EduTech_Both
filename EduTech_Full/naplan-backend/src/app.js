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

// ─── NEW: Phase 1 routes ───
const parentAuthRoutes = require("./routes/parentAuthRoutes");
const childRoutes = require("./routes/childRoutes");
const { requireParent } = require("./middleware/auth");

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
    methods: ["GET", "POST", "PUT", "DELETE"],
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

// 🛡️ Auth rate limiting
// Dev: 100/min (so tests can run); Production: 10/min (brute force protection)
const authLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: process.env.NODE_ENV === "production" ? 10 : 100,
  message: { error: "Too many login attempts. Please wait a minute." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ✅ Apply rate limiting
app.use("/api/webhooks", webhookLimiter);
app.use("/api/auth", authLimiter);
app.use("/api", apiLimiter);

// ═══════════════════════════════════════════
// ✅ NEW: Parent auth routes (Phase 1)
// ═══════════════════════════════════════════
// Public: register, login, verify-email, forgot/reset-password
// Protected: GET /api/auth/me (requireParent applied inline)
app.use("/api/auth", (req, res, next) => {
  // Apply requireParent ONLY to GET /me; let all other routes pass through
  if (req.method === "GET" && req.path === "/me") {
    return requireParent(req, res, next);
  }
  next();
}, parentAuthRoutes);

// ═══════════════════════════════════════════
// ✅ NEW: Child routes (Phase 1)
// ═══════════════════════════════════════════
// POST /api/children/login — public (child login with username + PIN)
// GET/POST/PUT/DELETE /api/children/* — parent JWT required (handled inside childRoutes)
// GET /api/children/check-username — public (live uniqueness check)
app.use("/api/children", childRoutes);

// ═══════════════════════════════════════════
// ✅ Existing routes (unchanged)
// ═══════════════════════════════════════════
app.use("/api/webhooks", webhookRoutes);

app.use("/api/flexiquiz", flexiQuizRoutes);
app.use("/api/flexiquiz", flexiquizSso);

app.use("/api/auth", otpAuth);

app.use("/api/results", resultsRoutes);
app.use("/api/writing", writingRoutes);
app.use("/api/catalog", catalogRoutes);
app.use("/api/users", userRoutes);

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

module.exports = app;
