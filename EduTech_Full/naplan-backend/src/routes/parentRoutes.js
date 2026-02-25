const router = require("express").Router();
const connectDB = require("../config/db");
const Parent = require("../models/parent");


const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

router.post("/create", async (req, res) => {
  try {
    await connectDB();

    const name = String(req.body?.name || "").trim();
    const email = normalizeEmail(req.body?.email);

    if (!email) {
      return res.status(400).json({ ok: false, error: "email required" });
    }

    // Create-if-not-exists (if exists, update name/phone if provided)
    let parent = await Parent.findOne({ email });

    if (!parent) {
      parent = await Parent.create({
        email,
        name,
        status: "pending",
      });
      return res.json({
        ok: true,
        mode: "created",
        parent_id: parent._id.toString(),
        email: parent.email,
        status: parent.status,
      });
    }

    // existing account: update details if new values provided
    const updates = {};
    if (name && name !== parent.name) updates.name = name;
    if (Object.keys(updates).length) {
      parent = await Parent.findOneAndUpdate({ email }, { $set: updates }, { new: true });
    }

    return res.json({
      ok: true,
      mode: "existing",
      parent_id: parent._id.toString(),
      email: parent.email,
      status: parent.status, // pending or active
    });
  } catch (err) {
    console.error("Parent create failed:", err);
    // Handle unique key race condition
    if (err?.code === 11000) {
      return res.status(409).json({ ok: false, error: "Email already exists" });
    }
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

module.exports = router;