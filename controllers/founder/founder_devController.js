const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcrypt");
const pool = require("../../db/pool");

// Dev helper: create a fully populated founders row for local testing
exports.createTestFounder = async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "Not allowed in production" });
  }

  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "email and password required" });
  }

  try {
    const uid = uuidv4();
    const hashed = await bcrypt.hash(password, 10);

    await pool.query(
      `INSERT INTO founders (uid, email, password, is_verified, step1, step2, step3, created_at, updated_at)
       VALUES ($1::uuid, $2::text, $3::text, true, false, false, false, NOW(), NOW())`,
      [uid, email, hashed]
    );

    return res.json({ uid, email });
  } catch (err) {
    console.error('Dev create founder error:', err);
    return res.status(500).json({ error: 'Failed to create test founder' });
  }
};

exports.getFounder = async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "Not allowed in production" });
  }
  const { uid } = req.params;
  if (!uid) return res.status(400).json({ error: 'uid required' });
  try {
    const { rows } = await pool.query('SELECT uid, email, is_verified, created_at FROM founders WHERE uid = $1', [uid]);
    if (rows.length === 0) return res.status(404).json({ error: 'not found' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('dev getFounder error', err);
    return res.status(500).json({ error: 'db error' });
  }
};
