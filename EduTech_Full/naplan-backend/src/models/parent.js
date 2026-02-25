const mongoose = require("mongoose");

const ParentSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
      default: "",
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["active"],
      default: "active",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Parent", ParentSchema);