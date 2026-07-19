// src/models/generationProgress.js
//
// Cross-instance progress tracker for admin background generation jobs
// (AI explanations, sub-topics, etc). Replaces the in-process progress objects
// that only worked on a single instance: with >= 2 web instances the POST that
// STARTS a job and the GET that POLLS its status can land on different boxes,
// so the poller saw an empty map and reported "idle" forever — or a Render
// restart mid-job wiped the record entirely.
//
// One document per (type, quiz_id). A TTL index auto-removes a record 30 min
// after its LAST update: a running job updates after every question so it never
// expires mid-run; a finished job's record disappears 30 min after completion
// (which is what the old `setTimeout(... 5 min)` cleanup was trying to do, but
// that timer died with the process and never fired on another instance).

const mongoose = require("mongoose");

const generationProgressSchema = new mongoose.Schema(
  {
    type:    { type: String, required: true }, // "explanations" | "subtopics"
    quiz_id: { type: String, required: true },
    status:  { type: String, default: "idle" }, // idle | running | done | error
    total:   { type: Number, default: 0 },
    done:    { type: Number, default: 0 },
    failed:  { type: Number, default: 0 },
    scope:   { type: String, default: "all" }, // "all" | "selected"
    error:   { type: String, default: null },
  },
  { timestamps: true, versionKey: false }
);

// Identity: exactly one progress doc per job type per quiz. Also what upsert
// keys on — keep it unique or two POSTs could create two records.
generationProgressSchema.index({ type: 1, quiz_id: 1 }, { unique: true });

// Auto-GC finished/abandoned records 30 min after the last write.
generationProgressSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 1800 });

module.exports =
  mongoose.models.GenerationProgress ||
  mongoose.model("GenerationProgress", generationProgressSchema);