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

// always return JSON objects, never raw strings
const safeParse = (v) => {
  if (!v) return null;
  if (typeof v === "string") {
    try { return JSON.parse(v); } catch { return null; }
  }
  return v;
};

// GET valuation cap SAFE + signatures
exports.getValuationCap = async (req, res) => {
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
    const pick = (a, b) => a !== undefined ? a : b !== undefined ? b : null;

    const raw = pick(row.valuation_cap_safe, row.VALUATION_CAP_SAFE);
    const valuationCapSafe = parseJsonDeep(raw || {});

    // Back-compat: some rows may store a bare signature payload directly
    // in `valuation_cap_safe` instead of nesting under `.founderSignature`
    // or `.investorSignature`. Detect that shape and map to founder side
    // (founder pre-signs the document shown to investors).
    const looksLikeSignature = (obj) => !!obj && typeof obj === 'object' && (
      Object.prototype.hasOwnProperty.call(obj, 'signed') ||
      Object.prototype.hasOwnProperty.call(obj, 'signature') ||
      Object.prototype.hasOwnProperty.call(obj, 'signerName')
    );

    const founderSignature = safeParse(
      valuationCapSafe.founderSignature || (looksLikeSignature(valuationCapSafe) ? valuationCapSafe : null)
    );
    const investorSignature = safeParse(valuationCapSafe.investorSignature);

    res.json({
      deal_id: row.deal_id,
      SAFE_FORM: pick(row.SAFE_FORM, row.safe_form),
      POST_MONEY_VALUATION: pick(row.POST_MONEY_VALUATION, row.post_money_valuation),
      SAFE_TOTAL_AUTHORIZED: pick(row.SAFE_TOTAL_AUTHORIZED, row.safe_total_authorized),
      DISCOUNT_RATE: pick(row.DISCOUNT_RATE, row.discount_rate),
      PRO_RATA_ENABLED: pick(row.PRO_RATA_ENABLED, row.pro_rata_enabled),

      // always parsed JSON objects here
      founderSignature,
      investorSignature,
      investorName: row.angel_name || null,
    });
  } catch (err) {
    console.error('getValuationCap error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST founder signature
exports.signFounder = async (req, res) => {
  const { deal_id } = req.params;
  const payload = req.body;
  if (!validateUuid(deal_id)) return res.status(400).json({ error: 'invalid deal_id' });

  try {
    const result = await pool.query(
      `SELECT valuation_cap_safe FROM deal_safe WHERE deal_id = $1 LIMIT 1`,
      [deal_id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'SAFE not found' });

    let vc = parseJsonDeep(result.rows[0].valuation_cap_safe || {});

    if (vc.founderSignature?.signed)
      return res.status(409).json({ error: 'Founder already signed' });

    vc.founderSignature = payload;

    await pool.query(
      `UPDATE deal_safe SET valuation_cap_safe = $2 WHERE deal_id = $1`,
      [deal_id, JSON.stringify(vc)]
    );

    res.json({ success: true, founderSignature: safeParse(vc.founderSignature) });
  } catch (err) {
    console.error('signFounder error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST investor signature
exports.signInvestor = async (req, res) => {
  const { deal_id } = req.params;
  const payload = req.body;
  if (!validateUuid(deal_id)) return res.status(400).json({ error: 'invalid deal_id' });

  try {
    const result = await pool.query(
      `SELECT valuation_cap_safe FROM deal_safe WHERE deal_id = $1 LIMIT 1`,
      [deal_id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'SAFE not found' });

    let vc = parseJsonDeep(result.rows[0].valuation_cap_safe || {});

    if (vc.investorSignature?.signed)
      return res.status(409).json({ error: 'Investor already signed' });

    vc.investorSignature = payload;

    await pool.query(
      `UPDATE deal_safe SET valuation_cap_safe = $2 WHERE deal_id = $1`,
      [deal_id, JSON.stringify(vc)]
    );

    res.json({ success: true, investorSignature: safeParse(vc.investorSignature) });
  } catch (err) {
    console.error('signInvestor error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
