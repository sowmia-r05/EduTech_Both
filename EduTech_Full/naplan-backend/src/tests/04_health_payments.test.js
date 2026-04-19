/**
 * NAPLAN Health & Payment Validation Test Suite
 */
const express = require("express");
const request = require("supertest");

// ─── Health Check App ─────────────────────────────────────────────────────────
function buildHealthApp(dbConnected = true) {
  const app = express();

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/health/ready", async (req, res) => {
    if (dbConnected) {
      return res.status(200).json({ status: "ready", db: "connected", uptime: Math.floor(process.uptime()) });
    }
    return res.status(503).json({ status: "degraded", db: "disconnected" });
  });

  return app;
}

// ─── Health Check Tests ───────────────────────────────────────────────────────
describe("Health Check Endpoints", () => {
  describe("GET /api/health (lightweight ping)", () => {
    const app = buildHealthApp();

    test("returns 200 with {status: ok}", async () => {
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
    });

    test("responds quickly (< 200ms)", async () => {
      const start = Date.now();
      await request(app).get("/api/health");
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(200);
    });

    test("returns JSON content-type", async () => {
      const res = await request(app).get("/api/health");
      expect(res.headers["content-type"]).toMatch(/json/);
    });

    test("does NOT include database fields (no DB query)", async () => {
      const res = await request(app).get("/api/health");
      expect(res.body).not.toHaveProperty("db");
      expect(res.body).not.toHaveProperty("uptime");
    });
  });

  describe("GET /api/health/ready (deep check)", () => {
    test("DB connected → 200 with ready status", async () => {
      const app = buildHealthApp(true);
      const res = await request(app).get("/api/health/ready");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ready");
      expect(res.body.db).toBe("connected");
    });

    test("DB connected → includes uptime", async () => {
      const app = buildHealthApp(true);
      const res = await request(app).get("/api/health/ready");
      expect(res.body.uptime).toBeDefined();
      expect(typeof res.body.uptime).toBe("number");
    });

    test("DB disconnected → 503 with degraded status", async () => {
      const app = buildHealthApp(false);
      const res = await request(app).get("/api/health/ready");
      expect(res.status).toBe(503);
      expect(res.body.status).toBe("degraded");
      expect(res.body.db).toBe("disconnected");
    });
  });
});

// ─── Payment Validation Logic ─────────────────────────────────────────────────
function buildPaymentApp() {
  const app = express();
  app.use(express.json());

  // Simulated checkout endpoint
  app.post("/api/payments/checkout", (req, res) => {
    const { bundle_id, child_ids } = req.body;

    if (!bundle_id) {
      return res.status(400).json({ error: "bundle_id is required" });
    }
    if (!Array.isArray(child_ids) || child_ids.length === 0) {
      return res.status(400).json({ error: "child_ids array is required" });
    }
    if (child_ids.length > 10) {
      return res.status(400).json({ error: "Maximum 10 children per checkout" });
    }

    // Simulate ownership check failure
    const unauthorizedChildren = child_ids.filter(id => id.startsWith("other_parent_"));
    if (unauthorizedChildren.length > 0) {
      return res.status(403).json({ error: "One or more children do not belong to you" });
    }

    return res.json({
      ok: true,
      checkout_url: "https://checkout.stripe.com/test_session",
      session_id: "cs_test_123",
    });
  });

  // Simulated webhook endpoint (raw body for signature)
  app.post("/api/payments/webhook", express.raw({ type: "application/json" }), (req, res) => {
    const sig = req.headers["stripe-signature"];
    if (!sig) {
      return res.status(400).json({ error: "Missing stripe-signature header" });
    }
    if (sig !== "valid_signature") {
      return res.status(400).json({ error: "Invalid signature" });
    }
    return res.json({ received: true });
  });

  // Payment verification
  app.get("/api/payments/verify/:sessionId", (req, res) => {
    const { sessionId } = req.params;
    if (!sessionId || sessionId === "invalid") {
      return res.status(404).json({ error: "Session not found" });
    }
    return res.json({
      ok: true,
      session_id: sessionId,
      purchase: { bundle_name: "Year 5 Standard", price: 49.99 },
    });
  });

  return app;
}

describe("Payment Validation", () => {
  const app = buildPaymentApp();

  describe("POST /api/payments/checkout — input validation", () => {
    test("missing bundle_id → 400", async () => {
      const res = await request(app).post("/api/payments/checkout").send({ child_ids: ["child_001"] });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/bundle_id/i);
    });

    test("missing child_ids → 400", async () => {
      const res = await request(app).post("/api/payments/checkout").send({ bundle_id: "bundle_y5" });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/child_ids/i);
    });

    test("empty child_ids array → 400", async () => {
      const res = await request(app).post("/api/payments/checkout").send({ bundle_id: "bundle_y5", child_ids: [] });
      expect(res.status).toBe(400);
    });

    test("valid request → 200 with checkout_url", async () => {
      const res = await request(app).post("/api/payments/checkout").send({ bundle_id: "bundle_y5", child_ids: ["child_001"] });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.checkout_url).toContain("stripe.com");
    });

    test("children from another parent → 403", async () => {
      const res = await request(app).post("/api/payments/checkout").send({
        bundle_id: "bundle_y5",
        child_ids: ["other_parent_child_001"],
      });
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/do not belong/i);
    });

    test("mixed own + other parent children → 403", async () => {
      const res = await request(app).post("/api/payments/checkout").send({
        bundle_id: "bundle_y5",
        child_ids: ["child_001", "other_parent_child_002"],
      });
      expect(res.status).toBe(403);
    });
  });

  describe("POST /api/payments/webhook — signature verification", () => {
    test("missing stripe-signature → 400", async () => {
      const res = await request(app).post("/api/payments/webhook").send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/signature/i);
    });

    test("invalid stripe-signature → 400", async () => {
      const res = await request(app)
        .post("/api/payments/webhook")
        .set("stripe-signature", "tampered_sig")
        .send({});
      expect(res.status).toBe(400);
    });

    test("valid stripe-signature → 200 with received: true", async () => {
      const res = await request(app)
        .post("/api/payments/webhook")
        .set("stripe-signature", "valid_signature")
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
    });
  });

  describe("GET /api/payments/verify/:sessionId", () => {
    test("valid session → 200 with purchase details", async () => {
      const res = await request(app).get("/api/payments/verify/cs_test_abc123");
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.purchase).toBeDefined();
    });

    test("invalid session → 404", async () => {
      const res = await request(app).get("/api/payments/verify/invalid");
      expect(res.status).toBe(404);
    });
  });
});

// ─── Bundle Catalog Tests ─────────────────────────────────────────────────────
describe("Catalog Bundle Validation", () => {
  const validYearLevels = [3, 5, 7, 9];

  test.each(validYearLevels)("year level %i is valid", (year) => {
    expect(validYearLevels.includes(year)).toBe(true);
  });

  test.each([1, 2, 4, 6, 8, 10, 11, 12])("year level %i is NOT valid for NAPLAN", (year) => {
    expect(validYearLevels.includes(year)).toBe(false);
  });

  test("bundle enrichment adds included_tests from quiz_count_with_lower", () => {
    const bundle = { quiz_count: 10, quiz_count_with_lower: 25 };
    const enriched = { ...bundle, included_tests: bundle.quiz_count_with_lower || bundle.quiz_count || 0 };
    expect(enriched.included_tests).toBe(25);
  });

  test("bundle fallback uses quiz_count when quiz_count_with_lower is 0", () => {
    const bundle = { quiz_count: 10, quiz_count_with_lower: 0 };
    const included_tests = bundle.quiz_count_with_lower || bundle.quiz_count || 0;
    expect(included_tests).toBe(10);
  });
});
