const router = require("express").Router();
const User = require("../models/user");

// List users (most recently updated first)
router.get("/", async (req, res) => {
  const users = await User.find().sort({ updatedAt: -1, createdAt: -1 });
  res.json(users);
});

// Check if a user already exists by email_address (case-insensitive)
router.get("/exists", async (req, res) => {
  const email = String(req.query.email || "").trim().toLowerCase();
  if (!email) return res.status(400).json({ error: "email required" });
  const user = await User.findOne({ email_address: email }).select("user_id first_name last_name email_address deleted");
  return res.json({ exists: !!user, user: user || null });
});

// Fetch a single user by user_id
router.get("/:user_id", async (req, res) => {
  const user = await User.findOne({ user_id: req.params.user_id });
  res.json(user);
});

module.exports = router;