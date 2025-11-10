const pool = require('../../db/pool');

async function columnExists(table, column) {
  const q = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2 LIMIT 1`,
    [table, column]
  );
  return q.rowCount > 0;
}

async function tableExists(table) {
  const q = await pool.query('SELECT to_regclass($1) AS t', [table]);
  return Boolean(q.rows?.[0]?.t);
}

async function latestSafe(deal_id) {
  const q = await pool.query(
    `SELECT deal_id, version, "POST_MONEY_VALUATION", "SAFE_TOTAL_AUTHORIZED", "DISCOUNT_RATE", "PRO_RATA_ENABLED", lock_termsheet, created_at
       FROM deal_safe WHERE deal_id = $1 ORDER BY version DESC NULLS LAST LIMIT 1`,
    [deal_id]
  );
  return q.rows[0] || null;
}

async function historySafe(deal_id, latestVersion) {
  const q = await pool.query(
    `SELECT deal_id, version, "POST_MONEY_VALUATION", "SAFE_TOTAL_AUTHORIZED", "DISCOUNT_RATE", "PRO_RATA_ENABLED", lock_termsheet, created_at
       FROM deal_safe WHERE deal_id = $1 AND version < $2 ORDER BY version DESC`,
    [deal_id, latestVersion]
  );
  return q.rows;
}

async function latestNote(deal_id) {
  const q = await pool.query(
    `SELECT * FROM deal_note WHERE deal_id = $1 ORDER BY version DESC NULLS LAST LIMIT 1`,
    [deal_id]
  );
  return q.rows[0] || null;
}

async function historyNote(deal_id, latestVersion) {
  const q = await pool.query(
    `SELECT * FROM deal_note WHERE deal_id = $1 AND version < $2 ORDER BY version DESC`,
    [deal_id, latestVersion]
  );
  return q.rows;
}

exports.getByStartup = async (req, res) => {
  try {
    const investor = req.user; // { uid }
    const startupUid = req.params.uid;
    if (!investor?.uid) return res.status(401).json({ error: 'Unauthorized' });

    const hasFundType = await columnExists('deal', 'fund_type');
    const dealSql = hasFundType
      ? `SELECT deal_id, fund_type FROM deal WHERE startup_uid = $1 AND investor_uid = $2 ORDER BY created_at DESC NULLS LAST LIMIT 1`
      : `SELECT deal_id, NULL::text AS fund_type FROM deal WHERE startup_uid = $1 AND investor_uid = $2 ORDER BY created_at DESC NULLS LAST LIMIT 1`;
    const dealQ = await pool.query(dealSql, [startupUid, investor.uid]);
    if (dealQ.rows.length === 0) return res.status(404).json({ error: 'No deal found for this startup' });

    const deal = dealQ.rows[0];
    const fundType = String(deal.fund_type || '').toUpperCase();

    const hasSafe = await tableExists('public.deal_safe');
    const hasNote = await tableExists('public.deal_note');

    let current = null, history = [], locked = false, type = fundType || null;

    if (!type) {
      // Try to infer from existing rows
      if (hasSafe) {
        const r = await latestSafe(deal.deal_id);
        if (r) type = 'SAFE';
      }
      if (!type && hasNote) {
        const r = await latestNote(deal.deal_id);
        if (r) type = 'NOTE';
      }
    }

    if (type === 'SAFE' && hasSafe) {
      const r = await latestSafe(deal.deal_id);
      if (r) {
        current = r; locked = r.lock_termsheet === true;
        history = await historySafe(deal.deal_id, r.version || 0);
      }
    } else if ((type === 'NOTES' || type === 'NOTE') && hasNote) {
      const r = await latestNote(deal.deal_id);
      if (r) {
        current = r; locked = r.lock_termsheet === true;
        history = await historyNote(deal.deal_id, r.version || 0);
      }
      type = 'NOTE';
    }

    return res.json({ deal_id: deal.deal_id, fund_type: type, current, history, locked });
  } catch (err) {
    console.error('getByStartup termsheet error', err);
    return res.status(500).json({ error: 'Server error fetching term sheet' });
  }
};
