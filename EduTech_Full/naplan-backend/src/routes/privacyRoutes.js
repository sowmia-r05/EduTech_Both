/**
 * routes/privacyRoutes.js
 *
 * DELETE /api/privacy/child/:childId  — erase one child profile
 * DELETE /api/privacy/account         — erase the whole account
 *
 * Both are IRREVERSIBLE.
 *
 * Account deletion additionally requires the parent to retype their own email
 * address in the request body. A destructive, unrecoverable action needs a
 * deliberate act — a stolen or borrowed session should not be able to wipe an
 * account by hitting a URL, and a mis-click should not either.
 *
 * Mount in app.js alongside the other routers:
 *   app.use("/api/privacy", require("./routes/privacyRoutes"));
 *
 * Place at: naplan-backend/src/routes/privacyRoutes.js
 */

const router = require("express").Router();

const { verifyToken, requireParent } = require("../middleware/auth");
const connectDB = require("../config/db");
const Child = require("../models/child");
const Parent = require("../models/parent");
const { eraseChild, eraseAccount } = require("../services/erasureService");
const { clearAuthCookie } = require("../utils/setCookies");

// ────────────────────────────────────────────
// DELETE /api/privacy/child/:childId
// Erase one child profile and everything derived from it.
// The parent account itself survives.
// ────────────────────────────────────────────
router.delete("/child/:childId", verifyToken, requireParent, async (req, res) => {
  try {
    await connectDB();
    const parentId = req.user.parentId || req.user.parent_id;
    const { childId } = req.params;

    // Ownership check BEFORE anything is touched. Scoped find, not findById +
    // compare, so a mismatched parent cannot reach the erase call at all.
    const child = await Child.findOne({ _id: childId, parent_id: parentId }).lean();
    if (!child) return res.status(404).json({ error: "Child not found" });

    const failures = [];
    const counts = await eraseChild(child._id, { failures });

    console.log(`🗑️ Child erasure ${childId}:`, counts, failures);

    return res.json({
      ok: true,
      erased: counts,
      external_failures: failures,
    });
  } catch (err) {
    console.error("Child erasure error:", err);
    return res.status(500).json({ error: "Failed to delete child data" });
  }
});

// ────────────────────────────────────────────
// DELETE /api/privacy/account
// Body: { confirm_email: "parent@example.com" }
//
// Erases every child, then the parent record. Purchases are de-identified and
// retained; see erasureService.js for the retention reasoning.
// ────────────────────────────────────────────
router.delete("/account", verifyToken, requireParent, async (req, res) => {
  try {
    await connectDB();
    const parentId = req.user.parentId || req.user.parent_id;

    const parent = await Parent.findById(parentId).lean();
    if (!parent) return res.status(404).json({ error: "Account not found" });

    // Typed confirmation. Compared case-insensitively but must otherwise match
    // exactly — this is the only guard between a stray request and total loss.
    const confirm = String(req.body?.confirm_email || "").trim().toLowerCase();
    if (!confirm || confirm !== String(parent.email || "").toLowerCase()) {
      return res.status(400).json({
        error:
          "Please type your account email address exactly to confirm deletion.",
        code: "CONFIRMATION_REQUIRED",
      });
    }

    const result = await eraseAccount(parentId);
    if (!result.ok) return res.status(400).json({ error: result.error });

    // The session now points at a record that no longer exists.
    clearAuthCookie(res, "parent_token");
    clearAuthCookie(res, "child_token");

    console.log(`🗑️ Account erasure ${parentId}:`, result.totals, result.failures);

    return res.json({
      ok: true,
      erased: result.totals,
      external_failures: result.failures,
      note:
        "Purchase records have been de-identified and retained for five years " +
        "as required by Australian tax law. Stripe retains its own transaction " +
        "records independently.",
    });
  } catch (err) {
    console.error("Account erasure error:", err);
    return res.status(500).json({ error: "Failed to delete account" });
  }
});

module.exports = router;