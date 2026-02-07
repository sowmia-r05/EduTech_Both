const router = require("express").Router();
const flexiQuizController = require("../controllers/flexiQuizController");

router.get("/attempts/:attemptId", flexiQuizController.getAttemptResult);

module.exports = router;
