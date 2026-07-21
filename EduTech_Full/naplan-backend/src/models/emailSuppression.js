const mongoose = require("mongoose");

/**
 * models/emailSuppression.js
 *
 * The suppression list. One document per address that should not be sent to,
 * or that is accumulating soft failures.
 *
 * WHY THIS EXISTS
 *   Retrying a hard-bouncing address forever damages sender reputation for
 *   every other recipient. Mailbox providers treat repeated sends to dead
 *   addresses as a spam signal, and a complaint ("this is junk") that keeps
 *   receiving mail escalates quickly. Brevo maintains its own internal list,
 *   but it is invisible to your application — you would keep calling the API,
 *   keep getting 2xx, and keep believing the mail was delivered.
 *
 * SUPPRESSED vs COUNTING
 *   suppressed: true  → do not send. Set by hard_bounce, invalid_email, spam,
 *                       blocked, or enough soft bounces.
 *   suppressed: false → still sendable; soft_bounce_count is accumulating.
 *
 * REVERSIBLE BY DESIGN
 *   A mailbox that was full last month may work today, and people do reclaim
 *   addresses. Nothing here is permanent — support can clear an entry, and
 *   soft-bounce suppressions expire (see SOFT_BOUNCE_RESET_DAYS in
 *   brevoWebhookRoutes.js). Complaints are the exception: never auto-unsuppress
 *   someone who marked you as spam.
 *
 * Place at: naplan-backend/src/models/emailSuppression.js
 */
const EmailSuppressionSchema = new mongoose.Schema(
  {
    // Always stored lower-cased and trimmed — see normalizeEmail() in the
    // webhook route. A case mismatch here means a silent suppression miss.
    email: {
      type: String,
      required: true,
      unique: true,
      index: true,
      lowercase: true,
      trim: true,
    },

    suppressed: { type: Boolean, default: false, index: true },

    // Why we stopped sending. "complaint" is treated as permanent.
    reason: {
      type: String,
      enum: [
        "hard_bounce",
        "invalid_email",
        "complaint",
        "blocked",
        "soft_bounce_threshold",
        "unsubscribed",
        "manual",
      ],
      default: null,
    },

    // Verbatim from Brevo, for support to read when a parent says "I never got
    // the code". A raw SMTP reason ("mailbox does not exist") answers that
    // question instantly.
    provider_message: { type: String, default: null },

    soft_bounce_count: { type: Number, default: 0 },
    last_event_at: { type: Date, default: null },
    suppressed_at: { type: Date, default: null },

    // Cleared manually by support. Kept as a field rather than deleting the
    // document so the history survives.
    unsuppressed_at: { type: Date, default: null },
    unsuppressed_by: { type: String, default: null },
  },
  { timestamps: true, versionKey: false },
);

module.exports = mongoose.model("EmailSuppression", EmailSuppressionSchema);