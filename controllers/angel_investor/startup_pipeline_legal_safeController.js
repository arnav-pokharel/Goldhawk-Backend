const pool = require('../../db/pool');

// Helper to coerce JSON values safely (fallback if no deal_safe row)
function pickSafeConfigFromJson(row) {
  const safe = row?.safe || {};
  return {
    SAFE_FORM: safe.SAFE_FORM || safe.form || null,
    SAFE_TOTAL_AUTHORIZED: safe.SAFE_TOTAL_AUTHORIZED || safe.total || null,
    POST_MONEY_VALUATION: safe.POST_MONEY_VALUATION || safe.valuation_cap || null,
    DISCOUNT_RATE: safe.DISCOUNT_RATE || safe.discount || null,
    PRO_RATA_ENABLED: safe.PRO_RATA_ENABLED ?? safe.pro_rata ?? null,
  };
}

async function tableExists(table) {
  const q = await pool.query('SELECT to_regclass($1) AS t', [table]);
  return Boolean(q.rows?.[0]?.t);
}

async function columnExists(table, column) {
  const q = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2 LIMIT 1`,
    [table, column]
  );
  return q.rowCount > 0;
}

exports.getSafeLegalDocuments = async (req, res) => {
  try {
    const { deal_id } = req.params;
    const { uid } = req.user;

    // Check if deal.fund_type column exists
    const hasFundType = await columnExists('deal', 'fund_type');

    // Fetch base deal row and last termsheet JSON (for fallback)
    const baseDealSql = hasFundType
      ? `SELECT d.deal_id, d.investor_uid, d.fund_type, dt.safe
           FROM deal d
           LEFT JOIN LATERAL (
             SELECT safe FROM deal_termsheet dt
              WHERE dt.deal_id = d.deal_id
              ORDER BY dt.created_at DESC NULLS LAST
              LIMIT 1
           ) dt ON true
          WHERE d.deal_id = $1 AND d.investor_uid = $2 AND d.fund_type = 'safe'
          LIMIT 1`
      : `SELECT d.deal_id, d.investor_uid, NULL::text AS fund_type, dt.safe
           FROM deal d
           LEFT JOIN LATERAL (
             SELECT safe FROM deal_termsheet dt
              WHERE dt.deal_id = d.deal_id
              ORDER BY dt.created_at DESC NULLS LAST
              LIMIT 1
           ) dt ON true
          WHERE d.deal_id = $1 AND d.investor_uid = $2
          LIMIT 1`;

    const dealQ = await pool.query(baseDealSql, [deal_id, uid]);
    if (dealQ.rows.length === 0) {
      return res.status(404).json({ error: 'Deal not found or not SAFE' });
    }

    // Prefer dedicated deal_safe row when available
    const hasDealSafe = await tableExists('public.deal_safe');
    let cfg;
    let locked = false;
    if (hasDealSafe) {
      const safeQ = await pool.query(
        `SELECT "SAFE_FORM", "SAFE_TOTAL_AUTHORIZED", "POST_MONEY_VALUATION", "DISCOUNT_RATE", "PRO_RATA_ENABLED", lock_termsheet
           FROM deal_safe WHERE deal_id = $1 ORDER BY version DESC NULLS LAST LIMIT 1`,
        [deal_id]
      );
      if (safeQ.rows.length > 0) {
        const r = safeQ.rows[0];
        cfg = r;
        locked = r.lock_termsheet === true;
      }
    }

    // Fallback to JSON in deal_termsheet.safe
    if (!cfg) cfg = pickSafeConfigFromJson(dealQ.rows[0]);

    const docs = [];
    const add = (key, title) => docs.push({ key, title });

    // Always show Board Consent Safe
    add('board_consent', 'Board Consent Safe');

    const FORM = String(cfg.SAFE_FORM || '').toUpperCase();
    const PRO_RATA = cfg.PRO_RATA_ENABLED === true || String(cfg.PRO_RATA_ENABLED).toLowerCase() === 'true';

    switch (FORM) {
      case 'PMV':
        add('valuation_cap', 'Valuation Cap');
        if (PRO_RATA) add('pro_rata', 'Pro Rata Safe');
        break;
      case 'DIS':
        add('discount', 'Discount Safe');
        if (PRO_RATA) add('pro_rata', 'Pro Rata Safe');
        break;
      case 'MFN':
        add('mfn', 'MFN Safe');
        if (PRO_RATA) add('pro_rata', 'Pro Rata Safe');
        break;
      case 'PMV+DIS':
      case 'PMV_DIS':
      case 'PMV_DISCOUNT':
        add('valuation_cap', 'Valuation Cap');
        add('discount', 'Discount Safe');
        if (PRO_RATA) add('pro_rata', 'Pro Rata Safe');
        break;
      default:
        if (PRO_RATA) add('pro_rata', 'Pro Rata Safe');
        break;
    }

    const documents = docs.map((d) => ({
      key: d.key,
      title: d.title,
      pathSegment: `legals/doc/safe/${d.key}`,
    }));

    return res.json({ documents, safe: cfg, locked });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error computing SAFE legals' });
  }
};

// Read-only SAFE values for investor: prefer deal_safe, fallback to termsheet JSON
exports.getSafeValues = async (req, res) => {
  try {
    const { deal_id } = req.params;
    const { uid } = req.user;

    // Confirm deal belongs to investor
    const deal = await pool.query(
      `SELECT d.deal_id, d.investor_uid, dt.safe
         FROM deal d
         LEFT JOIN LATERAL (
           SELECT safe FROM deal_termsheet dt
            WHERE dt.deal_id = d.deal_id
            ORDER BY dt.created_at DESC NULLS LAST
            LIMIT 1
         ) dt ON true
        WHERE d.deal_id = $1 AND d.investor_uid = $2
        LIMIT 1`,
      [deal_id, uid]
    );
    if (deal.rows.length === 0) return res.status(404).json({ error: 'Deal not found' });

    let values = null;
    let locked = false;
    const hasDealSafe = await tableExists('public.deal_safe');
    if (hasDealSafe) {
      const q = await pool.query(
        `SELECT "SAFE_FORM", "SAFE_TOTAL_AUTHORIZED", "POST_MONEY_VALUATION", "DISCOUNT_RATE", "PRO_RATA_ENABLED", lock_termsheet
           FROM deal_safe WHERE deal_id = $1 ORDER BY version DESC NULLS LAST LIMIT 1`,
        [deal_id]
      );
      if (q.rows.length > 0) { values = q.rows[0]; locked = q.rows[0].lock_termsheet === true; }
    }
    if (!values) values = pickSafeConfigFromJson(deal.rows[0]);

    return res.json({ deal_id, values, locked });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error reading SAFE values' });
  }
};
