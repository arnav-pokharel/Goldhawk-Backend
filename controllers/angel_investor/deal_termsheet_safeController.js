const { v4: uuidv4 } = require('uuid');
const pool = require('../../db/pool');
const transporter = require('../../utils/mailer');
const { APP_NAME, NO_REPLY_EMAIL } = require('../../utils/appConfig');

async function fetchStartupSafe(uid) {
  const q = await pool.query('SELECT termsheet_safe FROM startup_active WHERE uid = $1', [uid]);
  const row = q.rows[0];
  if (!row || !row.termsheet_safe) return null;
  if (typeof row.termsheet_safe === 'string') {
    try { return JSON.parse(row.termsheet_safe); } catch (_) { return null; }
  }
  return row.termsheet_safe;
}

async function nextVersionForStartup(startupUid) {
  const q = await pool.query(
    `SELECT COALESCE(MAX(dt.version), 0) AS max_version
     FROM deal_termsheet dt
     JOIN deal d ON d.deal_id = dt.deal_id
     WHERE d.startup_uid = $1`,
    [startupUid]
  );
  return Number(q.rows[0]?.max_version || 0) + 1;
}

async function insertDealAndTermsheet({ dealId, docId, investorUid, startupUid, version, proposedBy, type, safeJson, status = 'active', invType = 'ang' }) {
  // Use a transaction and insert the parent deal first to satisfy FK constraints
  await pool.query('BEGIN');
  try {
    // Insert deal row with tolerant enum handling for status
    const tryInsertDeal = async (statusValue) => {
      try {
        await pool.query(
          `INSERT INTO deal (deal_id, doc_id, investor_uid, startup_uid, status, created_at, updated_at, inv_type)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), $6)`,
          [dealId, docId, investorUid, startupUid, statusValue, invType]
        );
        return true;
      } catch (e) {
        const msg = e?.message || '';
        // If inv_type is missing, retry without it
        if (msg.includes('column') && msg.includes('inv_type')) {
          await pool.query(
            `INSERT INTO deal (deal_id, doc_id, investor_uid, startup_uid, status, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
            [dealId, docId, investorUid, startupUid, statusValue]
          );
          return true;
        }
        throw e;
      }
    };

    // Force initial status strictly to 'pending' (no other variants)
    await tryInsertDeal('pending');

    // Insert termsheet record for SAFE, fallback to legacy 'terms' column if needed
    try {
      await pool.query(
        `INSERT INTO deal_termsheet (deal_id, version, proposed_by, status, type, safe, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
        [dealId, version, proposedBy, status, type, JSON.stringify(safeJson || {})]
      );
    } catch (e) {
      const msg = e?.message || '';
      if (msg.includes('column') && msg.match(/type|safe/)) {
        // Fallback to legacy 'terms' JSON column
        await pool.query(
          `INSERT INTO deal_termsheet (deal_id, version, proposed_by, status, terms, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
          [dealId, version, proposedBy, status, JSON.stringify({ type, safe: safeJson || {} })]
        );
      } else {
        throw e;
      }
    }

    await pool.query('COMMIT');
  } catch (e) {
    await pool.query('ROLLBACK');
    throw e;
  }
}

// POST /angel/termsheet/safe/:uid/offer
// Body: { safe_total_authorized?, post_money_valuation?, discount_rate? }
exports.offer = async (req, res) => {
  try {
    const investor = req.user; // set by authenticateToken
    const startupUid = req.params.uid;
    if (!investor?.uid) return res.status(401).json({ error: 'Unauthorized' });

    // Load current SAFE JSON from startup_active
    const base = await fetchStartupSafe(startupUid);
    if (!base) return res.status(404).json({ error: 'No SAFE term sheet found for this startup' });

    const edits = req.body || {};
    const merged = { ...base };
    ['safe_total_authorized', 'post_money_valuation', 'discount_rate'].forEach((k) => {
      if (edits[k] !== undefined) merged[k] = edits[k];
    });

    const dealId = uuidv4();
    const docId = uuidv4();
    const version = await nextVersionForStartup(startupUid);
    await insertDealAndTermsheet({
      dealId,
      docId,
      investorUid: investor.uid,
      startupUid,
      version,
      proposedBy: 'investor', // align with existing semantics
      type: 'SAFE',
      safeJson: merged,
      status: 'active',
      invType: 'ang',
    });

    return res.status(201).json({ success: true, deal_id: dealId, version });
  } catch (e) {
    console.error('SAFE offer error:', e);
    return res.status(500).json({ error: 'Failed to create offer', detail: e?.message || String(e) });
  }
};

// POST /angel/termsheet/safe/:uid/accept
// Accept the startup's original SAFE JSON without edits
exports.accept = async (req, res) => {
  try {
    const investor = req.user; // set by authenticateToken
    const startupUid = req.params.uid;
    if (!investor?.uid) return res.status(401).json({ error: 'Unauthorized' });

    const base = await fetchStartupSafe(startupUid);
    if (!base) return res.status(404).json({ error: 'No SAFE term sheet found for this startup' });

    const dealId = uuidv4();
    const docId = uuidv4();
    const version = await nextVersionForStartup(startupUid);
    await insertDealAndTermsheet({
      dealId,
      docId,
      investorUid: investor.uid,
      startupUid,
      version,
      proposedBy: 'founder', // align with existing semantics
      type: 'SAFE',
      safeJson: base,
      status: 'active',
      invType: 'ang',
    });

    return res.status(201).json({ success: true, deal_id: dealId, version });
  } catch (e) {
    console.error('SAFE accept error:', e);
    return res.status(500).json({ error: 'Failed to accept term sheet', detail: e?.message || String(e) });
  }
};

// POST /angel/termsheet/safe/:uid/ping
// Body: { note: string }
// Creates a deal + termsheet using current SAFE JSON, sets both to pending, and saves note into deal.chat (if column exists)
exports.ping = async (req, res) => {
  try {
    const investor = req.user; // set by authenticateToken
    const startupUid = req.params.uid;
    const note = (req.body && req.body.note) ? String(req.body.note) : '';
    if (!investor?.uid) return res.status(401).json({ error: 'Unauthorized' });

    const base = await fetchStartupSafe(startupUid);
    if (!base) return res.status(404).json({ error: 'No SAFE term sheet found for this startup' });

    const dealId = uuidv4();
    const docId = uuidv4();
    const version = await nextVersionForStartup(startupUid);

    // Insert parent deal and pending termsheet
    await insertDealAndTermsheet({
      dealId,
      docId,
      investorUid: investor.uid,
      startupUid,
      version,
      proposedBy: 'investor',
      type: 'SAFE',
      safeJson: base,
      status: 'pending',
      invType: 'ang',
    });

    // Best-effort: persist note into deal.chat (if column exists or can be added)
    try {
      // Try to update directly; if missing column, add it and retry once
      try {
        await pool.query('UPDATE deal SET chat = $2, updated_at = NOW() WHERE deal_id = $1', [dealId, note || null]);
      } catch (e) {
        const msg = e?.message || '';
        if (e && (e.code === '42703' || msg.includes('column') && msg.includes('chat'))) {
          // Add column and retry
          try { await pool.query('ALTER TABLE deal ADD COLUMN IF NOT EXISTS chat TEXT'); } catch (_) {}
          await pool.query('UPDATE deal SET chat = $2, updated_at = NOW() WHERE deal_id = $1', [dealId, note || null]);
        } else {
          throw e;
        }
      }
    } catch (e) {
      // Non-fatal; proceed without note if schema prevents it
      console.warn('Deal chat note persistence skipped:', e?.message || e);
    }

    // Increment founder unread venture requests counter (best-effort)
    try {
      await pool.query('ALTER TABLE founders ADD COLUMN IF NOT EXISTS venture_req_unread INTEGER DEFAULT 0');
      await pool.query('UPDATE founders SET venture_req_unread = COALESCE(venture_req_unread,0) + 1, updated_at = NOW() WHERE uid = $1', [startupUid]);
    } catch (e) {
      console.warn('venture_req_unread update skipped:', e?.message || e);
    }

    // Send notification email to founder email
    try {
      const f = await pool.query('SELECT email FROM founders WHERE uid = $1', [startupUid]);
      const email = f.rows[0]?.email || null;
      const c = await pool.query('SELECT company_name FROM founder_step2 WHERE uid = $1', [startupUid]);
      const company = c.rows[0]?.company_name || 'your company';
      if (email && transporter) {
        const fromAddress = process.env.SMTP_FROM || NO_REPLY_EMAIL;
        await transporter.sendMail({
          to: email,
          from: fromAddress,
          subject: `An investor wants to reach you on ${APP_NAME}`,
          text: `Hey ${company}, an investor wants to reach you, hooraah!\n\nMessage: ${note || '(no note)'}\n\nLog in to review the request in Ventures > Requests.`,
          html: `<p>Hey <strong>${company}</strong>, an investor wants to reach you, hooraah!</p><p><em>Message:</em> ${note ? String(note).replace(/</g,'&lt;').replace(/>/g,'&gt;') : '(no note)'} </p><p>Log in to review the request in <strong>Ventures &gt; Requests</strong>.</p>`,
        });
      }
    } catch (e) {
      console.warn('Ping email send skipped:', e?.message || e);
    }

    return res.status(201).json({ success: true, deal_id: dealId, version });
  } catch (e) {
    console.error('SAFE ping error:', e);
    return res.status(500).json({ error: 'Failed to ping startup', detail: e?.message || String(e) });
  }
};
