const mongoose = require("mongoose");

const OptionSchema = new mongoose.Schema(
  {
    option_id: String,
    text: String,
    correct: Boolean,
    selected: Boolean,
  },
  { _id: false },
);

const CategorySchema = new mongoose.Schema(
  {
    category_id: String,
    name: String,
  },
  { _id: false },
);

const FileSchema = new mongoose.Schema(
  {
    file_id: String,
    name: String,
  },
  { _id: false },
);

const QuestionSchema = new mongoose.Schema(
  {
    question_id: String,
    type: String,
    text: String,
    points_scored: Number,
    points_available: Number,
    options: [OptionSchema],
    categories: [CategorySchema],
    files: [FileSchema],
  },
  { _id: false },
);

const QuizResponseSchema = new mongoose.Schema(
  {
    quiz_id: String,
    response_id: String,
    questions: [QuestionSchema],
  },
  { timestamps: true },
);

module.exports = mongoose.model("QuizResponse", QuizResponseSchema);
