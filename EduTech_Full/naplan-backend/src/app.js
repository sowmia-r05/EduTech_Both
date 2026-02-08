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

const app = express();

// ✅ If you're running behind a reverse proxy (ngrok/Cloudflare Tunnel/etc.)
app.set("trust proxy", 1);

// ✅ CORS (ONLY ONCE)
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "";

// normalize: remove trailing slash from env origins
const allowedOrigins = FRONTEND_ORIGIN
  ? FRONTEND_ORIGIN.split(",").map((s) => s.trim().replace(/\/$/, ""))
  : [];

const corsOptions = {
  origin: (origin, cb) => {
    // Allow requests with no origin (Postman/curl/server-to-server)
    if (!origin) return cb(null, true);

    const cleanOrigin = origin.replace(/\/$/, "");

    // If env not set, allow all (dev)
    if (!allowedOrigins.length) return cb(null, true);

    if (allowedOrigins.includes(cleanOrigin)) return cb(null, true);

    return cb(new Error("CORS blocked: " + origin));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  // optional:
  // exposedHeaders: ["Content-Length", "Date"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // ✅ IMPORTANT: preflight for all routes

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
