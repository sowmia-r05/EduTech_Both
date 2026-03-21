const router = require("express").Router();
const Writing = require("../models/writing");
const Child = require("../models/child");
const {
  verifyToken,
  requireAuth,
  requireParent,
} = require("../middleware/auth");

// ─── Helper: verify ownership of a child record ───
async function assertChildOwnership(req, childId) {
  const child = await Child.findById(childId).lean();
  if (!child) return null;

  if (req.user.role === "parent") {
    const parentId = req.user.parentId || req.user.parent_id;
    if (String(child.parent_id) !== String(parentId)) return null;
  }
  if (req.user.role === "child") {
    if (String(child._id) !== String(req.user.childId)) return null;
  }
  return child;
}

// ─────────────────────────────────────────────────
// GET /api/writing/
// ✅ FIXED S-05: Now scoped to parent's own children
// ─────────────────────────────────────────────────
router.get("/", verifyToken, requireParent, async (req, res) => {
  try {
    const parentId = req.user.parentId || req.user.parent_id;

    // Find all children belonging to this parent
    const children = await Child.find({ parent_id: parentId })
      .select("_id")
      .lean();
    const childIds = children.map((c) => c._id);

    if (childIds.length === 0) return res.json([]);

    const results = await Writing.find({ child_id: { $in: childIds } })
      .sort({ submitted_at: -1, createdAt: -1 })
      .lean();

    return res.json(results || []);
  } catch (err) {
    console.error("GET /api/writing/ error:", err);
    return res
      .status(500)
      .json({ error: "Failed to fetch writing submissions" });
  }
});

// ─────────────────────────────────────────────────
// GET /api/writing/by-child-id
// ✅ FIXED S-07: Added ownership check
// ─────────────────────────────────────────────────
router.get("/by-child-id", verifyToken, requireAuth, async (req, res) => {
  try {
    const childId = String(req.query.child_id || "").trim();
    if (!childId) return res.status(400).json({ error: "child_id required" });

    // ✅ Ownership check
    const child = await assertChildOwnership(req, childId);
    if (!child) return res.status(403).json({ error: "Access denied" });

    const results = await Writing.find({ child_id: child._id })
      .sort({ submitted_at: -1, createdAt: -1 })
      .lean();

    return res.json(results || []);
  } catch (err) {
    console.error("GET /api/writing/by-child-id error:", err);
    return res
      .status(500)
      .json({ error: "Failed to fetch writing by child_id" });
  }
});

// ─────────────────────────────────────────────────
// GET /api/writing/by-username
// ✅ FIXED S-25: Added ownership check
// ─────────────────────────────────────────────────
router.get("/by-username", verifyToken, requireAuth, async (req, res) => {
  try {
    const username = String(req.query.username || "").trim();
    const quiz_name = String(req.query.quiz_name || "").trim();

    if (!username) return res.status(400).json({ error: "username required" });

    const child = await Child.findOne({
      username: username.toLowerCase(),
    }).lean();
    if (!child) return res.json([]);

    // ✅ Ownership check
    const owned = await assertChildOwnership(req, child._id);
    if (!owned) return res.status(403).json({ error: "Access denied" });

    const q = { "user.user_name": username };
    if (quiz_name) q.quiz_name = quiz_name;

    const results = await Writing.find(q)
      .sort({ submitted_at: -1, date_submitted: -1, createdAt: -1 })
      .lean();

    return res.json(results || []);
  } catch (err) {
    console.error("GET /api/writing/by-username error:", err);
    return res
      .status(500)
      .json({ error: "Failed to fetch writing by username" });
  }
});

// ─────────────────────────────────────────────────
// GET /api/writing/latest/by-username
// ✅ FIXED: Added ownership check
// ─────────────────────────────────────────────────
router.get(
  "/latest/by-username",
  verifyToken,
  requireAuth,
  async (req, res) => {
    try {
      const username = String(req.query.username || "").trim();
      if (!username)
        return res.status(400).json({ error: "username required" });

      const child = await Child.findOne({
        username: username.toLowerCase(),
      }).lean();
      if (!child) return res.json(null);

      const owned = await assertChildOwnership(req, child._id);
      if (!owned) return res.status(403).json({ error: "Access denied" });

      const doc = await Writing.findOne({ "user.user_name": username })
        .sort({ submitted_at: -1, createdAt: -1 })
        .lean();

      return res.json(doc || null);
    } catch (err) {
      console.error("GET /api/writing/latest/by-username error:", err);
      return res
        .status(500)
        .json({ error: "Failed to fetch latest writing by username" });
    }
  },
);

// ─────────────────────────────────────────────────
// GET /api/writing/:responseId
// No ownership check needed — responseId is an unguessable UUID;
// but adding auth is still good practice.
// ─────────────────────────────────────────────────
router.get("/:responseId", verifyToken, requireAuth, async (req, res) => {
  try {
    const id = String(req.params.responseId || "").trim();
    if (!id) return res.status(400).json({ error: "responseId required" });

    const result = await Writing.findOne({ response_id: id })
      .sort({ attempt: -1, submitted_at: -1, _id: -1 })
      .lean();

    if (!result) return res.json(null);

    // ✅ Verify ownership
    const owned = await assertChildOwnership(req, result.child_id);
    if (!owned) return res.status(403).json({ error: "Access denied" });

    return res.json(result);
  } catch (err) {
    console.error("GET /api/writing/:responseId error:", err);
    return res.status(500).json({ error: "Failed to fetch writing" });
  }
});

module.exports = router;
