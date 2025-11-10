const pool = require("../../db/pool");

// Public investor view for founders: angel investor basic profile
exports.getAngelProfile = async (req, res) => {
  try {
    const { uid } = req.params;
    if (!uid) return res.status(400).json({ error: 'uid required' });
    const q = await pool.query(
      `SELECT uid, angel_name, profile_picture, bio, total_investment, total_amount_invested
         FROM angel_investor WHERE uid = $1`,
      [uid]
    );
    if (q.rowCount === 0) return res.status(404).json({ error: 'Investor not found' });
    return res.json({ profile: q.rows[0] });
  } catch (e) {
    console.error('getAngelProfile error:', e);
    return res.status(500).json({ error: 'Failed to load investor profile' });
  }
};

