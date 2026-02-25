const router = require("express").Router();

const Child = require("../models/child");
const Parent = require("../models/parent");
const { requireParent, requireParentOrChild, signChildToken } = require("../middleware/auth");

// ────────────────────────────────────────────
// POST /api/auth/child-login
// Public: child logs in with username + PIN → returns child JWT
// ────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { username, pin } = req.body || {};

    const usernameClean = String(username || "").trim().toLowerCase();
    if (!usernameClean) {
      return res.status(400).json({ error: "Username is required" });
    }
    if (!pin) {
      return res.status(400).json({ error: "PIN is required" });
    }

    const child = await Child.findOne({ username: usernameClean });
    if (!child) {
      return res.status(401).json({ error: "Invalid username or PIN" });
    }

    // Check parent is still active
    const parent = await Parent.findById(child.parent_id);
    if (!parent || parent.status !== "active") {
      return res.status(401).json({ error: "Account is not active. Contact your parent." });
    }

    const isMatch = await child.comparePin(String(pin));
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid username or PIN" });
    }

    const token = signChildToken(child);

    return res.json({
      token,
      child: child.toSafeJSON(),
    });
  } catch (err) {
    console.error("Child login error:", err);
    return res.status(500).json({ error: "Login failed. Please try again." });
  }
});

// ────────────────────────────────────────────
// All routes below require Parent JWT
// ────────────────────────────────────────────

// GET /api/children — list all children for the authenticated parent
router.get("/", requireParent, async (req, res) => {
  try {
    const children = await Child.find({ parent_id: req.user.parentId })
      .select("-pin_hash -flexiquiz_password_enc")
      .sort({ createdAt: 1 });

    return res.json({ children });
  } catch (err) {
    console.error("List children error:", err);
    return res.status(500).json({ error: "Failed to fetch children" });
  }
});

// POST /api/children — create a new child profile
router.post("/", requireParent, async (req, res) => {
  try {
    const { display_name, username, pin, year_level } = req.body || {};

    // Validate
    const usernameClean = String(username || "").trim().toLowerCase();
    if (!display_name || !String(display_name).trim()) {
      return res.status(400).json({ error: "Display name is required" });
    }
    if (!usernameClean) {
      return res.status(400).json({ error: "Username is required" });
    }
    if (!/^[a-z0-9_]{3,20}$/.test(usernameClean)) {
      return res.status(400).json({
        error: "Username must be 3–20 characters, lowercase letters, numbers, and underscores only",
      });
    }

    const pinStr = String(pin || "").trim();
    if (!/^\d{4,6}$/.test(pinStr)) {
      return res.status(400).json({ error: "PIN must be 4–6 digits" });
    }

    const yearLevel = Number(year_level);
    if (![3, 5, 7, 9].includes(yearLevel)) {
      return res.status(400).json({ error: "Year level must be 3, 5, 7, or 9" });
    }

    // Check username uniqueness
    const existingUsername = await Child.findOne({ username: usernameClean });
    if (existingUsername) {
      return res.status(409).json({ error: "Username is already taken" });
    }

    const child = await Child.create({
      parent_id: req.user.parentId,
      display_name: String(display_name).trim(),
      username: usernameClean,
      pin_hash: pinStr, // pre-save hook will bcrypt this
      year_level: yearLevel,
      status: "trial",
    });

    return res.status(201).json({ child: child.toSafeJSON() });
  } catch (err) {
    console.error("Create child error:", err);

    if (err.code === 11000) {
      return res.status(409).json({ error: "Username is already taken" });
    }
    if (err.name === "ValidationError") {
      const firstError = Object.values(err.errors)[0];
      return res.status(400).json({ error: firstError?.message || "Validation failed" });
    }

    return res.status(500).json({ error: "Failed to create child profile" });
  }
});

// GET /api/children/check-username?username=xxx — live uniqueness check
router.get("/check-username", async (req, res) => {
  try {
    const username = String(req.query.username || "").trim().toLowerCase();

    if (!username || !/^[a-z0-9_]{3,20}$/.test(username)) {
      return res.json({ available: false, reason: "Invalid format" });
    }

    const existing = await Child.exists({ username });
    return res.json({ available: !existing, username });
  } catch (err) {
    console.error("Check username error:", err);
    return res.status(500).json({ available: false, reason: "Check failed" });
  }
});

// PUT /api/children/:childId — update child profile
router.put("/:childId", requireParent, async (req, res) => {
  try {
    const child = await Child.findOne({
      _id: req.params.childId,
      parent_id: req.user.parentId,
    });

    if (!child) {
      return res.status(404).json({ error: "Child not found" });
    }

    const { display_name, year_level, pin, avatar } = req.body || {};

    if (display_name !== undefined) {
      const name = String(display_name).trim();
      if (!name) return res.status(400).json({ error: "Display name cannot be empty" });
      child.display_name = name;
    }

    if (year_level !== undefined) {
      const yl = Number(year_level);
      if (![3, 5, 7, 9].includes(yl)) {
        return res.status(400).json({ error: "Year level must be 3, 5, 7, or 9" });
      }
      child.year_level = yl;
    }

    if (pin !== undefined) {
      const pinStr = String(pin).trim();
      if (!/^\d{4,6}$/.test(pinStr)) {
        return res.status(400).json({ error: "PIN must be 4–6 digits" });
      }
      child.pin_hash = pinStr; // pre-save hook will bcrypt this
    }

    if (avatar !== undefined) {
      child.avatar = avatar || null;
    }

    await child.save();

    return res.json({ child: child.toSafeJSON() });
  } catch (err) {
    console.error("Update child error:", err);
    return res.status(500).json({ error: "Failed to update child profile" });
  }
});

// DELETE /api/children/:childId — remove child profile
router.delete("/:childId", requireParent, async (req, res) => {
  try {
    const child = await Child.findOneAndDelete({
      _id: req.params.childId,
      parent_id: req.user.parentId,
    });

    if (!child) {
      return res.status(404).json({ error: "Child not found" });
    }

    // TODO (Phase 4): Also delete/suspend the FlexiQuiz user if provisioned
    // if (child.flexiquiz_user_id) { ... }

    return res.json({ message: "Child profile deleted", childId: req.params.childId });
  } catch (err) {
    console.error("Delete child error:", err);
    return res.status(500).json({ error: "Failed to delete child profile" });
  }
});

// GET /api/children/:childId — get a single child (parent or child themselves)
router.get("/:childId", requireParentOrChild, async (req, res) => {
  try {
    const { childId } = req.params;

    // Scope: parent can view their own children; child can view themselves
    const query = { _id: childId };
    if (req.user.role === "parent") {
      query.parent_id = req.user.parentId;
    } else if (req.user.role === "child") {
      if (req.user.childId !== childId) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    const child = await Child.findOne(query).select("-pin_hash -flexiquiz_password_enc");
    if (!child) {
      return res.status(404).json({ error: "Child not found" });
    }

    return res.json({ child });
  } catch (err) {
    console.error("Get child error:", err);
    return res.status(500).json({ error: "Failed to fetch child profile" });
  }
});

module.exports = router;
