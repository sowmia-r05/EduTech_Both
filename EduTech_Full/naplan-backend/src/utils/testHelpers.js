const jwt = require("jsonwebtoken");

const PARENT_SECRET = "test_parent_secret_32chars_minimum!!";
const CHILD_SECRET  = "test_child_secret_32chars_minimum!!!";
const ADMIN_SECRET  = "test_admin_secret_32chars_minimum!!!";

function makeParentToken(overrides = {}) {
  return jwt.sign({ typ: "parent", parent_id: "parent_001", email: "test@example.com", ...overrides }, PARENT_SECRET, { expiresIn: "1h" });
}
function makeChildToken(overrides = {}) {
  return jwt.sign({ typ: "child", childId: "child_001", parentId: "parent_001", role: "child", ...overrides }, CHILD_SECRET, { expiresIn: "1h" });
}
function makeAdminToken(overrides = {}) {
  return jwt.sign({ typ: "admin", adminId: "admin_001", role: "admin", ...overrides }, ADMIN_SECRET, { expiresIn: "1h" });
}
function makeExpiredToken() {
  return jwt.sign({ typ: "parent", parent_id: "p1" }, PARENT_SECRET, { expiresIn: "-1s" });
}
function makeTokenWrongSecret() {
  return jwt.sign({ typ: "parent", parent_id: "p1" }, "wrong_secret_key", { expiresIn: "1h" });
}

module.exports = { PARENT_SECRET, CHILD_SECRET, ADMIN_SECRET, makeParentToken, makeChildToken, makeAdminToken, makeExpiredToken, makeTokenWrongSecret };
