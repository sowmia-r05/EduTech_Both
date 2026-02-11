const router = require("express").Router();
const User = require("../models/user");
const connectDB = require("../config/db"); // ✅ Import cached Mongo connection

/* ----------------------------------------------------
   List users (most recently updated first)
---------------------------------------------------- */
router.get("/", async (req, res) => {
  try {
    await connectDB(); // ✅ ensure connection is ready

    const users = await User.find().sort({ updatedAt: -1, createdAt: -1 });
    res.json(users);
  } catch (err) {
    console.error("Failed to list users:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ----------------------------------------------------
   Check if a user already exists by email_address
---------------------------------------------------- */
router.get("/exists", async (req, res) => {
  try {
    await connectDB(); // ✅ ensure connection is ready

    const email = String(req.query.email || "")
      .trim()
      .toLowerCase();

    if (!email) {
      return res.status(400).json({ error: "email required" });
    }

    // ⚡ Fast existence check
    const exists = await User.exists({ email_address: email });

    return res.json({ exists: !!exists });
  } catch (err) {
    console.error("Email exists check failed:", err);
    return res.status(500).json({ exists: false });
  }
});

/* ----------------------------------------------------
   Fetch a single user by user_id
---------------------------------------------------- */
router.get("/:user_id", async (req, res) => {
  try {
    await connectDB(); // ✅ ensure connection is ready

    const user = await User.findOne({ user_id: req.params.user_id });
    res.json(user || null);
  } catch (err) {
    console.error("Fetch user failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
