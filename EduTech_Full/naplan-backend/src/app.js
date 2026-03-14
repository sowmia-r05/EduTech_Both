// ✅ Force IPv4 first (fixes ENETUNREACH to Gmail IPv6 on Render)

require("dotenv").config();
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");

const express = require("express");
const rateLimit = require("express-rate-limit");
const cors = require("cors");
const helmet = require("helmet"); // ✅ NEW
const cookieParser = require("cookie-parser"); // ✅ NEW (for S-02)
const path = require("path");

const app = express();
app.set("trust proxy", 1);

// ✅ Security headers — must come BEFORE routes and BEFORE cors
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

// ✅ CORS — after helmet
// Replace the cors() config in app.js with this:
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN;
const IS_DEV = process.env.NODE_ENV !== "production";

app.use(
  cors({
    origin: FRONTEND_ORIGIN
      ? FRONTEND_ORIGIN.split(",").map((s) => s.trim())
      : IS_DEV
        ? "http://localhost:5173"   // ✅ safe default for local dev only
        : false,                    // ✅ locked down in production
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  })
);


// ✅ Cookie parser (needed for httpOnly cookie auth — S-02)
app.use(cookieParser());

// ✅ JSON body parsing
app.use(
  express.json({
    limit: "1mb", // ✅ ALSO fixes S-18: was 100mb
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }),
);


// ─── Routes ───
const examRoutes = require("./routes/examRoutes");
const studentRoutes = require("./routes/studentRoutes");
const writingRoutes = require("./routes/writingRoutes");
const catalogRoutes = require("./routes/catalogRoutes");
const otpAuth = require("./routes/otpAuth");
const parentRoutes = require("./routes/parentRoutes");
const googleAuthRoutes = require("./routes/googleAuthRoutes");
const parentAuthRoutes = require("./routes/parentAuthRoutes");

// ─── NEW routes ───
const childRoutes = require("./routes/childRoutes");
const childAuthRoutes = require("./routes/childAuthRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const adminRoutes = require("./routes/adminRoutes");
const quizRoutes = require("./routes/quizRoutes");
const availableQuizzesRoute = require("./routes/availableQuizzesRoute");
const flashcardsRoute = require("./routes/flashcardsRoute");
const adminAiFeedbackRoutes = require("./routes/adminAiFeedbackRoutes");
const healthRoutes = require("./routes/healthRoutes");
const cumulativeFeedbackRoutes = require("./routes/cumulativeFeedbackRoutes");
const ocrRoute = require("./routes/ocrRoute"); 
const sessionRoutes = require("./routes/sessionRoutes");


// ✅ Legacy route auth middleware
const {
  secureLegacyResults,
  secureLegacyWriting,
} = require("./middleware/legacyRouteAuth");
const resultRoutes = require("./routes/resultRoutes");
const regenerateAiRoute = require("./routes/regenerateAiRoute");



app.set("trust proxy", 1);



app.use(cookieParser());

// ✅ JSON + keep raw body for Stripe webhook signature verification
app.use(
  express.json({
    limit: "100mb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.use("/api", healthRoutes);

// 🛡️ General API rate limiting
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 1000,
  message: { error: "Too many API requests", retryAfter: "60 seconds" },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api", apiLimiter);

// ✅ Routes — Auth (no auth middleware)
app.use("/api/auth", otpAuth);
app.use("/api/auth", childAuthRoutes);

// ✅ Routes — Parent
app.use("/api/parents", parentRoutes);
app.use("/api/parents/auth", parentAuthRoutes);
app.use("/api/parents/auth", googleAuthRoutes);

// ✅ Routes — Children
app.use("/api/children", childRoutes);
app.use("/api/children/:childId/cumulative-feedback", cumulativeFeedbackRoutes);

// ✅ Routes — Writing (secured)
app.use("/api/writing", secureLegacyWriting, writingRoutes);
app.use("/api/results", secureLegacyResults, resultRoutes);     
app.use("/api/results", secureLegacyResults, regenerateAiRoute); 

// ✅ Routes — Catalog (public)
app.use("/api/catalog", catalogRoutes);

// ✅ Routes — Legacy stubs
app.use("/api/exams", examRoutes);
app.use("/api/students", studentRoutes);

// ✅ Health check
app.get("/", (req, res) => {
  res.json({ status: "NAPLAN backend alive" });
});

// ✅ Routes — Admin, Quiz, Payments, OCR
app.use("/api/admin", adminRoutes);
app.use("/api/admin", adminAiFeedbackRoutes);
app.use("/api", quizRoutes);
app.use("/api", availableQuizzesRoute);
app.use("/api", flashcardsRoute);
app.use("/api/payments", paymentRoutes);
app.use("/api/auth", sessionRoutes);
app.use("/api/ocr", ocrRoute); // ✅ OCR route — must be BEFORE static files

// ✅ Static uploads
app.use("/uploads", express.static(path.join(__dirname, "public", "uploads")));

// ═══════════════════════════════════════
// CRON JOBS
// ═══════════════════════════════════════
try {
  const { setupExpiredAttemptCleanup } = require("./cron/cleanupExpiredAttempts");
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

module.exports = app;