const router = require("express").Router();
const examController = require("../controllers/examController");

router.get("/", examController.getAllExams);
router.get("/:examId", examController.getExamDetails);
router.post("/:examId/start", examController.startExam);
router.post("/:examId/submit", examController.submitExam);

module.exports = router;
