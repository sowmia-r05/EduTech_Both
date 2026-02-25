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

// ─── Phase 1 routes ───
const parentAuthRoutes = require("./routes/parentAuthRoutes");
const childRoutes = require("./routes/childRoutes");
const { requireParent } = require("./middleware/auth");

// ─── Phase 3 routes ───
const bundleRoutes = require("./routes/bundleRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const stripeWebhook = require("./routes/stripeWebhook");

const app = express();

// ✅ If you're running behind a reverse proxy (ngrok/Cloudflare Tunnel/etc.)
app.set("trust proxy", 1);

// ✅ CORS (ONLY ONCE)
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN;

app.use(
  cors({
    origin: FRONTEND_ORIGIN
      ? FRONTEND_ORIGIN.split(",").map((s) => s.trim())
      : true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
  })
);

// ═══════════════════════════════════════════
// ⚠️ STRIPE WEBHOOK: must be BEFORE express.json()
// Stripe needs the raw body for signature verification.
// ═══════════════════════════════════════════
app.use(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json" }),
  (req, res, next) => {
    // express.raw gives us Buffer in req.body; store as rawBody for the webhook handler
    req.rawBody = req.body;
    // Parse it as JSON for convenient access too
    try {
      req.body = JSON.parse(req.rawBody.toString());
    } catch {}
    next();
  }
);
app.use("/api/webhooks/stripe", stripeWebhook);

// ✅ JSON for everything else + keep raw body for other webhook verification
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

// 🛡️ Rate limiting
const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  message: { error: "Too many webhook requests", retryAfter: "60 seconds" },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 1000,
  message: { error: "Too many API requests", retryAfter: "60 seconds" },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: process.env.NODE_ENV === "production" ? 10 : 100,
  message: { error: "Too many login attempts. Please wait a minute." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/webhooks", webhookLimiter);
app.use("/api/auth", authLimiter);
app.use("/api", apiLimiter);

// ═══════════════════════════════════════════
// Auth routes
// ═══════════════════════════════════════════
app.use("/api/auth", (req, res, next) => {
  if (req.method === "GET" && req.path === "/me") {
    return requireParent(req, res, next);
  }
  next();
}, parentAuthRoutes);

// ═══════════════════════════════════════════
// Child routes
// ═══════════════════════════════════════════
app.use("/api/children", childRoutes);

// ═══════════════════════════════════════════
// Phase 3: Bundles + Payments
// ═══════════════════════════════════════════
app.use("/api/catalog", bundleRoutes);   // GET /api/catalog/bundles (public)
app.use("/api/payments", paymentRoutes); // POST /api/payments/checkout, GET /history, GET /verify

// ═══════════════════════════════════════════
// Existing routes
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

app.get("/api/test-flexiquiz-key", (req, res) => {
  res.json({ hasKey: !!process.env.FLEXIQUIZ_API_KEY });
});

module.exports = app;
