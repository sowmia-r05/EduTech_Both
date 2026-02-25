#!/usr/bin/env node

/**
 * Phase 1 — Integration Test Script
 * 
 * Tests all parent auth + child CRUD endpoints against a running local server.
 * 
 * USAGE:
 *   1. Make sure your backend is running: npm run dev
 *   2. Make sure MongoDB is connected
 *   3. Run: node test-phase1.js
 *   4. (Optional) Set BASE_URL env var if not localhost:3000
 * 
 * This script will:
 *   - Register a parent
 *   - Login as parent
 *   - Get parent profile
 *   - Test email verification flow
 *   - Test forgot/reset password flow
 *   - Create children
 *   - Check username availability
 *   - List children
 *   - Update a child
 *   - Login as child
 *   - Get child profile (as child)
 *   - Get child profile (as parent)
 *   - Delete a child
 *   - Test validation & error cases
 *   - Clean up test data
 */

const BASE = process.env.BASE_URL || "http://localhost:5000";

// ─── Unique test data (timestamp-based to avoid conflicts) ───
const TS = Date.now();
const TEST_EMAIL = `testparent_${TS}@test.com`;
const TEST_PASSWORD = "TestPass123";
const TEST_FIRST = "TestParent";
const TEST_LAST = "Phase1";
const CHILD1_USERNAME = `child1_${TS}`;
const CHILD2_USERNAME = `child2_${TS}`;
const CHILD_PIN = "1234";

// ─── State ───
let parentToken = null;
let parentId = null;
let child1Id = null;
let child2Id = null;
let childToken = null;

let passed = 0;
let failed = 0;
let skipped = 0;

// ─── Helpers ───

async function req(method, path, body = null, token = null) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body && method !== "GET") {
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(`${BASE}${path}`, opts);
  let data = null;
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("application/json")) {
    data = await res.json();
  } else {
    data = await res.text();
  }
  return { status: res.status, data };
}

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${msg}`);
    failed++;
  }
}

function section(title) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"═".repeat(60)}`);
}

function skip(msg) {
  console.log(`  ⏭️  SKIP: ${msg}`);
  skipped++;
}

// ─── Tests ───

async function testHealthCheck() {
  section("Health Check");
  const { status, data } = await req("GET", "/");
  assert(status === 200, `GET / returns 200 (got ${status})`);
  assert(data?.status === "NAPLAN backend alive", `Health check message correct`);
}

async function testRegistration() {
  section("Parent Registration");

  // Missing fields
  const r1 = await req("POST", "/api/auth/register", { email: TEST_EMAIL });
  assert(r1.status === 400, `Missing password → 400 (got ${r1.status})`);

  const r2 = await req("POST", "/api/auth/register", {
    email: "not-an-email",
    password: TEST_PASSWORD,
    first_name: TEST_FIRST,
    last_name: TEST_LAST,
  });
  assert(r2.status === 400, `Invalid email → 400 (got ${r2.status})`);

  const r3 = await req("POST", "/api/auth/register", {
    email: TEST_EMAIL,
    password: "short",
    first_name: TEST_FIRST,
    last_name: TEST_LAST,
  });
  assert(r3.status === 400, `Weak password → 400 (got ${r3.status})`);

  // Valid registration
  const r4 = await req("POST", "/api/auth/register", {
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    first_name: TEST_FIRST,
    last_name: TEST_LAST,
  });
  if (r4.status !== 201) {
    console.log(`  ⚠️  Registration response body:`, JSON.stringify(r4.data));
  }
  assert(r4.status === 201, `Valid registration → 201 (got ${r4.status})`);
  assert(!!r4.data?.token, `Returns JWT token`);
  assert(r4.data?.parent?.email === TEST_EMAIL, `Returns parent email`);
  assert(r4.data?.parent?.first_name === TEST_FIRST, `Returns parent first_name`);
  assert(!r4.data?.parent?.password_hash, `Does NOT expose password_hash`);
  assert(r4.data?.parent?.email_verified === false, `email_verified is false initially`);

  parentToken = r4.data?.token;
  parentId = r4.data?.parent?._id;

  // Duplicate registration
  const r5 = await req("POST", "/api/auth/register", {
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    first_name: TEST_FIRST,
    last_name: TEST_LAST,
  });
  assert(r5.status === 409, `Duplicate email → 409 (got ${r5.status})`);
}

async function testLogin() {
  section("Parent Login");

  // Wrong password
  const r1 = await req("POST", "/api/auth/login", {
    email: TEST_EMAIL,
    password: "WrongPass999",
  });
  assert(r1.status === 401, `Wrong password → 401 (got ${r1.status})`);

  // Non-existent email
  const r2 = await req("POST", "/api/auth/login", {
    email: `nonexistent_${TS}@test.com`,
    password: TEST_PASSWORD,
  });
  assert(r2.status === 401, `Non-existent email → 401 (got ${r2.status})`);

  // Missing fields
  const r3 = await req("POST", "/api/auth/login", { email: TEST_EMAIL });
  assert(r3.status === 400, `Missing password → 400 (got ${r3.status})`);

  // Valid login
  const r4 = await req("POST", "/api/auth/login", {
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  assert(r4.status === 200, `Valid login → 200 (got ${r4.status})`);
  assert(!!r4.data?.token, `Returns JWT token`);
  assert(r4.data?.parent?.email === TEST_EMAIL, `Returns correct email`);

  // Update token (fresh)
  parentToken = r4.data?.token;
}

async function testGetProfile() {
  section("Get Parent Profile (GET /api/auth/me)");

  // No token
  const r1 = await req("GET", "/api/auth/me");
  assert(r1.status === 401, `No token → 401 (got ${r1.status})`);

  // Invalid token
  const r2 = await req("GET", "/api/auth/me", null, "invalid.token.here");
  assert(r2.status === 401, `Invalid token → 401 (got ${r2.status})`);

  // Valid
  if (parentToken) {
    const r3 = await req("GET", "/api/auth/me", null, parentToken);
    assert(r3.status === 200, `Valid token → 200 (got ${r3.status})`);
    assert(r3.data?.parent?.email === TEST_EMAIL, `Returns correct parent`);
  } else {
    skip("No parent token available");
  }
}

async function testEmailVerification() {
  section("Email Verification");

  // Invalid token
  const r1 = await req("POST", "/api/auth/verify-email", { token: "bogus-token" });
  assert(r1.status === 400, `Bogus verify token → 400 (got ${r1.status})`);

  // Resend verification (valid email)
  const r2 = await req("POST", "/api/auth/resend-verification", { email: TEST_EMAIL });
  assert(r2.status === 200, `Resend verification → 200 (got ${r2.status})`);

  // Resend verification (non-existent email — still returns 200 to not leak info)
  const r3 = await req("POST", "/api/auth/resend-verification", {
    email: `fake_${TS}@test.com`,
  });
  assert(r3.status === 200, `Resend for unknown email → 200 (got ${r3.status})`);

  console.log("  ℹ️  (Actual email verification requires clicking the link from email)");
}

async function testForgotResetPassword() {
  section("Forgot / Reset Password");

  // Forgot password
  const r1 = await req("POST", "/api/auth/forgot-password", { email: TEST_EMAIL });
  assert(r1.status === 200, `Forgot password → 200 (got ${r1.status})`);

  // Forgot password (unknown email — still 200)
  const r2 = await req("POST", "/api/auth/forgot-password", {
    email: `unknown_${TS}@test.com`,
  });
  assert(r2.status === 200, `Forgot for unknown email → 200 (got ${r2.status})`);

  // Reset with bogus token
  const r3 = await req("POST", "/api/auth/reset-password", {
    token: "bogus-reset-token",
    password: "NewPass456",
  });
  assert(r3.status === 400, `Bogus reset token → 400 (got ${r3.status})`);

  // Reset with weak password
  const r4 = await req("POST", "/api/auth/reset-password", {
    token: "whatever",
    password: "weak",
  });
  assert(r4.status === 400, `Weak password on reset → 400 (got ${r4.status})`);

  console.log("  ℹ️  (Full reset flow requires the token from the email link)");
}

async function testCheckUsername() {
  section("Check Username Availability");

  // Available username (keep under 20 chars to pass regex validation)
  const shortTs = String(TS).slice(-8);
  const r1 = await req("GET", `/api/children/check-username?username=avail_${shortTs}`);
  assert(r1.status === 200, `Check available username → 200 (got ${r1.status})`);
  if (r1.data?.available !== true) {
    console.log(`  ⚠️  check-username response:`, JSON.stringify(r1.data));
  }
  assert(r1.data?.available === true, `Username is available`);

  // Invalid format
  const r2 = await req("GET", `/api/children/check-username?username=ab`);
  assert(r2.status === 200, `Too short username → 200 (got ${r2.status})`);
  assert(r2.data?.available === false, `Too short → not available`);

  const r3 = await req("GET", `/api/children/check-username?username=HAS SPACES`);
  assert(r3.status === 200, `Invalid chars → 200`);
  assert(r3.data?.available === false, `Invalid chars → not available`);
}

async function testCreateChildren() {
  section("Create Children");

  if (!parentToken) {
    skip("No parent token — skipping child creation");
    return;
  }

  // No auth
  const r0 = await req("POST", "/api/children", {
    display_name: "Nope",
    username: "nope",
    pin: "1234",
    year_level: 3,
  });
  assert(r0.status === 401, `No auth → 401 (got ${r0.status})`);

  // Missing fields
  const r1 = await req(
    "POST",
    "/api/children",
    { display_name: "Sarah" },
    parentToken
  );
  assert(r1.status === 400, `Missing username → 400 (got ${r1.status})`);

  // Invalid username format
  const r2 = await req(
    "POST",
    "/api/children",
    { display_name: "Sarah", username: "AB", pin: "1234", year_level: 3 },
    parentToken
  );
  assert(r2.status === 400, `Short username → 400 (got ${r2.status})`);

  // Invalid PIN
  const r3 = await req(
    "POST",
    "/api/children",
    { display_name: "Sarah", username: CHILD1_USERNAME, pin: "12", year_level: 3 },
    parentToken
  );
  assert(r3.status === 400, `Short PIN → 400 (got ${r3.status})`);

  // Invalid year level
  const r4 = await req(
    "POST",
    "/api/children",
    { display_name: "Sarah", username: CHILD1_USERNAME, pin: "1234", year_level: 4 },
    parentToken
  );
  assert(r4.status === 400, `Invalid year → 400 (got ${r4.status})`);

  // Valid child 1
  const r5 = await req(
    "POST",
    "/api/children",
    {
      display_name: "Sarah",
      username: CHILD1_USERNAME,
      pin: CHILD_PIN,
      year_level: 3,
    },
    parentToken
  );
  assert(r5.status === 201, `Create child 1 → 201 (got ${r5.status})`);
  assert(r5.data?.child?.display_name === "Sarah", `Child 1 display_name correct`);
  assert(r5.data?.child?.username === CHILD1_USERNAME, `Child 1 username correct`);
  assert(r5.data?.child?.year_level === 3, `Child 1 year_level correct`);
  assert(r5.data?.child?.status === "trial", `Child 1 status is 'trial'`);
  assert(!r5.data?.child?.pin_hash, `Does NOT expose pin_hash`);

  child1Id = r5.data?.child?._id;

  // Duplicate username
  const r6 = await req(
    "POST",
    "/api/children",
    {
      display_name: "Duplicate",
      username: CHILD1_USERNAME,
      pin: "5678",
      year_level: 5,
    },
    parentToken
  );
  assert(r6.status === 409, `Duplicate username → 409 (got ${r6.status})`);

  // Valid child 2
  const r7 = await req(
    "POST",
    "/api/children",
    {
      display_name: "Tom",
      username: CHILD2_USERNAME,
      pin: "5678",
      year_level: 7,
    },
    parentToken
  );
  assert(r7.status === 201, `Create child 2 → 201 (got ${r7.status})`);
  child2Id = r7.data?.child?._id;

  // Check username now taken
  const r8 = await req("GET", `/api/children/check-username?username=${CHILD1_USERNAME}`);
  assert(r8.data?.available === false, `Username now taken`);
}

async function testListChildren() {
  section("List Children");

  if (!parentToken) {
    skip("No parent token");
    return;
  }

  const r1 = await req("GET", "/api/children", null, parentToken);
  assert(r1.status === 200, `List children → 200 (got ${r1.status})`);
  assert(Array.isArray(r1.data?.children), `Returns children array`);
  assert(r1.data?.children?.length >= 2, `Has at least 2 children (got ${r1.data?.children?.length})`);
}

async function testUpdateChild() {
  section("Update Child");

  if (!parentToken || !child1Id) {
    skip("No parent token or child ID");
    return;
  }

  // Update display name + year level
  const r1 = await req(
    "PUT",
    `/api/children/${child1Id}`,
    { display_name: "Sarah Updated", year_level: 5 },
    parentToken
  );
  assert(r1.status === 200, `Update child → 200 (got ${r1.status})`);
  assert(r1.data?.child?.display_name === "Sarah Updated", `Name updated`);
  assert(r1.data?.child?.year_level === 5, `Year level updated`);

  // Update PIN
  const r2 = await req(
    "PUT",
    `/api/children/${child1Id}`,
    { pin: "9999" },
    parentToken
  );
  assert(r2.status === 200, `Update PIN → 200 (got ${r2.status})`);

  // Invalid year level
  const r3 = await req(
    "PUT",
    `/api/children/${child1Id}`,
    { year_level: 6 },
    parentToken
  );
  assert(r3.status === 400, `Invalid year level → 400 (got ${r3.status})`);

  // Non-existent child
  const r4 = await req(
    "PUT",
    "/api/children/000000000000000000000000",
    { display_name: "Ghost" },
    parentToken
  );
  assert(r4.status === 404, `Non-existent child → 404 (got ${r4.status})`);
}

async function testChildLogin() {
  section("Child Login");

  // Wrong PIN
  const r1 = await req("POST", "/api/children/login", {
    username: CHILD1_USERNAME,
    pin: "0000",
  });
  assert(r1.status === 401, `Wrong PIN → 401 (got ${r1.status})`);

  // Non-existent username
  const r2 = await req("POST", "/api/children/login", {
    username: `nonexistent_${TS}`,
    pin: "1234",
  });
  assert(r2.status === 401, `Non-existent username → 401 (got ${r2.status})`);

  // Valid login (with the UPDATED pin "9999" from the update test)
  const r3 = await req("POST", "/api/children/login", {
    username: CHILD1_USERNAME,
    pin: "9999",
  });
  assert(r3.status === 200, `Valid child login → 200 (got ${r3.status})`);
  assert(!!r3.data?.token, `Returns child JWT`);
  assert(r3.data?.child?.username === CHILD1_USERNAME, `Returns correct child`);
  assert(!r3.data?.child?.pin_hash, `Does NOT expose pin_hash`);

  childToken = r3.data?.token;
}

async function testChildAccess() {
  section("Child Access Scoping");

  if (!childToken || !child1Id) {
    skip("No child token or child ID");
    return;
  }

  // Child can access their own profile
  const r1 = await req("GET", `/api/children/${child1Id}`, null, childToken);
  assert(r1.status === 200, `Child views own profile → 200 (got ${r1.status})`);

  // Child CANNOT access another child's profile
  if (child2Id) {
    const r2 = await req("GET", `/api/children/${child2Id}`, null, childToken);
    assert(r2.status === 403, `Child views sibling → 403 (got ${r2.status})`);
  }

  // Child CANNOT list all children (requires parent)
  const r3 = await req("GET", "/api/children", null, childToken);
  assert(r3.status === 403, `Child lists all → 403 (got ${r3.status})`);

  // Child CANNOT create a child
  const r4 = await req(
    "POST",
    "/api/children",
    { display_name: "Hacked", username: `hack_${TS}`, pin: "1234", year_level: 3 },
    childToken
  );
  assert(r4.status === 403, `Child creates child → 403 (got ${r4.status})`);

  // Child CANNOT delete a child
  const r5 = await req("DELETE", `/api/children/${child1Id}`, null, childToken);
  assert(r5.status === 403, `Child deletes → 403 (got ${r5.status})`);
}

async function testDeleteChild() {
  section("Delete Child");

  if (!parentToken || !child2Id) {
    skip("No parent token or child2 ID");
    return;
  }

  const r1 = await req("DELETE", `/api/children/${child2Id}`, null, parentToken);
  assert(r1.status === 200, `Delete child 2 → 200 (got ${r1.status})`);

  // Verify it's gone
  const r2 = await req("GET", `/api/children/${child2Id}`, null, parentToken);
  assert(r2.status === 404, `Deleted child → 404 (got ${r2.status})`);

  // Verify list is reduced
  const r3 = await req("GET", "/api/children", null, parentToken);
  const remaining = r3.data?.children?.length || 0;
  assert(remaining >= 1, `Children list reduced (${remaining} remaining)`);
}

// ─── Cleanup ───

async function cleanup() {
  section("Cleanup");

  // Delete remaining child
  if (parentToken && child1Id) {
    await req("DELETE", `/api/children/${child1Id}`, null, parentToken);
    console.log("  🧹 Deleted child 1");
  }

  // Delete the parent from MongoDB directly isn't possible via API (by design).
  // The test parent will remain in the DB. Since we use timestamp-based emails,
  // it won't conflict with future test runs.
  console.log(`  ℹ️  Test parent ${TEST_EMAIL} remains in DB (unique per run)`);
}

// ─── Main ───

async function main() {
  console.log(`\n🧪 Phase 1 Integration Tests`);
  console.log(`   Server: ${BASE}`);
  console.log(`   Test email: ${TEST_EMAIL}`);
  console.log(`   Timestamp: ${TS}\n`);

  try {
    await testHealthCheck();
    await testRegistration();
    await testLogin();
    await testGetProfile();
    await testEmailVerification();
    await testForgotResetPassword();
    await testCheckUsername();
    await testCreateChildren();
    await testListChildren();
    await testUpdateChild();
    await testChildLogin();
    await testChildAccess();
    await testDeleteChild();
    await cleanup();
  } catch (err) {
    console.error(`\n💥 Test runner crashed: ${err.message}`);
    console.error(err.stack);
    failed++;
  }

  // Summary
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  RESULTS`);
  console.log(`${"═".repeat(60)}`);
  console.log(`  ✅ Passed:  ${passed}`);
  console.log(`  ❌ Failed:  ${failed}`);
  console.log(`  ⏭️  Skipped: ${skipped}`);
  console.log(`  Total:     ${passed + failed + skipped}`);
  console.log(`${"═".repeat(60)}\n`);

  if (failed > 0) {
    console.log("⚠️  Some tests failed. Check the output above for details.\n");
    process.exit(1);
  } else {
    console.log("🎉 All tests passed! Phase 1 backend is working correctly.\n");
    process.exit(0);
  }
}

main();
