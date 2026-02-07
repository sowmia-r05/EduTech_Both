const flexiQuizService = require("../services/flexiQuizService");

exports.getAttemptResult = async (req, res) => {
  try {
    const { attemptId } = req.params;

    const result = await flexiQuizService.getQuizResult(attemptId);

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch attempt result"
    });
  }
};
