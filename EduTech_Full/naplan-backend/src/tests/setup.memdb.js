/**
 * src/tests/helpers/setup.memdb.js
 *
 * Real integration-test harness. Instead of building fake Express apps inside
 * the test file (the old, misleading pattern), these helpers:
 *   1. Boot an in-memory MongoDB (mongodb-memory-server) — a real, throwaway DB.
 *   2. Connect the SAME mongoose your real models use, so the real app talks to it.
 *   3. Let tests import the REAL app.js and drive it with supertest.
 *
 * A test using this harness exercises your real middleware chain (helmet, CORS,
 * sanitizeMongo, auth) and your real routers. If a route is missing a guard or
 * returns the wrong shape, the test fails — because it ran the real code.
 *
 * Install once:
 *   cd naplan-backend && npm i -D mongodb-memory-server
 */

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mem;

/**
 * Call in beforeAll(). Starts mem-mongo, sets MONGODB_URI, connects mongoose.
 * IMPORTANT: this must run BEFORE app.js is required, because app.js validates
 * MONGODB_URI at import time. Tests should require app AFTER calling this, or
 * rely on jest's per-file isolation with require inside beforeAll.
 */
async function startMemMongo() {
  mem = await MongoMemoryServer.create();
  const uri = mem.getUri();

  // app.js + connectDB read these. Set them before anything imports app.js.
  process.env.MONGODB_URI = uri;
  process.env.NODE_ENV = "test";                       // skips rate limiters (see app.js)
  process.env.PARENT_JWT_SECRET ||= "test_parent_secret_at_least_32_chars_long!!";
  process.env.CHILD_JWT_SECRET  ||= "test_child_secret_at_least_32_chars_long!!!";
  process.env.ADMIN_JWT_SECRET  ||= "test_admin_secret_at_least_32_chars_long!!!";

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
  }
  return uri;
}

/** Call in afterAll(). Cleanly tears down the connection and the in-memory server. */
async function stopMemMongo() {
  await mongoose.connection.dropDatabase().catch(() => {});
  await mongoose.disconnect().catch(() => {});
  if (mem) await mem.stop();
}

/** Call in afterEach() to wipe all collections between tests, for isolation. */
async function clearCollections() {
  const { collections } = mongoose.connection;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
}

module.exports = { startMemMongo, stopMemMongo, clearCollections };