const jwt = require("jsonwebtoken");
const { SESSION_COOKIE_NAMES } = require("../utils/cookies");

const SESSION_SECRET = process.env.SESSION_SECRET || "supersecret";
const COOKIE_SECRET = process.env.COOKIE_SECRET || "supersecret";

function firstCookie(source, names) {
  if (!source) return undefined;
  for (const name of names) {
    const value = source[name];
    if (value) return value;
  }
  return undefined;
}

module.exports = (req, res, next) => {
  // try signed session first (verify flow)
  const signedToken = firstCookie(req.signedCookies, SESSION_COOKIE_NAMES);
  if (signedToken) {
    try {
      const decoded = jwt.verify(signedToken, COOKIE_SECRET);
      if (decoded?.uid) {
        req.user = { uid: decoded.uid, email: decoded.email };
        return next();
      }
    } catch (e) {
      // fallthrough to unsigned token
    }
  }

  const token = firstCookie(req.cookies, SESSION_COOKIE_NAMES);
  if (!token) return res.status(401).json({ error: "Unauthorized: No session token" });
  try {
    const decoded = jwt.verify(token, SESSION_SECRET);
    if (!decoded?.uid) return res.status(401).json({ error: "Unauthorized: Invalid token" });
    req.user = { uid: decoded.uid, email: decoded.email };
    return next();
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized: Invalid or expired session" });
  }
};
