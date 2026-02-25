const router = require("express").Router();
const User = require("../models/user");
const connectDB = require("../config/db");
const { registerRespondent } = require("../services/flexiQuizUsersService");

/* List users */
router.get("/", async (req, res) => {
  try {
    await connectDB();
    const users = await User.find().sort({ updatedAt: -1, createdAt: -1 });
    res.json(users);
  } catch (err) {
    console.error("Failed to list users:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ✅ (Optional) REMOVE this if email not unique anymore
router.get("/exists", async (req, res) => { ... });
*/

/* Register user in FlexiQuiz */
router.post("/register", async (req, res) => {
  try {
    await connectDB();

    const { firstName, lastName, yearLevel, email } = req.body || {};

    if (!firstName || !lastName || !yearLevel || !email) {
      return res.status(400).json({
        ok: false,
        error: "firstName, lastName, yearLevel, email are required",
      });
    }

    const created = await registerRespondent({
      firstName,
      lastName,
      yearLevel,
      email,
    });

    if (created?.user_id) {
      await User.updateOne(
        { user_id: created.user_id },
        {
          $set: {
            user_id: created.user_id,
            user_name: created.user_name,
            first_name: String(firstName || "").trim(),
            last_name: String(lastName || "").trim(),
            email_address: String(email || "").trim().toLowerCase(),
            year_level: String(yearLevel),
            deleted: false,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true }
      );
    }

    return res.json({
      ok: true,
      user_id: created.user_id,
      user_name: created.user_name,
      // password: created.password, // keep ONLY if you need to show it
      mode: created.mode || "created",
    });
  } catch (err) {
    console.error("FlexiQuiz register failed:", err?.detail || err?.response?.data || err);
    return res.status(500).json({
      ok: false,
      error: "Failed to register in FlexiQuiz",
      detail: err?.detail || err?.response?.data || err?.message || "Unknown error",
    });
  }
});

/* Fetch a user by user_id (keep at bottom) */
router.get("/:user_id", async (req, res) => {
  try {
    await connectDB();
    const user = await User.findOne({ user_id: req.params.user_id });
    res.json(user || null);
  } catch (err) {
    console.error("Fetch user failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;