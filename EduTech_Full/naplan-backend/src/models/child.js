const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const SALT_ROUNDS = 12;

const ChildSchema = new mongoose.Schema(
  {
    parent_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Parent",
      required: true,
      index: true,
    },
    display_name: {
      type: String,
      required: true,
      trim: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      index: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: (v) => /^[a-z0-9_]{3,20}$/.test(v),
        message:
          "Username must be 3–20 characters, lowercase alphanumeric + underscores only.",
      },
    },
    year_level: {
      type: Number,
      required: true,
      enum: [3, 5, 7, 9],
    },
    pin_hash: {
      type: String,
      required: true,
    },

    // Parental consent
    parental_consent: {
      type: Boolean,
      required: true,
      default: false,
    },
    parental_consent_at: {
      type: Date,
      default: null,
    },

    // Email notifications
    email_notifications: {
      type: Boolean,
      default: false,
    },

    // ═══════════════════════════════════════════════════════════════════════
    // ENGAGEMENT TRACKING (ENGAGE-1)
    //
    // Without these, "logged in but never used the product" and "never logged
    // in at all" are indistinguishable — both are simply a Child with zero
    // QuizAttempt documents. They are opposite problems:
    //   • never logged in      → onboarding / credential-handoff failure
    //   • logs in, never quizzes → product failure inside the quiz flow
    //
    // last_login_at is written on every successful child login. It is a
    // deliberate overwrite, not an append — we store the most recent login
    // only, never a login history. A full audit trail of a minor's session
    // times is more personal data than this feature needs, and would have to
    // be justified and retained under APP 11. Keep it to one timestamp.
    //
    // ⚠️ RETENTION: these fields are in scope for the retention policy
    //    (Tracker row RETENTION). When that cron is built, they are deleted
    //    along with the rest of the child record.
    // ═══════════════════════════════════════════════════════════════════════
    last_login_at: {
      type: Date,
      default: null,
      index: true,
    },

    // Cheap monotonic counter. Distinguishes "logged in exactly once, at
    // creation" from "returns regularly but never completes anything".
    login_count: {
      type: Number,
      default: 0,
    },

    // Denormalised from QuizAttempt so the dormancy query is a single indexed
    // scan of Child rather than a $lookup across every attempt ever recorded.
    // On M0 that difference matters. Written on quiz submit.
    // This is a CACHE — QuizAttempt remains the source of truth. If the two
    // ever disagree, trust QuizAttempt and backfill.
    last_activity_at: {
      type: Date,
      default: null,
      index: true,
    },

    // Status
    status: {
      type: String,
      enum: ["trial", "active", "expired"],
      default: "trial",
    },

    // Entitlements
    // embed IDs → used by frontend for iframe display + filtering
    entitled_quiz_ids: [{ type: String }],
    // Bundle IDs → tracks which bundles were purchased
    entitled_bundle_ids: [{ type: String }],
  },
  { timestamps: true, versionKey: false },
);

// Compound index for the dormancy cohort query:
//   status = active/trial, last_activity_at older than N days (or null)
ChildSchema.index({ status: 1, last_activity_at: 1 });

// ---------- PIN hashing ----------
ChildSchema.pre("save", async function () {
  if (!this.isModified("pin_hash")) return;
  try {
    this.pin_hash = await bcrypt.hash(this.pin_hash, SALT_ROUNDS);
  } catch (err) {
    throw err;
  }
});

ChildSchema.methods.comparePin = async function (rawPin) {
  return bcrypt.compare(String(rawPin), this.pin_hash);
};

ChildSchema.statics.hashPin = async function (rawPin) {
  return bcrypt.hash(String(rawPin), SALT_ROUNDS);
};

module.exports = mongoose.model("Child", ChildSchema);