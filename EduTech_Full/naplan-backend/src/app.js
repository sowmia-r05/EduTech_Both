require("dotenv").config();
const express = require("express");
const rateLimit = require("express-rate-limit");
const cors = require("cors");

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

// ✅ Apply rate limiting
app.use("/api/webhooks", webhookLimiter);
app.use("/api", apiLimiter);

// ✅ Routes
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
