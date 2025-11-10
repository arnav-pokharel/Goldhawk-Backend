const jwt = require("jsonwebtoken");

// Generate a 6-digit OTP as a string (leading zeros allowed)
function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Generate a JWT for a given uid
function generateJWT(uid, opts = {}) {
  const secret =
    process.env.JWT_SECRET ||
    process.env.SESSION_SECRET ||
    process.env.COOKIE_SECRET ||
    "supersecret";
  const payload = { uid };
  const options = { expiresIn: opts.expiresIn || "7d" };
  return require("jsonwebtoken").sign(payload, secret, options);
}

// Summarize deal status rows: [{status, count}] -> { PENDING: n, FINALIZED: n, ... }
function generateDealStatusSummary(rows = []) {
  const summary = {};
  for (const r of rows) {
    const key = String(r.status || "UNKNOWN").toUpperCase();
    const cnt = Number(r.count || 0);
    summary[key] = (summary[key] || 0) + cnt;
  }
  return summary;
}

module.exports = {
  generateOTP,
  generateJWT,
  generateDealStatusSummary,
};

