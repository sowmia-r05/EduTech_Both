const router = require("express").Router();
const studentController = require("../controllers/studentController");

router.post("/login", studentController.login);
router.get("/:studentId/results", studentController.getResults);

module.exports = router;
