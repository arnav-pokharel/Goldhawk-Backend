const pool = require('../../../db/pool');

async function ensureDealSafeSchema() {
  // Create table and columns if they do not exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS deal_safe (
      id SERIAL PRIMARY KEY,
      deal_id UUID NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      "SAFE_FORM" TEXT,
      "POST_MONEY_VALUATION" TEXT,
      "SAFE_TOTAL_AUTHORIZED" TEXT,
      "DISCOUNT_RATE" TEXT,
      "PRO_RATA_ENABLED" BOOLEAN,
      lock_termsheet BOOLEAN DEFAULT false,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_deal_safe_deal_id ON deal_safe(deal_id)');
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS uq_deal_safe_deal_id_version ON deal_safe(deal_id, version)');
}

async function latestVersion(deal_id) {
  const q = await pool.query('SELECT COALESCE(MAX(version), 0) AS v FROM deal_safe WHERE deal_id = $1', [deal_id]);
  return Number(q.rows[0]?.v || 0);
}

function pickAllowed(body) {
  const out = {};
  if (body.POST_MONEY_VALUATION !== undefined) out.POST_MONEY_VALUATION = body.POST_MONEY_VALUATION;
  if (body['SAFE_TOTAL-AUTHORIZED'] !== undefined) out.SAFE_TOTAL_AUTHORIZED = body['SAFE_TOTAL-AUTHORIZED'];
  if (body.SAFE_TOTAL_AUTHORIZED !== undefined) out.SAFE_TOTAL_AUTHORIZED = body.SAFE_TOTAL_AUTHORIZED;
  if (body.DISCOUNT_RATE !== undefined) out.DISCOUNT_RATE = body.DISCOUNT_RATE;
  if (body.PRO_RATA_ENABLED !== undefined) out.PRO_RATA_ENABLED = !!body.PRO_RATA_ENABLED;
  return out;
}

exports.offer = async (req, res) => {
  try {
    const { deal_id } = req.params;
    if (!deal_id) return res.status(400).json({ error: 'deal_id is required' });
    await ensureDealSafeSchema();

    const currentMax = await latestVersion(deal_id);
    const next = currentMax + 1 || 1;
    const vals = pickAllowed(req.body || {});

    const fields = [
      'deal_id','version','POST_MONEY_VALUATION','SAFE_TOTAL_AUTHORIZED','DISCOUNT_RATE','PRO_RATA_ENABLED','lock_termsheet'
    ];
    const values = [deal_id, next, vals.POST_MONEY_VALUATION ?? null, vals.SAFE_TOTAL_AUTHORIZED ?? null, vals.DISCOUNT_RATE ?? null, (vals.PRO_RATA_ENABLED ?? null), false];

    await pool.query(
      `INSERT INTO deal_safe (deal_id, version, "POST_MONEY_VALUATION", "SAFE_TOTAL_AUTHORIZED", "DISCOUNT_RATE", "PRO_RATA_ENABLED", lock_termsheet, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, NOW(), NOW())`,
      values
    );

    return res.status(201).json({ success: true, deal_id, version: next, lock_termsheet: false });
  } catch (err) {
    console.error('deal_safe.offer error', err);
    return res.status(500).json({ error: 'Failed to create SAFE offer' });
  }
};

exports.accept = async (req, res) => {
  try {
    const { deal_id } = req.params;
    if (!deal_id) return res.status(400).json({ error: 'deal_id is required' });
    await ensureDealSafeSchema();

    // Lock the highest version row for this deal
    const q = await pool.query(
      `UPDATE deal_safe ds
         SET lock_termsheet = true, updated_at = NOW()
       WHERE ds.deal_id = $1 AND ds.version = (
         SELECT COALESCE(MAX(version),1) FROM deal_safe WHERE deal_id = $1
       )
       RETURNING deal_id, version, lock_termsheet`,
      [deal_id]
    );
    if (q.rowCount === 0) return res.status(404).json({ error: 'No SAFE term sheet rows for this deal' });
    return res.json({ success: true, deal_id: q.rows[0].deal_id, version: q.rows[0].version, lock_termsheet: true });
  } catch (err) {
    console.error('deal_safe.accept error', err);
    return res.status(500).json({ error: 'Failed to lock SAFE term sheet' });
  }
};

exports.ping = async (req, res) => {
  // Kept for parity with client actions; can be used for notifications later.
  return res.json({ success: true });
};

exports.getCurrent = async (req, res) => {
  try {
    const { deal_id } = req.params;
    if (!deal_id) return res.status(400).json({ error: 'deal_id is required' });
    await ensureDealSafeSchema();

    const q = await pool.query(
      `SELECT deal_id, version, "POST_MONEY_VALUATION", "SAFE_TOTAL_AUTHORIZED", "DISCOUNT_RATE", "PRO_RATA_ENABLED", lock_termsheet, created_at
         FROM deal_safe
        WHERE deal_id = $1
        ORDER BY version DESC
        LIMIT 1`,
      [deal_id]
    );
    if (q.rows.length === 0) return res.status(404).json({ error: 'No SAFE versions found' });
    return res.json(q.rows[0]);
  } catch (err) {
    console.error('deal_safe.getCurrent error', err);
    return res.status(500).json({ error: 'Failed to fetch current SAFE' });
  }
};

exports.getHistory = async (req, res) => {
  try {
    const { deal_id } = req.params;
    if (!deal_id) return res.status(400).json({ error: 'deal_id is required' });
    await ensureDealSafeSchema();

    const latest = await latestVersion(deal_id);
    if (latest === 0) return res.json([]);

    const q = await pool.query(
      `SELECT deal_id, version, "POST_MONEY_VALUATION", "SAFE_TOTAL_AUTHORIZED", "DISCOUNT_RATE", "PRO_RATA_ENABLED", lock_termsheet, created_at
         FROM deal_safe
        WHERE deal_id = $1 AND version < $2
        ORDER BY version DESC`,
      [deal_id, latest]
    );
    return res.json(q.rows);
  } catch (err) {
    console.error('deal_safe.getHistory error', err);
    return res.status(500).json({ error: 'Failed to fetch SAFE history' });
  }
};
