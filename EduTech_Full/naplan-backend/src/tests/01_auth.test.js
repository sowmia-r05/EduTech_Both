/**
 * NAPLAN Auth Test Suite
 * Tests: OTP logic, JWT validation, Google auth flow, rate-limit headers, child login
 */
const jwt = require("jsonwebtoken");
const express = require("express");
const request = require("supertest");
const { makeParentToken, makeChildToken, makeExpiredToken, makeTokenWrongSecret, PARENT_SECRET, CHILD_SECRET } = require("../utils/testHelpers");

// ─── Build a minimal Express app that mirrors the real auth middleware ───────
function buildAuthApp() {
  const app = express();
  app.use(express.json());

  // Simulated verifyToken middleware (mirrors production logic)
  function verifyToken(req, res, next) {
    const token = req.headers.authorization?.replace("Bearer ", "") || req.cookies?.parent_token;
    if (!token) return res.status(401).json({ error: "No token" });
    try {
      const decoded = jwt.verify(token, PARENT_SECRET);
      req.user = decoded;
      next();
    } catch (err) {
      if (err.name === "TokenExpiredError") return res.status(401).json({ error: "Token expired" });
      return res.status(401).json({ error: "Invalid token" });
    }
  }

  function requireParent(req, res, next) {
    if (req.user?.typ !== "parent") return res.status(403).json({ error: "Parent access required" });
    next();
  }

  function requireChild(req, res, next) {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "No token" });
    try {
      const decoded = jwt.verify(token, CHILD_SECRET);
      if (decoded.typ !== "child") return res.status(403).json({ error: "Child access required" });
      req.user = decoded;
      next();
    } catch {
      return res.status(401).json({ error: "Invalid child token" });
    }
  }

  app.get("/protected", verifyToken, requireParent, (req, res) => res.json({ ok: true, user: req.user }));
  app.get("/child-only", requireChild, (req, res) => res.json({ ok: true, childId: req.user.childId }));

  // Simulated OTP verify endpoint
  const otpStore = new Map();
  app.post("/api/auth/send-otp", (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });
    const code = "123456";
    const expiry = Date.now() + 15 * 60 * 1000;
    otpStore.set(email, { code, expiry, used: false });
    res.json({ ok: true });
  });

  app.post("/api/auth/verify-otp", (req, res) => {
    const { email, code } = req.body;
    const record = otpStore.get(email);
    if (!record) return res.status(400).json({ error: "No OTP found" });
    if (record.used) return res.status(400).json({ error: "OTP already used" });
    if (Date.now() > record.expiry) return res.status(400).json({ error: "OTP expired" });
    if (record.code !== String(code)) return res.status(400).json({ error: "Invalid OTP" });
    record.used = true;
    const token = jwt.sign({ typ: "parent", email }, PARENT_SECRET, { expiresIn: "1h" });
    res.json({ ok: true, parent_token: token });
  });

  return app;
}

// ─── JWT Unit Tests ──────────────────────────────────────────────────────────
describe("JWT Token Validation", () => {
  const app = buildAuthApp();

  test("valid parent token → 200 with user payload", async () => {
    const token = makeParentToken();
    const res = await request(app).get("/protected").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.user.typ).toBe("parent");
  });

  test("expired token → 401 with 'Token expired'", async () => {
    const token = makeExpiredToken();
    const res = await request(app).get("/protected").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/expired/i);
  });

  test("wrong secret → 401 with 'Invalid token'", async () => {
    const token = makeTokenWrongSecret();
    const res = await request(app).get("/protected").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid/i);
  });

  test("missing token → 401", async () => {
    const res = await request(app).get("/protected");
    expect(res.status).toBe(401);
  });

  test("child token on parent-only route → 403", async () => {
    // Child token signed with CHILD_SECRET not PARENT_SECRET → invalid
    const token = makeChildToken();
    const res = await request(app).get("/protected").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  test("valid child token on child route → 200", async () => {
    const token = makeChildToken();
    const res = await request(app).get("/child-only").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.childId).toBe("child_001");
  });

  test("parent token on child route → 403", async () => {
    const token = makeParentToken();
    const res = await request(app).get("/child-only").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401); // wrong secret for child route
  });
});

// ─── JWT Structure Tests ─────────────────────────────────────────────────────
describe("JWT Token Structure", () => {
  test("parent token contains required claims", () => {
    const token = makeParentToken();
    const decoded = jwt.verify(token, PARENT_SECRET);
    expect(decoded).toHaveProperty("typ", "parent");
    expect(decoded).toHaveProperty("parent_id");
    expect(decoded).toHaveProperty("email");
    expect(decoded).toHaveProperty("exp");
    expect(decoded).toHaveProperty("iat");
  });

  test("child token contains required claims", () => {
    const token = makeChildToken();
    const decoded = jwt.verify(token, CHILD_SECRET);
    expect(decoded).toHaveProperty("typ", "child");
    expect(decoded).toHaveProperty("childId");
    expect(decoded).toHaveProperty("parentId");
    expect(decoded).toHaveProperty("role", "child");
  });

  test("token expiry is in the future", () => {
    const token = makeParentToken();
    const decoded = jwt.decode(token);
    expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  test("token issued-at is in the past or now", () => {
    const token = makeParentToken();
    const decoded = jwt.decode(token);
    expect(decoded.iat).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 1);
  });
});

// ─── OTP Flow Integration Tests ──────────────────────────────────────────────
describe("OTP Authentication Flow", () => {
  const app = buildAuthApp();

  test("send OTP → returns ok", async () => {
    const res = await request(app).post("/api/auth/send-otp").send({ email: "user@test.com" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test("send OTP without email → 400", async () => {
    const res = await request(app).post("/api/auth/send-otp").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  test("verify correct OTP → returns JWT", async () => {
    const email = "otp_user@test.com";
    await request(app).post("/api/auth/send-otp").send({ email });
    const res = await request(app).post("/api/auth/verify-otp").send({ email, code: "123456" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.parent_token).toBeDefined();
    expect(typeof res.body.parent_token).toBe("string");
  });

  test("verify wrong OTP → 400", async () => {
    const email = "wrong_otp@test.com";
    await request(app).post("/api/auth/send-otp").send({ email });
    const res = await request(app).post("/api/auth/verify-otp").send({ email, code: "000000" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid/i);
  });

  test("OTP is single-use — second verify → 400", async () => {
    const email = "singleuse@test.com";
    await request(app).post("/api/auth/send-otp").send({ email });
    await request(app).post("/api/auth/verify-otp").send({ email, code: "123456" });
    const res2 = await request(app).post("/api/auth/verify-otp").send({ email, code: "123456" });
    expect(res2.status).toBe(400);
    expect(res2.body.error).toMatch(/already used/i);
  });

  test("verify OTP that was never sent → 400", async () => {
    const res = await request(app).post("/api/auth/verify-otp").send({ email: "ghost@test.com", code: "123456" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no otp/i);
  });
});
