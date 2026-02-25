const router = require("express").Router();
const mongoose = require("mongoose");
const Child = require("../models/child");
const Result = require("../models/result");
const Writing = require("../models/writing");
const Parent = require("../models/parent");
const { registerRespondent, fqDeleteUser } = require("../services/flexiQuizUsersService");
const { encryptPassword } = require("../utils/flexiquizCrypto");

const {
  verifyToken,
  requireParent,
  requireAuth,
} = require("../middleware/auth");

// All routes in this file are mounted at /api/children
// verifyToken is applied at the app.js level for /api/children

// ────────────────────────────────────────────
// Helper: aggregate stats for a child
// ────────────────────────────────────────────
async function aggregateChildStats(child) {
  const matchQuery = child.flexiquiz_user_id
    ? { "user.user_id": child.flexiquiz_user_id }
    : child.username
      ? { "user.user_name": child.username }
      : null;

  if (!matchQuery) {
    return { quizCount: 0, averageScore: 0, lastActivity: null };
  }

  const [resultStats] = await Result.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        quizCount: { $sum: 1 },
        avgScore: { $avg: "$score.percentage" },
        lastActivity: { $max: "$date_submitted" },
      },
    },
  ]);

  // Also count writing submissions
  const [writingStats] = await Writing.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        lastWriting: { $max: "$submitted_at" },
      },
    },
  ]);

  const quizCount = (resultStats?.quizCount || 0) + (writingStats?.count || 0);
  const avgScore = Math.round(resultStats?.avgScore || 0);

  // Pick the most recent activity from either collection
  const dates = [resultStats?.lastActivity, writingStats?.lastWriting].filter(
    Boolean,
  );
  const lastActivity = dates.length
    ? new Date(Math.max(...dates.map((d) => new Date(d))))
    : null;

  return { quizCount, averageScore: avgScore, lastActivity };
}

// ────────────────────────────────────────────
// GET /api/children/check-username/:username
// Public — for live uniqueness check in AddChild modal
// ────────────────────────────────────────────
router.get("/check-username/:username", async (req, res) => {
  try {
    const username = String(req.params.username || "")
      .trim()
      .toLowerCase();

    if (!username || !/^[a-z0-9_]{3,20}$/.test(username)) {
      return res.json({ available: false, reason: "Invalid format" });
    }

    const exists = await Child.exists({ username });
    return res.json({ available: !exists });
  } catch (err) {
    console.error("check-username error:", err);
    return res.status(500).json({ available: false, reason: "Server error" });
  }
});

// ────────────────────────────────────────────
// GET /api/children/summaries
// Returns ALL children for the parent WITH aggregated stats
// This is the single API call that powers ParentDashboard
// ────────────────────────────────────────────
router.get("/summaries", verifyToken, requireParent, async (req, res) => {
  try {
    const parentId = req.user.parentId || req.user.parent_id;
    const children = await Child.find({ parent_id: parentId }).lean();

    const summaries = await Promise.all(
      children.map(async (child) => {
        const stats = await aggregateChildStats(child);
        return {
          _id: child._id,
          parent_id: child.parent_id,
          display_name: child.display_name,
          username: child.username,
          year_level: child.year_level,
          status: child.status,
          flexiquiz_user_id: child.flexiquiz_user_id || null,
          createdAt: child.createdAt,
          updatedAt: child.updatedAt,
          // Aggregated stats
          quizCount: stats.quizCount,
          averageScore: stats.averageScore,
          lastActivity: stats.lastActivity,
        };
      }),
    );

    return res.json(summaries);
  } catch (err) {
    console.error("GET /children/summaries error:", err);
    return res.status(500).json({ error: "Failed to fetch children" });
  }
});

// ────────────────────────────────────────────
// GET /api/children
// List all children for authenticated parent (no stats — lightweight)
// ────────────────────────────────────────────
router.get("/", verifyToken, requireParent, async (req, res) => {
  try {
    const parentId = req.user.parentId || req.user.parent_id;
    const children = await Child.find({ parent_id: parentId })
      .select("-pin_hash -flexiquiz_password_enc")
      .lean();
    return res.json(children);
  } catch (err) {
    console.error("GET /children error:", err);
    return res.status(500).json({ error: "Failed to fetch children" });
  }
});

// ────────────────────────────────────────────
// POST /api/children
// Create a new child profile
// Body: { display_name, username, year_level, pin }
// ────────────────────────────────────────────
router.post("/", verifyToken, requireParent, async (req, res) => {
  try {
    // Log user info from JWT

    const parentId = req.user?.parentId || req.user?.parent_id;
    if (!parentId) {
      return res.status(401).json({ error: "Invalid parent authentication" });
    }

    const display_name = String(req.body.display_name || "").trim();
    const username = String(req.body.username || "")
      .trim()
      .toLowerCase();
    const year_level = Number(req.body.year_level);
    const pin = String(req.body.pin || "").trim();

    if (!display_name) {
      return res.status(400).json({ error: "Display name is required" });
    }
    if (!username || !/^[a-z0-9_]{3,20}$/.test(username)) {
      return res.status(400).json({
        error:
          "Username must be 3–20 characters, lowercase letters, numbers, and underscores only",
      });
    }
    if (![3, 5, 7, 9].includes(year_level)) {
      return res
        .status(400)
        .json({ error: "Year level must be 3, 5, 7, or 9" });
    }
    if (!pin || !/^\d{4,6}$/.test(pin)) {
      return res.status(400).json({ error: "PIN must be 4–6 digits" });
    }

    // Check username uniqueness
    const existing = await Child.exists({ username });
    if (existing) {
      return res.status(409).json({ error: "Username is already taken" });
    }

       // ── 3. Fetch parent email for FlexiQuiz ──

    const parent = await Parent.findById(parentId).lean();

    const parentEmail = parent?.email || req.user?.email || "";

    const parentLastName = parent?.lastName || "";



    // ── 4. Create FlexiQuiz respondent ──

    // Uses the child's unique username directly as the FlexiQuiz user_name

    let fqResult;

    try {

      fqResult = await registerRespondent({

        firstName: display_name,

        lastName: parentLastName,

        yearLevel: year_level,

        email: parentEmail,

        username, // ← exact same username as our DB → FlexiQuiz

        userType: "respondent",

        sendWelcomeEmail: false,

        suspended: false,

        manageUsers: false,

        manageGroups: false,

        editQuizzes: false,

      });

    } catch (fqErr) {

      console.error("FlexiQuiz user creation failed:", fqErr?.response?.data || fqErr?.message || fqErr);

      return res.status(502).json({

        error: "Failed to create account on quiz platform. Please try again.",

        detail: fqErr?.response?.data?.message || fqErr?.message || "FlexiQuiz API error",

      });

    }



    if (!fqResult?.user_id) {

      console.error("FlexiQuiz returned no user_id:", fqResult);

      return res.status(502).json({

        error: "Quiz platform did not return a valid user ID. Please try again.",

      });

    }



    // ── 5. Encrypt the auto-generated FlexiQuiz password ──

    let encryptedPassword = null;

    try {

      if (fqResult.password) {

        encryptedPassword = encryptPassword(fqResult.password);

      }

    } catch (encErr) {

      console.error("Password encryption failed:", encErr.message);

      // Non-fatal: child can still be created, fallback login just won't work

    }

    // Create child instance
    const child = new Child({
      parent_id: parentId,
      display_name,
      username,
      year_level,
      pin_hash: pin, // pre-save hook will hash this
      flexiquiz_user_id: fqResult.user_id,
      flexiquiz_password_enc: encryptedPassword,
      flexiquiz_provisioned_at: new Date(),
    });

    try {
      await child.save();
    } catch (saveErr) {
      if (saveErr?.code === 11000) {
        return res.status(409).json({ error: "Username is already taken" });
      }
      return res
        .status(500)
        .json({ error: "Failed to create child", detail: saveErr.message });
    }
      // ── 7. Upsert into legacy User collection (for webhook matching) ──

    try {

      await User.updateOne(

        { user_id: fqResult.user_id },

        {

          $set: {

            user_id: fqResult.user_id,

            user_name: fqResult.user_name,

            first_name: display_name,

            last_name: parentLastName,

            email_address: parentEmail,

            year_level: String(year_level),

            deleted: false,

            updatedAt: new Date(),

          },

          $setOnInsert: { createdAt: new Date() },

        },

        { upsert: true }

      );

    } catch (userErr) {

      // Non-fatal: child is created, User doc is just for legacy compatibility

      console.error("User upsert warning (non-fatal):", userErr.message);

    }

    return res.status(201).json({
      _id: child._id,
      parent_id: child.parent_id,
      display_name: child.display_name,
      username: child.username,
      year_level: child.year_level,
      status: child.status,
      flexiquiz_user_id: child.flexiquiz_user_id,
      flexiquiz_user_name: fqResult.user_name,
      flexiquiz_provisioned_at: child.flexiquiz_provisioned_at,
      createdAt: child.createdAt,
    });
  } catch (err) {
    console.error("POST /children error:", err);
    return res
      .status(500)
      .json({ error: "Failed to create child", detail: err.message });
  }
});

// ────────────────────────────────────────────
// PUT /api/children/:childId
// Update child (display_name, year_level, pin)
// ────────────────────────────────────────────
router.put("/:childId", verifyToken, requireParent, async (req, res) => {
  try {
    const parentId = req.user.parentId || req.user.parent_id;
    const { childId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(childId)) {
      return res.status(400).json({ error: "Invalid child ID" });
    }

    const child = await Child.findOne({ _id: childId, parent_id: parentId });
    if (!child) {
      return res.status(404).json({ error: "Child not found" });
    }

    const updates = {};

    if (req.body.display_name !== undefined) {
      const dn = String(req.body.display_name).trim();
      if (!dn)
        return res.status(400).json({ error: "Display name cannot be empty" });
      updates.display_name = dn;
    }

    if (req.body.year_level !== undefined) {
      const yl = Number(req.body.year_level);
      if (![3, 5, 7, 9].includes(yl)) {
        return res
          .status(400)
          .json({ error: "Year level must be 3, 5, 7, or 9" });
      }
      updates.year_level = yl;
    }

    if (req.body.pin !== undefined) {
      const pin = String(req.body.pin).trim();
      if (!/^\d{4,6}$/.test(pin)) {
        return res.status(400).json({ error: "PIN must be 4–6 digits" });
      }
      updates.pin_hash = await Child.hashPin(pin);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    const updated = await Child.findByIdAndUpdate(
      childId,
      { $set: updates },
      { new: true },
    )
      .select("-pin_hash -flexiquiz_password_enc")
      .lean();

    return res.json(updated);
  } catch (err) {
    console.error("PUT /children/:childId error:", err);
    return res.status(500).json({ error: "Failed to update child" });
  }
});

// ────────────────────────────────────────────
// DELETE /api/children/:childId
// ────────────────────────────────────────────
// ────────────────────────────────────────────
// DELETE /api/children/:childId
// Also deletes the user from FlexiQuiz if they have an account
// ────────────────────────────────────────────
router.delete("/:childId", verifyToken, requireParent, async (req, res) => {
  try {
    const parentId = req.user.parentId || req.user.parent_id;
    const { childId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(childId)) {
      return res.status(400).json({ error: "Invalid child ID" });
    }

    // 1. Find the child first (don't delete yet — we need flexiquiz_user_id)
    const child = await Child.findOne({
      _id: childId,
      parent_id: parentId,
    });
    if (!child) {
      return res.status(404).json({ error: "Child not found" });
    }

    // 2. If child has a FlexiQuiz account, delete from FlexiQuiz
    let flexiquizDeleted = false;
    if (child.flexiquiz_user_id) {
      try {
        await fqDeleteUser(child.flexiquiz_user_id);
        flexiquizDeleted = true;
        console.log(
          `✅ Deleted FlexiQuiz user ${child.flexiquiz_user_id} for child ${childId}`
        );
      } catch (fqErr) {
        // Log but don't block — still remove child from our DB
        console.error(
          `⚠️ Failed to delete FlexiQuiz user ${child.flexiquiz_user_id}:`,
          fqErr.response?.data || fqErr.message
        );
      }
    }

    // 3. Delete from MongoDB
    await Child.findByIdAndDelete(childId);

    return res.json({
      ok: true,
      deleted: child._id,
      flexiquizDeleted,
    });
  } catch (err) {
    console.error("DELETE /children/:childId error:", err);
    return res.status(500).json({ error: "Failed to delete child" });
  }
});

// ────────────────────────────────────────────
// GET /api/children/:childId/results
// Returns all Result docs linked to this child
// Accessible by parent (own child) or child (own data)
// ────────────────────────────────────────────
router.get("/:childId/results", verifyToken, requireAuth, async (req, res) => {
  try {
    const { childId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(childId)) {
      return res.status(400).json({ error: "Invalid child ID" });
    }

    const child = await Child.findById(childId).lean();
    if (!child) return res.status(404).json({ error: "Child not found" });

    // Scope check
    const parentId = req.user.parentId || req.user.parent_id;
    if (
      req.user.role === "parent" &&
      String(child.parent_id) !== String(parentId)
    ) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (
      req.user.role === "child" &&
      String(child._id) !== String(req.user.childId)
    ) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Build match query
    const matchQuery = child.flexiquiz_user_id
      ? { "user.user_id": child.flexiquiz_user_id }
      : { "user.user_name": child.username };

    const results = await Result.find(matchQuery)
      .sort({ date_submitted: -1, createdAt: -1 })
      .lean();

    return res.json(results);
  } catch (err) {
    console.error("GET /children/:childId/results error:", err);
    return res.status(500).json({ error: "Failed to fetch results" });
  }
});

// ────────────────────────────────────────────
// GET /api/children/:childId/writing
// Returns all Writing docs linked to this child
// ────────────────────────────────────────────
router.get("/:childId/writing", verifyToken, requireAuth, async (req, res) => {
  try {
    const { childId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(childId)) {
      return res.status(400).json({ error: "Invalid child ID" });
    }

    const child = await Child.findById(childId).lean();
    if (!child) return res.status(404).json({ error: "Child not found" });

    // Scope check
    const parentId = req.user.parentId || req.user.parent_id;
    if (
      req.user.role === "parent" &&
      String(child.parent_id) !== String(parentId)
    ) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (
      req.user.role === "child" &&
      String(child._id) !== String(req.user.childId)
    ) {
      return res.status(403).json({ error: "Access denied" });
    }

    const matchQuery = child.flexiquiz_user_id
      ? { "user.user_id": child.flexiquiz_user_id }
      : { "user.user_name": child.username };

    const docs = await Writing.find(matchQuery)
      .sort({ submitted_at: -1, date_created: -1, createdAt: -1 })
      .lean();

    return res.json(docs);
  } catch (err) {
    console.error("GET /children/:childId/writing error:", err);
    return res
      .status(500)
      .json({ error: "Failed to fetch writing submissions" });
  }
});

module.exports = router;