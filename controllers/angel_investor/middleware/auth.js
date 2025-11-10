const jwt = require('jsonwebtoken');
const pool = require("../../../db/pool");
const { SESSION_COOKIE_NAMES } = require('../../../utils/cookies');

function verifyWithSecrets(token) {
  if (!token) return null;
  const secrets = [
    process.env.JWT_SECRET,
    process.env.SESSION_SECRET,
    process.env.COOKIE_SECRET,
  ].filter(Boolean);
  for (const secret of secrets) {
    try {
      return jwt.verify(token, secret);
    } catch (err) {
      // try next secret
    }
  }
  return null;
}

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const bearerToken = authHeader && authHeader.split(' ')[1];
  const cookieToken = SESSION_COOKIE_NAMES.map(name =>
    (req.signedCookies && req.signedCookies[name]) ||
    (req.cookies && req.cookies[name])
  ).find(Boolean);

  if (!bearerToken && !cookieToken) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = verifyWithSecrets(bearerToken || cookieToken);
    if (!decoded?.uid) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    const user = await pool.query(
      'SELECT uid, email, angel_name, is_verified FROM angel_investor WHERE uid = $1',
      [decoded.uid]
    );

    if (user.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Allow some endpoints for unverified users (profile/settings to manage verification)
    const url = String(req.originalUrl || req.url || '');
    const relaxedPrefixes = [
      '/api/angel/onboarding/profile',
      '/api/angel/onboarding/upload-photo',
      '/api/angel/onboarding/personal',
      '/api/angel/settings/profile',
      '/api/angel/settings/email',
      '/api/angel/settings/verify-email',
      '/api/angel/settings/send-otp-current',
    ];
    const isRelaxed = relaxedPrefixes.some((p) => url.startsWith(p));
    if (!user.rows[0].is_verified && !isRelaxed) {
      return res.status(403).json({ error: 'Email not verified' });
    }

    req.user = user.rows[0];
    next();
  } catch (error) {
    console.error(error);
    res.status(403).json({ error: 'Invalid or expired token' });
  }
};

module.exports = { authenticateToken };
