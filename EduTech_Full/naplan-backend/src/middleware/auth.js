const jwt = require("jsonwebtoken");

/**
 * JWT Auth Middleware
 * See Design Document v2.1 — Phase 1
 *
 * Parent JWT payload: { parentId, email, role: 'parent' }
 * Child  JWT payload: { childId, parentId, username, yearLevel, role: 'child' }
 */

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET env var is missing");
  return secret;
}

// ─── Sign tokens ───

function signParentToken(parent) {
  return jwt.sign(
    {
      parentId: parent._id.toString(),
      email: parent.email,
      role: "parent",
    },
    getSecret(),
    { expiresIn: process.env.JWT_PARENT_EXPIRES || "7d" }
  );
}

function signChildToken(child) {
  return jwt.sign(
    {
      childId: child._id.toString(),
      parentId: child.parent_id.toString(),
      username: child.username,
      yearLevel: child.year_level,
      role: "child",
    },
    getSecret(),
    { expiresIn: process.env.JWT_CHILD_EXPIRES || "4h" }
  );
}

// ─── Verify token (shared logic) ───

function verifyToken(token) {
  return jwt.verify(token, getSecret());
}

function extractToken(req) {
  const header = req.headers.authorization;
  if (!header) return null;

  // Support "Bearer <token>" or raw token
  if (header.startsWith("Bearer ")) return header.slice(7).trim();
  return header.trim();
}

// ─── Middleware: require any valid token (parent or child) ───

function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired" });
    }
    return res.status(401).json({ error: "Invalid token" });
  }
}

// ─── Middleware: require parent role ───

function requireParent(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const decoded = verifyToken(token);
    if (decoded.role !== "parent") {
      return res.status(403).json({ error: "Parent access required" });
    }
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired" });
    }
    return res.status(401).json({ error: "Invalid token" });
  }
}

// ─── Middleware: require child role ───

function requireChild(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const decoded = verifyToken(token);
    if (decoded.role !== "child") {
      return res.status(403).json({ error: "Child access required" });
    }
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired" });
    }
    return res.status(401).json({ error: "Invalid token" });
  }
}

// ─── Middleware: require parent OR child ───

function requireParentOrChild(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const decoded = verifyToken(token);
    if (decoded.role !== "parent" && decoded.role !== "child") {
      return res.status(403).json({ error: "Access denied" });
    }
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired" });
    }
    return res.status(401).json({ error: "Invalid token" });
  }
}

module.exports = {
  signParentToken,
  signChildToken,
  verifyToken,
  requireAuth,
  requireParent,
  requireChild,
  requireParentOrChild,
};
