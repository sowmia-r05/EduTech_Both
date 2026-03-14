const router = require("express").Router();
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || process.env.PARENT_JWT_SECRET;

router.get("/session", (req, res) => {
  const parentToken = req.cookies?.parent_token;
  const childToken = req.cookies?.child_token;

  const sessions = {};

  if (parentToken) {
    try {
      const decoded = jwt.verify(parentToken, JWT_SECRET);
      sessions.parent = {
        parentId: decoded.parentId,
        email: decoded.email,
        role: "parent",
      };
    } catch {
      /* expired or invalid — ignore */
    }
  }

  if (childToken) {
    try {
      const decoded = jwt.verify(childToken, JWT_SECRET);
      sessions.child = {
        childId: decoded.childId,
        parentId: decoded.parentId,
        username: decoded.username,
        yearLevel: decoded.yearLevel,
        role: "child",
      };
    } catch {
      /* expired or invalid — ignore */
    }
  }

  res.json(sessions);
});

module.exports = router;
