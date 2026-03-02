const jwt = require("jsonwebtoken");

// Support both env var names for backward compat with existing parentAuthRoutes
const JWT_SECRET = process.env.JWT_SECRET || process.env.PARENT_JWT_SECRET;

/**
 * Verify JWT from Authorization: Bearer <token>
 * Attaches decoded payload to req.user
 *
 * Existing parent tokens use: { typ: "parent", parent_id, email }
 * New parent tokens use:      { role: "parent", parentId, email }
 * Child tokens use:           { role: "child", childId, parentId, username, yearLevel }
 *
 * We normalize both shapes to a consistent req.user
 */
function verifyToken(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  if (!JWT_SECRET) {
    console.error("JWT_SECRET / PARENT_JWT_SECRET is not set");
    return res.status(500).json({ error: "Server auth configuration missing" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Normalize legacy parent tokens (typ: "parent") to new shape
    if (decoded.typ === "parent" && !decoded.role) {
      decoded.role = "parent";
      decoded.parentId = decoded.parent_id || decoded.parentId;
    }

    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired. Please log in again." });
    }
    return res.status(401).json({ error: "Invalid token" });
  }
}

/** Only allow parent role */
function requireParent(req, res, next) {
  if (req.user?.role !== "parent") {
    return res.status(403).json({ error: "Parent access required" });
  }
  next();
}

/** Only allow child role */
function requireChild(req, res, next) {
  if (req.user?.role !== "child") {
    return res.status(403).json({ error: "Child access required" });
  }
  next();
}

/** Allow either parent or child */
function requireAuth(req, res, next) {
  const role = req.user?.role;
  if (role !== "parent" && role !== "child") {
    return res.status(403).json({ error: "Authentication required" });
  }
  next();
}

module.exports = { verifyToken, requireParent, requireChild, requireAuth };
