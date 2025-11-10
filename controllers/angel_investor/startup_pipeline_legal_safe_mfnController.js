const pool = require('../../db/pool');

function validateUuid(v) {
  return typeof v === 'string' && /^[0-9a-fA-F-]{36}$/.test(v);
}

function parseJsonDeep(raw) {
  let out = raw;
  for (let i = 0; i < 3 && typeof out === 'string'; i++) {
    try { out = JSON.parse(out); } catch { break; }
  }
  return (out && typeof out === 'object') ? out : {};
}

const safeParse = (v) => {
  if (!v) return null;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return null; }
  }
  return v;
};

// GET MFN SAFE + signatures
exports.getMFNSafe = async (req, res) => {
  const { deal_id } = req.params;
  if (!validateUuid(deal_id)) return res.status(400).json({ error: 'invalid deal_id' });
  try {
    const result = await pool.query(
      `SELECT ds.*, ai.angel_name
         FROM deal_safe ds
         JOIN deal d ON ds.deal_id = d.deal_id
         JOIN angel_investor ai ON d.investor_uid = ai.uid
        WHERE ds.deal_id = $1
        LIMIT 1`,
      [deal_id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'SAFE not found' });

    const row = result.rows[0];
    const pick = (a, b) => (a !== undefined ? a : b !== undefined ? b : null);

    const raw = pick(row.mfn_safe, row.MFN_SAFE);
    const payload = parseJsonDeep(raw || {});

    const looksLikeSignature = (obj) => !!obj && typeof obj === 'object' && (
      Object.prototype.hasOwnProperty.call(obj, 'signed') ||
      Object.prototype.hasOwnProperty.call(obj, 'signature') ||
      Object.prototype.hasOwnProperty.call(obj, 'signerName')
    );

    const founderSignature = safeParse(
      payload.founderSignature || (looksLikeSignature(payload) ? payload : null)
    );
    const investorSignature = safeParse(payload.investorSignature);

    res.json({
      deal_id: row.deal_id,
      SAFE_FORM: pick(row.SAFE_FORM, row.safe_form),
      POST_MONEY_VALUATION: pick(row.POST_MONEY_VALUATION, row.post_money_valuation),
      SAFE_TOTAL_AUTHORIZED: pick(row.SAFE_TOTAL_AUTHORIZED, row.safe_total_authorized),
      DISCOUNT_RATE: pick(row.DISCOUNT_RATE, row.discount_rate),
      PRO_RATA_ENABLED: pick(row.PRO_RATA_ENABLED, row.pro_rata_enabled),
      founderSignature,
      investorSignature,
      investorName: row.angel_name || null,
    });
  } catch (err) {
    console.error('getMFNSafe error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST founder signature
exports.signFounder = async (req, res) => {
  const { deal_id } = req.params;
  const payload = req.body;
  if (!validateUuid(deal_id)) return res.status(400).json({ error: 'invalid deal_id' });
  try {
    const q = await pool.query(`SELECT mfn_safe FROM deal_safe WHERE deal_id = $1 LIMIT 1`, [deal_id]);
    if (q.rowCount === 0) return res.status(404).json({ error: 'SAFE not found' });
    let state = parseJsonDeep(q.rows[0].mfn_safe || {});
    if (state.founderSignature?.signed) return res.status(409).json({ error: 'Founder already signed' });
    state.founderSignature = payload;
    await pool.query(`UPDATE deal_safe SET mfn_safe = $2 WHERE deal_id = $1`, [deal_id, JSON.stringify(state)]);
    res.json({ success: true, founderSignature: safeParse(state.founderSignature) });
  } catch (err) {
    console.error('signFounder (mfn) error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST investor signature
exports.signInvestor = async (req, res) => {
  const { deal_id } = req.params;
  const payload = req.body;
  if (!validateUuid(deal_id)) return res.status(400).json({ error: 'invalid deal_id' });
  try {
    const q = await pool.query(`SELECT mfn_safe FROM deal_safe WHERE deal_id = $1 LIMIT 1`, [deal_id]);
    if (q.rowCount === 0) return res.status(404).json({ error: 'SAFE not found' });
    let state = parseJsonDeep(q.rows[0].mfn_safe || {});
    if (state.investorSignature?.signed) return res.status(409).json({ error: 'Investor already signed' });
    state.investorSignature = payload;
    await pool.query(`UPDATE deal_safe SET mfn_safe = $2 WHERE deal_id = $1`, [deal_id, JSON.stringify(state)]);
    res.json({ success: true, investorSignature: safeParse(state.investorSignature) });
  } catch (err) {
    console.error('signInvestor (mfn) error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

