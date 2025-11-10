const pool = require('../../../db/pool');

async function ensureDealNoteSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS deal_note (
      id SERIAL PRIMARY KEY,
      deal_id UUID NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      "NOTE_SERIES" TEXT,
      "NOTE_TOTAL_AUTHORIZED" TEXT,
      "DATE_MATURITY" TEXT,
      "INTEREST_RATE" TEXT,
      "QUALIFIED_FINANCING_THRESHOLD" TEXT,
      "CONVERSION_DISCOUNT_PERCENT" TEXT,
      "VALUATION_CAP" TEXT,
      "NOTE_PRO_RATA_ENABLED" BOOLEAN,
      "NOTE_MFN_ENABLED" BOOLEAN,
      "AMENDMENT_MAJORITY_THRESHOLD" TEXT,
      "COMPANY_NAME" TEXT,
      "SIGNATORY_NAME" TEXT,
      "SIGNATORY_TITLE" TEXT,
      "INVESTOR_OR_FIRM" TEXT,
      "I_SIGNATORY_NAME" TEXT,
      "I_SIGNATORY_TITLE" TEXT,
      lock_termsheet BOOLEAN DEFAULT false,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_deal_note_deal_id ON deal_note(deal_id)');
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS uq_deal_note_deal_id_version ON deal_note(deal_id, version)');
}

async function latestVersion(deal_id) {
  const q = await pool.query('SELECT COALESCE(MAX(version), 0) AS v FROM deal_note WHERE deal_id = $1', [deal_id]);
  return Number(q.rows[0]?.v || 0);
}

function pickAllowed(body) {
  const keys = [
    'NOTE_SERIES','NOTE_TOTAL_AUTHORIZED','DATE_MATURITY','INTEREST_RATE','QUALIFIED_FINANCING_THRESHOLD',
    'CONVERSION_DISCOUNT_PERCENT','VALUATION_CAP','NOTE_PRO_RATA_ENABLED','NOTE_MFN_ENABLED','AMENDMENT_MAJORITY_THRESHOLD',
    'COMPANY_NAME','SIGNATORY_NAME','SIGNATORY_TITLE','INVESTOR_OR_FIRM','I_SIGNATORY_NAME','I_SIGNATORY_TITLE'
  ];
  const out = {};
  for (const k of keys) if (body[k] !== undefined) out[k] = body[k];
  if (out.NOTE_PRO_RATA_ENABLED !== undefined) out.NOTE_PRO_RATA_ENABLED = !!out.NOTE_PRO_RATA_ENABLED;
  if (out.NOTE_MFN_ENABLED !== undefined) out.NOTE_MFN_ENABLED = !!out.NOTE_MFN_ENABLED;
  return out;
}

exports.offer = async (req, res) => {
  try {
    const { deal_id } = req.params;
    if (!deal_id) return res.status(400).json({ error: 'deal_id is required' });
    await ensureDealNoteSchema();
    const next = (await latestVersion(deal_id)) + 1 || 1;
    const v = pickAllowed(req.body || {});

    // Build dynamic insert for allowed fields
    const cols = ['deal_id','version','lock_termsheet'];
    const params = [deal_id, next, false];
    const placeholders = ['$1', '$2', '$3'];
    let idx = 4;
    for (const [k, val] of Object.entries(v)) {
      cols.push('"' + k + '"');
      params.push(val);
      placeholders.push(`$${idx++}`);
    }

    const sql = `INSERT INTO deal_note (${cols.join(',')}) VALUES (${placeholders.join(',')})`;
    await pool.query(sql, params);
    return res.status(201).json({ success: true, deal_id, version: next, lock_termsheet: false });
  } catch (err) {
    console.error('deal_note.offer error', err);
    return res.status(500).json({ error: 'Failed to create NOTE offer' });
  }
};

exports.accept = async (req, res) => {
  try {
    const { deal_id } = req.params;
    if (!deal_id) return res.status(400).json({ error: 'deal_id is required' });
    await ensureDealNoteSchema();
    const q = await pool.query(
      `UPDATE deal_note dn SET lock_termsheet = true, updated_at = NOW()
        WHERE dn.deal_id = $1 AND dn.version = (SELECT COALESCE(MAX(version),1) FROM deal_note WHERE deal_id = $1)
        RETURNING deal_id, version, lock_termsheet`,
      [deal_id]
    );
    if (q.rowCount === 0) return res.status(404).json({ error: 'No NOTE term sheet rows for this deal' });
    return res.json({ success: true, deal_id: q.rows[0].deal_id, version: q.rows[0].version, lock_termsheet: true });
  } catch (err) {
    console.error('deal_note.accept error', err);
    return res.status(500).json({ error: 'Failed to lock NOTE term sheet' });
  }
};

exports.ping = async (_req, res) => {
  return res.json({ success: true });
};

exports.getCurrent = async (req, res) => {
  try {
    const { deal_id } = req.params;
    if (!deal_id) return res.status(400).json({ error: 'deal_id is required' });
    await ensureDealNoteSchema();
    const q = await pool.query(
      `SELECT * FROM deal_note WHERE deal_id = $1 ORDER BY version DESC LIMIT 1`,
      [deal_id]
    );
    if (q.rows.length === 0) return res.status(404).json({ error: 'No NOTE versions found' });
    return res.json(q.rows[0]);
  } catch (err) {
    console.error('deal_note.getCurrent error', err);
    return res.status(500).json({ error: 'Failed to fetch current NOTE' });
  }
};

exports.getHistory = async (req, res) => {
  try {
    const { deal_id } = req.params;
    if (!deal_id) return res.status(400).json({ error: 'deal_id is required' });
    await ensureDealNoteSchema();
    const latest = await latestVersion(deal_id);
    if (latest === 0) return res.json([]);
    const q = await pool.query(
      `SELECT * FROM deal_note WHERE deal_id = $1 AND version < $2 ORDER BY version DESC`,
      [deal_id, latest]
    );
    return res.json(q.rows);
  } catch (err) {
    console.error('deal_note.getHistory error', err);
    return res.status(500).json({ error: 'Failed to fetch NOTE history' });
  }
};
