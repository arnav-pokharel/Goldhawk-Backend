const pool = require('../../db/pool');

// GET /api/startup/:uid/termsheet_safe
// Returns the JSON stored in startup_active.termsheet_safe for the given startup uid.
// The JSON should already contain keys expected by the frontend template, e.g.:
// company_name, state_of_incorporation, safe_form, safe_total_authorized,
// post_money_valuation, discount_rate, pro_rata_enabled,
// signatory_name, signatory_title,
// investor_or_firm, i_signatory_name, i_signatory_title
exports.getStartupSafeTermsheet = async (req, res) => {
  try {
    const { uid } = req.params;
    if (!uid) return res.status(400).json({ error: 'uid required' });

    let row;
    try {
      const q = await pool.query('SELECT termsheet_safe FROM startup_active WHERE uid = $1', [uid]);
      row = q.rows && q.rows[0];
    } catch (e) {
      // If the column does not exist yet, return 404 with a helpful message
      const msg = e?.message || '';
      if (msg.includes('column') && msg.includes('termsheet_safe')) {
        return res.status(404).json({ error: 'termsheet_safe not available for this startup' });
      }
      throw e;
    }

    const data = row?.termsheet_safe;
    if (!data) {
      return res.status(404).json({ error: 'No SAFE term sheet found for this startup' });
    }

    // If stored as text, attempt to parse JSON; if already json/jsonb, return as-is
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        return res.json(parsed);
      } catch (_) {
        // fall through and return raw string if not valid JSON
        return res.json({ raw: data });
      }
    }

    return res.json(data);
  } catch (err) {
    console.error('getStartupSafeTermsheet error:', err);
    return res.status(500).json({ error: 'Server error fetching term sheet', detail: err?.message || String(err) });
  }
};
