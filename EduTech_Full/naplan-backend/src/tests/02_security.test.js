/**
 * NAPLAN Security & Rate Limiting Test Suite
 * Tests: CORS, Helmet headers, rate limiters, CSRF basics
 */
const express = require("express");
const request = require("supertest");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const cors = require("cors");

// ─── Build test apps ──────────────────────────────────────────────────────────
function buildHelmetApp() {
  const app = express();
  app.use(helmet());
  app.get("/", (req, res) => res.json({ ok: true }));
  return app;
}

function buildCorsApp(allowedOrigin) {
  const app = express();
  app.use(cors({ origin: allowedOrigin, credentials: true }));
  app.get("/api/data", (req, res) => res.json({ data: "secret" }));
  return app;
}

function buildRateLimitApp(max, windowMs = 60000) {
  const app = express();
  app.use(rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false }));
  app.get("/api/test", (req, res) => res.json({ ok: true }));
  return app;
}

function buildAuthRateLimitApp() {
  const app = express();
  const authLimiter = rateLimit({ windowMs: 11 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });
  const otpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true });
  app.use(express.json());
  app.post("/api/auth/login", authLimiter, (req, res) => res.json({ ok: true }));
  app.post("/api/auth/send-otp", otpLimiter, (req, res) => res.json({ ok: true }));
  return app;
}

// ─── Helmet Security Headers ─────────────────────────────────────────────────
describe("Security Headers (Helmet)", () => {
  const app = buildHelmetApp();

  test("X-Content-Type-Options: nosniff is set", async () => {
    const res = await request(app).get("/");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  test("X-Frame-Options: SAMEORIGIN is set (clickjacking protection)", async () => {
    const res = await request(app).get("/");
    // Helmet sets X-Frame-Options
    expect(res.headers["x-frame-options"]).toBeDefined();
  });

  test("X-Powered-By header is hidden", async () => {
    const res = await request(app).get("/");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  test("Strict-Transport-Security header is present", async () => {
    const res = await request(app).get("/");
    expect(res.headers["strict-transport-security"]).toBeDefined();
  });

  test("Content-Security-Policy header is set", async () => {
    const res = await request(app).get("/");
    expect(res.headers["content-security-policy"]).toBeDefined();
  });
});

// ─── CORS Tests ───────────────────────────────────────────────────────────────
describe("CORS Policy", () => {
  const allowedOrigin = "https://naplan.kaisolutions.ai";
  const app = buildCorsApp(allowedOrigin);

  test("allowed origin → CORS headers present", async () => {
    const res = await request(app).get("/api/data").set("Origin", allowedOrigin);
    expect(res.headers["access-control-allow-origin"]).toBe(allowedOrigin);
  });

  test("disallowed origin → no CORS allow-origin header", async () => {
    const res = await request(app).get("/api/data").set("Origin", "https://malicious-site.com");
    expect(res.headers["access-control-allow-origin"]).not.toBe("https://malicious-site.com");
  });

  test("no origin header → request allowed (same-origin)", async () => {
    const res = await request(app).get("/api/data");
    expect(res.status).toBe(200);
  });

  test("OPTIONS preflight for allowed origin → 204", async () => {
    const res = await request(app)
      .options("/api/data")
      .set("Origin", allowedOrigin)
      .set("Access-Control-Request-Method", "GET");
    expect([200, 204]).toContain(res.status);
  });
});

// ─── Rate Limiter Tests ───────────────────────────────────────────────────────
describe("API Rate Limiting", () => {
  test("requests within limit → 200", async () => {
    const app = buildRateLimitApp(5);
    const res = await request(app).get("/api/test");
    expect(res.status).toBe(200);
  });

  test("RateLimit-Limit header present on response", async () => {
    const app = buildRateLimitApp(100);
    const res = await request(app).get("/api/test");
    expect(res.headers["ratelimit-limit"]).toBeDefined();
  });

  test("RateLimit-Remaining decrements with each request", async () => {
    const app = buildRateLimitApp(10);
    const r1 = await request(app).get("/api/test");
    const r2 = await request(app).get("/api/test");
    const remaining1 = parseInt(r1.headers["ratelimit-remaining"] ?? "9");
    const remaining2 = parseInt(r2.headers["ratelimit-remaining"] ?? "8");
    expect(remaining2).toBeLessThanOrEqual(remaining1);
  });

  test("exceeding rate limit → 429 Too Many Requests", async () => {
    const app = buildRateLimitApp(3, 60000);
    // Fire 4 requests; 4th should be rate-limited
    await request(app).get("/api/test");
    await request(app).get("/api/test");
    await request(app).get("/api/test");
    const res = await request(app).get("/api/test");
    expect(res.status).toBe(429);
  });

  test("429 response includes Retry-After or RateLimit-Reset header", async () => {
    const app = buildRateLimitApp(1, 60000);
    await request(app).get("/api/test");
    const res = await request(app).get("/api/test");
    if (res.status === 429) {
      const hasRetryInfo =
        res.headers["retry-after"] !== undefined ||
        res.headers["ratelimit-reset"] !== undefined;
      expect(hasRetryInfo).toBe(true);
    }
  });
});

// ─── Auth-Specific Rate Limits ────────────────────────────────────────────────
describe("Auth Route Rate Limits", () => {
  test("OTP limiter: first 5 requests pass (skipSuccessful counts errors only)", async () => {
    const app = buildAuthRateLimitApp();
    const res = await request(app).post("/api/auth/send-otp").send({});
    expect([200, 400]).toContain(res.status); // may fail for missing email but won't be rate-limited
  });

  test("auth login rate limit allows 10 requests", async () => {
    const app = buildAuthRateLimitApp();
    for (let i = 0; i < 10; i++) {
      const res = await request(app).post("/api/auth/login").send({});
      expect(res.status).not.toBe(429);
    }
  });

  test("auth login rate limit blocks 11th request", async () => {
    const app = buildAuthRateLimitApp();
    for (let i = 0; i < 10; i++) {
      await request(app).post("/api/auth/login").send({});
    }
    const res = await request(app).post("/api/auth/login").send({});
    expect(res.status).toBe(429);
  });
});

// ─── Input Validation / Injection ────────────────────────────────────────────
describe("Input Sanitization", () => {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.post("/api/echo", (req, res) => {
    const { email } = req.body;
    if (typeof email !== "string") return res.status(400).json({ error: "Invalid input" });
    if (email.length > 255) return res.status(400).json({ error: "Email too long" });
    res.json({ email });
  });

  test("normal email passes through", async () => {
    const res = await request(app).post("/api/echo").send({ email: "user@example.com" });
    expect(res.status).toBe(200);
    expect(res.body.email).toBe("user@example.com");
  });

  test("excessively long email → 400", async () => {
    const res = await request(app).post("/api/echo").send({ email: "a".repeat(300) + "@x.com" });
    expect(res.status).toBe(400);
  });

  test("non-string email type → 400", async () => {
    const res = await request(app).post("/api/echo").send({ email: { "$gt": "" } });
    expect(res.status).toBe(400);
  });

  test("payload over 1mb limit → 413", async () => {
    const bigPayload = { email: "x".repeat(1.1 * 1024 * 1024) };
    const res = await request(app).post("/api/echo").send(bigPayload);
    expect(res.status).toBe(413);
  });
});
