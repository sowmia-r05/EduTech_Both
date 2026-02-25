const mongoose = require("mongoose");

const QuizCatalogSchema = new mongoose.Schema(
  {
    bundle_id: { type: String, required: true, unique: true, index: true },
    bundle_name: { type: String, required: true },
    description: { type: String, default: "" },
    year_level: { type: Number, required: true, enum: [3, 5, 7, 9] },
    subjects: [{ type: String }], // ['Reading', 'Writing', 'Maths', 'Conventions']
    flexiquiz_quiz_ids: [{ type: String }],
    flexiquiz_group_id: { type: String, default: null }, // optional group-based assignment
    price_cents: { type: Number, required: true },
    is_active: { type: Boolean, default: true },
    trial_quiz_ids: [{ type: String }],
    stripe_price_id: { type: String, default: null }, // link to Stripe Price object
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("QuizCatalog", QuizCatalogSchema);