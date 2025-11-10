// controllers/founder/founder_loginController.js

const pool = require("../../db/pool");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const {
  setSessionCookie,
  setUidCookie,
  clearSessionCookies,
  clearUidCookies,
} = require("../../utils/cookies");

// Load secret key for signing cookies / tokens
const SESSION_SECRET = process.env.SESSION_SECRET || "supersecret";

exports.loginFounder = async (req, res) => {
  const { email, password } = req.body;
  console.log("[login] incoming body:", { email: email && "(redacted)", hasPassword: !!password });

  try {
    // 1. Look up founder by email (column is `email`)
    const result = await pool.query(
      "SELECT uid, email, password, email FROM founders WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
  console.warn("[login] no founder found for email", email);
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const founder = result.rows[0];

    // 2. Compare password with bcrypt hash (stored in `password`)
    const isMatch = await bcrypt.compare(password, founder.password);
  console.log("[login] bcrypt compare result:", !!isMatch);
  if (!isMatch) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // 3. Create a signed JWT payload
    const token = jwt.sign(
      { uid: founder.uid, email: founder.email || founder.email },
      SESSION_SECRET,
      { expiresIn: "7d" } // session valid for 7 days
    );
  console.log("[login] signed token length:", token.length);

    // 4. Set cookie
  setSessionCookie(res, token);
  console.log("[login] Issued session cookie");
  // Also provide a readable UID cookie for frontend utilities
  setUidCookie(res, founder.uid);

    // 5. Respond success â€” include token in JSON so dev frontends can use it
    return res.json({
      message: "Login successful",
      uid: founder.uid,
      token, // JWT for client-side use if cookies are blocked by browser policies
    });

  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
