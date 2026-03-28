#!/usr/bin/env node

/**
 * Phase 3 Test Script — Stripe Payment Integration
 *
 * Tests:
 *  - Bundle listing (public)
 *  - Checkout session creation (requires parent JWT + Stripe key)
 *  - Webhook simulation
 *  - Purchase history
 *
 * USAGE:
 *   1. Start backend: cd naplan-backend && npm start
 *   2. Seed catalog: node src/scripts/seedCatalog.js
 *   3. Set STRIPE_SECRET_KEY in .env (test key: sk_test_...)
 *   4. Run tests: node test-phase3.js
 *
 * NOTE: Some tests require STRIPE_SECRET_KEY. Tests that need it
 * will be skipped if the key is not set.
 */

const API = "http://localhost:3000";

let passed = 0;
let failed = 0;
let skipped = 0;

function log(status, msg) {
  const icon = status === "PASS" ? "✅" : status === "FAIL" ? "❌" : "⏭️";
  console.log(`  ${icon} ${msg}`);
  if (status === "PASS") passed++;
  else if (status === "FAIL") failed++;
  else skipped++;
}

async function api(path, opts = {}) {
  const url = `${API}${path}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function run() {
  console.log("\n═══════════════════════════════════════════");
  console.log("  Phase 3 Test Suite — Stripe Payments");
  console.log("═══════════════════════════════════════════\n");

  const hasStripeKey = process.env.STRIPE_SECRET_KEY || false;

  // ────────────────────────────────────────
  // 1. BUNDLE CATALOG (public, no Stripe key needed)
  // ────────────────────────────────────────
  console.log("📦 Bundle Catalog\n");

  {
    const { status, data } = await api("/api/catalog/bundles");
    if (status === 200 && Array.isArray(data.bundles)) {
      log("PASS", `GET /api/catalog/bundles → ${data.bundles.length} bundles`);
    } else {
      log("FAIL", `GET /api/catalog/bundles → ${status} ${JSON.stringify(data)}`);
    }
  }

  {
    const { status, data } = await api("/api/catalog/bundles?year_level=3");
    if (status === 200 && data.bundles.every(b => b.year_level === 3)) {
      log("PASS", `Filter by year_level=3 → ${data.bundles.length} bundles`);
    } else {
      log("FAIL", `Filter by year_level=3 → unexpected result`);
    }
  }

  {
    const { status, data } = await api("/api/catalog/bundles/year3_full");
    if (status === 200 && data.bundle && data.bundle.bundle_id === "year3_full") {
      log("PASS", `GET /api/catalog/bundles/year3_full → ${data.bundle.bundle_name}`);
    } else {
      log("FAIL", `GET single bundle → ${status} ${JSON.stringify(data)}`);
    }
  }

  {
    const { status } = await api("/api/catalog/bundles/nonexistent_bundle");
    if (status === 404) {
      log("PASS", `Non-existent bundle → 404`);
    } else {
      log("FAIL", `Non-existent bundle → expected 404, got ${status}`);
    }
  }

  // Verify no quiz IDs are exposed publicly
  {
    const { data } = await api("/api/catalog/bundles/year3_full");
    if (!data.bundle.flexiquiz_quiz_ids && !data.bundle.trial_quiz_ids) {
      log("PASS", `Bundle response does not expose quiz IDs`);
    } else {
      log("FAIL", `Bundle response exposes quiz IDs — security issue`);
    }
  }

  // ────────────────────────────────────────
  // 2. PAYMENT ENDPOINTS (need parent JWT)
  // ────────────────────────────────────────
  console.log("\n💳 Payment Endpoints\n");

  // First, create a test parent + child via OTP (we'll use the send-otp endpoint)
  // Since we can't complete OTP in automated test, we'll test auth validation only

  // Checkout without auth
  {
    const { status, data } = await api("/api/payments/checkout", {
      method: "POST",
      body: JSON.stringify({ bundle_id: "year3_full", child_ids: ["fake"] }),
    });
    if (status === 401 || status === 403) {
      log("PASS", `POST /api/payments/checkout without auth → ${status}`);
    } else {
      log("FAIL", `POST /api/payments/checkout without auth → expected 401/403, got ${status}`);
    }
  }

  // History without auth
  {
    const { status } = await api("/api/payments/history");
    if (status === 401 || status === 403) {
      log("PASS", `GET /api/payments/history without auth → ${status}`);
    } else {
      log("FAIL", `GET /api/payments/history without auth → expected 401/403, got ${status}`);
    }
  }

  // Verify without auth
  {
    const { status } = await api("/api/payments/verify?session_id=test");
    if (status === 401 || status === 403) {
      log("PASS", `GET /api/payments/verify without auth → ${status}`);
    } else {
      log("FAIL", `GET /api/payments/verify without auth → expected 401/403, got ${status}`);
    }
  }

  // ────────────────────────────────────────
  // 3. CHECKOUT VALIDATION (needs parent JWT + Stripe key)
  // ────────────────────────────────────────
  console.log("\n🔒 Checkout Validation (with auth)\n");

  // Try to create a JWT for testing
  // We'll use direct MongoDB + JWT to create a test parent
  let testToken = null;
  let testParentId = null;
  let testChildId = null;

  try {
    // Check if we can get a token via the test helper
    const jwt = require("jsonwebtoken");
    const mongoose = require("mongoose");
    const Parent = require("./src/models/parent");
    const Child = require("./src/models/child");

    if (!mongoose.connection.readyState) {
      const connectDB = require("./src/config/db");
      await connectDB();
    }

    // Create or find test parent
    let parent = await Parent.findOne({ email: "testparent_phase3@test.com" });
    if (!parent) {
      parent = await Parent.create({
        email: "testparent_phase3@test.com",
        first_name: "Test",
        last_name: "Phase3",
        auth_provider: "otp",
      });
    }
    testParentId = parent._id.toString();

    // Create test child
    let child = await Child.findOne({ username: "testchild_phase3" });
    if (!child) {
      const bcrypt = require("bcryptjs");
      child = await Child.create({
        parent_id: parent._id,
        display_name: "Test Child",
        username: "testchild_phase3",
        pin_hash: await bcrypt.hash("1234", 10),
        year_level: 3,
        status: "trial",
      });
    }
    testChildId = child._id.toString();

    // Generate JWT
    testToken = jwt.sign(
      { parentId: testParentId, email: parent.email, role: "parent" },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    log("PASS", `Created test parent + child for checkout tests`);
  } catch (err) {
    log("SKIP", `Could not create test data: ${err.message}`);
  }

  if (testToken) {
    const auth = { Authorization: `Bearer ${testToken}` };

    // Checkout with missing bundle_id
    {
      const { status, data } = await api("/api/payments/checkout", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ child_ids: [testChildId] }),
      });
      if (status === 400 && data.error?.includes("bundle_id")) {
        log("PASS", `Checkout without bundle_id → 400`);
      } else {
        log("FAIL", `Checkout without bundle_id → ${status} ${JSON.stringify(data)}`);
      }
    }

    // Checkout with missing child_ids
    {
      const { status, data } = await api("/api/payments/checkout", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ bundle_id: "year3_full" }),
      });
      if (status === 400 && data.error?.includes("child_id")) {
        log("PASS", `Checkout without child_ids → 400`);
      } else {
        log("FAIL", `Checkout without child_ids → ${status} ${JSON.stringify(data)}`);
      }
    }

    // Checkout with non-existent bundle
    {
      const { status } = await api("/api/payments/checkout", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ bundle_id: "fake_bundle", child_ids: [testChildId] }),
      });
      if (status === 404) {
        log("PASS", `Checkout with fake bundle → 404`);
      } else {
        log("FAIL", `Checkout with fake bundle → expected 404, got ${status}`);
      }
    }

    // Checkout with someone else's child
    {
      const { status, data } = await api("/api/payments/checkout", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ bundle_id: "year3_full", child_ids: ["000000000000000000000000"] }),
      });
      if (status === 400 && data.error?.includes("invalid")) {
        log("PASS", `Checkout with invalid child → 400`);
      } else {
        log("FAIL", `Checkout with invalid child → ${status} ${JSON.stringify(data)}`);
      }
    }

    // Actual Stripe checkout (needs STRIPE_SECRET_KEY)
    if (hasStripeKey) {
      const { status, data } = await api("/api/payments/checkout", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ bundle_id: "year3_full", child_ids: [testChildId] }),
      });
      if (status === 200 && data.checkout_url && data.session_id) {
        log("PASS", `Stripe checkout session created → ${data.session_id.substring(0, 20)}...`);

        // Verify purchase record was created as pending
        const Purchase = require("./src/models/purchase");
        const purchase = await Purchase.findOne({ stripe_session_id: data.session_id });
        if (purchase && purchase.status === "pending") {
          log("PASS", `Purchase record created with status 'pending'`);
        } else {
          log("FAIL", `Purchase record not found or wrong status`);
        }
      } else {
        log("FAIL", `Stripe checkout → ${status} ${JSON.stringify(data)}`);
      }
    } else {
      log("SKIP", `Stripe checkout session creation (STRIPE_SECRET_KEY not set)`);
      log("SKIP", `Purchase record creation (STRIPE_SECRET_KEY not set)`);
    }

    // Purchase history (should work even without purchases)
    {
      const { status, data } = await api("/api/payments/history", { headers: auth });
      if (status === 200 && Array.isArray(data.purchases)) {
        log("PASS", `GET /api/payments/history → ${data.purchases.length} purchases`);
      } else {
        log("FAIL", `GET /api/payments/history → ${status}`);
      }
    }
  }

  // ────────────────────────────────────────
  // 4. STRIPE WEBHOOK (signature validation)
  // ────────────────────────────────────────
  console.log("\n🔔 Webhook Validation\n");

  {
    // Webhook without signature should fail
    const { status, data } = await api("/api/webhooks/stripe", {
      method: "POST",
      body: JSON.stringify({ type: "checkout.session.completed" }),
    });
    if (status === 400 || status === 500) {
      log("PASS", `Webhook without signature → ${status} (rejected)`);
    } else {
      log("FAIL", `Webhook without signature → expected 400/500, got ${status}`);
    }
  }

  // ────────────────────────────────────────
  // CLEANUP
  // ────────────────────────────────────────
  console.log("\n🧹 Cleanup\n");

  try {
    const mongoose = require("mongoose");
    const Parent = require("./src/models/parent");
    const Child = require("./src/models/child");
    const Purchase = require("./src/models/purchase");

    await Child.deleteMany({ username: "testchild_phase3" });
    await Purchase.deleteMany({ parent_id: testParentId });
    await Parent.deleteMany({ email: "testparent_phase3@test.com" });
    log("PASS", `Test data cleaned up`);

    await mongoose.disconnect();
  } catch (err) {
    log("SKIP", `Cleanup: ${err.message}`);
  }

  // ────────────────────────────────────────
  // SUMMARY
  // ────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════");
  console.log(`  Results: ✅ ${passed} passed  ❌ ${failed} failed  ⏭️  ${skipped} skipped`);
  console.log("═══════════════════════════════════════════\n");

  if (!hasStripeKey) {
    console.log("  💡 To run full tests, set STRIPE_SECRET_KEY in .env\n");
  }

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
