const crypto = require('crypto');
const pool = require('../../../db/pool');

function generate10Digit() {
  // 10-digit number, no leading zero: 1000000000 - 9999999999
  const min = 1_000_000_000;
  const max = 9_999_999_999;
  // crypto.randomInt is inclusive of min, exclusive of max
  const n = crypto.randomInt(min, max + 1);
  return String(n);
}

let schemaEnsured = false;
async function ensureSchema() {
  if (schemaEnsured) return;
  // Create all_account table and necessary indexes/columns if they don't exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS all_account (
      account_number VARCHAR(10) PRIMARY KEY,
      uid UUID NOT NULL,
      type VARCHAR(64) NOT NULL,
      name VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_all_account_uid_type ON all_account(uid, type);
    ALTER TABLE founders ADD COLUMN IF NOT EXISTS acc_number VARCHAR(10);
    ALTER TABLE angel_investor ADD COLUMN IF NOT EXISTS acc_no VARCHAR(10);
  `);
  schemaEnsured = true;
}

async function findExistingByUid(uid, type) {
  const { rows } = await pool.query(
    'SELECT account_number, uid, type, name FROM all_account WHERE uid = $1 AND type = $2 LIMIT 1',
    [uid, type]
  );
  return rows[0] || null;
}

async function issueFor(uid, type, name, updateOwner) {
  await ensureSchema();
  // If already issued for this uid+type, return it (and backfill owner column if needed)
  const existing = await findExistingByUid(uid, type);
  if (existing) {
    // Best-effort owner table backfill
    if (typeof updateOwner === 'function') {
      try { await updateOwner(existing.account_number); } catch (_) {}
    }
    // Optionally update name if provided now but previously null
    if (name && !existing.name) {
      try { await pool.query('UPDATE all_account SET name = $1 WHERE uid = $2 AND type = $3', [name, uid, type]); } catch (_) {}
    }
    return existing;
  }

  // Generate a unique 10-digit account number
  let issuedRow = null;
  for (let i = 0; i < 50; i++) {
    const candidate = generate10Digit();
    // Attempt an idempotent insert; if the candidate is taken, it will return 0 rows
    const ins = await pool.query(
      `INSERT INTO all_account (account_number, uid, type, name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (account_number) DO NOTHING
       RETURNING account_number, uid, type, name`,
      [candidate, uid, type, (name ?? '')]
    );

    if (ins.rows && ins.rows.length > 0) {
      issuedRow = ins.rows[0];
      // Update owner table with this account number
      if (typeof updateOwner === 'function') {
        await updateOwner(issuedRow.account_number);
      }
      break;
    }

    // Also handle rare race where (uid,type) was inserted concurrently by another call
    const nowExisting = await findExistingByUid(uid, type);
    if (nowExisting) {
      issuedRow = nowExisting;
      // Backfill owner
      if (typeof updateOwner === 'function') {
        try { await updateOwner(nowExisting.account_number); } catch (_) {}
      }
      break;
    }
  }

  if (!issuedRow) {
    throw new Error('Failed to generate a unique account number');
  }

  return issuedRow;
}

// Service helpers for internal calls
exports.ensureFounderAccount = async (uid, name = null) => {
  const result = await issueFor(
    uid,
    'founder',
    name || null,
    async (acc) => {
      await pool.query('UPDATE founders SET acc_number = $1 WHERE uid = $2', [acc, uid]);
    }
  );
  return result;
};

exports.ensureAngelAccount = async (uid, name = null) => {
  const result = await issueFor(
    uid,
    'angel investor',
    name || null,
    async (acc) => {
      await pool.query('UPDATE angel_investor SET acc_no = $1 WHERE uid = $2', [acc, uid]);
    }
  );
  return result;
};

// HTTP endpoints
exports.issueFounder = async (req, res) => {
  try {
    const { uid, name } = req.body || {};
    if (!uid) return res.status(400).json({ error: 'uid is required' });

    // Ensure founder exists (best-effort)
    try {
      const f = await pool.query('SELECT uid FROM founders WHERE uid = $1', [uid]);
      if (f.rows.length === 0) return res.status(404).json({ error: 'Founder not found' });
    } catch (_) {}

    const result = await exports.ensureFounderAccount(uid, name || null);

    return res.json({ success: true, ...result });
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || 'Failed to issue founder account number' });
  }
};

exports.issueAngel = async (req, res) => {
  try {
    const { uid, name } = req.body || {};
    if (!uid) return res.status(400).json({ error: 'uid is required' });

    // Ensure angel exists (best-effort)
    try {
      const a = await pool.query('SELECT uid FROM angel_investor WHERE uid = $1', [uid]);
      if (a.rows.length === 0) return res.status(404).json({ error: 'Angel investor not found' });
    } catch (_) {}

    const result = await exports.ensureAngelAccount(uid, name || null);

    return res.json({ success: true, ...result });
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || 'Failed to issue angel account number' });
  }
};
