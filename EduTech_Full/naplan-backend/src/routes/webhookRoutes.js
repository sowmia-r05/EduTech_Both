const express = require("express");
const router = express.Router();
const flexiQuizHandler = require("../webhooks/flexiQuizHandler");

router.post("/flexiquiz", flexiQuizHandler);

module.exports = router;
