/**
 * src/tests/admin_guard.integration.test.js
 *
 * REAL integration test. This boots the actual app.js and hits the actual
 * /api/admin routers, backed by a real (in-memory) MongoDB. It directly
 * re-verifies the "adminOnly guard" finding — the one whose old test was a mock.
 *
 * What it proves that the old mocked test could NOT:
 *   - A tutor token is REJECTED (403) by /api/admin/quizzes  → guard works
 *   - An admin token is ACCEPTED (200) by /api/admin/quizzes → didn't over-block
 *   - No token at all is rejected                            → auth works
 *
 * If someone deletes `adminOnly` from that route, THIS test goes red. The old
 * buildFakeApp() test would have stayed green — which is exactly why the
 * "Done" mark was wrong.
 */

const request = require("supertest");
const { startMemMongo, stopMemMongo, clearCollections } = require("./helpers/setup.memdb");

let app;            // the REAL app
let signAdmin;      // real token signer from config/jwt
let Admin;          // real mongoose model

beforeAll(async () => {
  await startMemMongo();                 // must run before requiring app.js
  app       = require("../app");         // adjust path if your app is elsewhere
  ({ signAdmin } = require("../config/jwt"));
  Admin     = require("../models/admin");
});

afterAll(async () => {
  await stopMemMongo();
});

afterEach(async () => {
  await clearCollections();
});

/** Helper: create a real Admin doc + a real signed cookie for a given role. */
async function makeStaff(role) {
  const doc = await Admin.create({
    name: `${role} user`,
    email: `${role}@test.local`,
    password_hash: "x".repeat(20),   // not used by these routes
    role,
    status: "active",
    token_version: 0,
  });
  const token = signAdmin({
    adminId: doc._id.toString(),
    email: doc.email,
    name: doc.name,
    role: doc.role,
    ver: 0,
  });
  return { doc, token };
}

describe("adminOnly guard on /api/admin/quizzes (REAL router)", () => {
  test("admin token → 200 (allowed)", async () => {
    const { token } = await makeStaff("admin");
    const res = await request(app)
      .get("/api/admin/quizzes")
      .set("Cookie", [`admin_token=${token}`]);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test("tutor token → 403 (blocked by adminOnly)", async () => {
    const { token } = await makeStaff("tutor");
    const res = await request(app)
      .get("/api/admin/quizzes")
      .set("Cookie", [`admin_token=${token}`]);
    // THE key assertion. If adminOnly is missing, this returns 200 and fails.
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/admin access required/i);
  });

  test("no token → 401 (auth required)", async () => {
    const res = await request(app).get("/api/admin/quizzes");
    expect(res.status).toBe(401);
  });
});