const pool = require("../../db/pool");
const { s3Client } = require("../../services/s3");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const { getIO } = require("../../services/socket");

async function ensureChatTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat (
      id SERIAL PRIMARY KEY,
      deal_id TEXT NOT NULL,
      sender_uid TEXT NOT NULL,
      sender_name TEXT,
      message TEXT,
      attachment_url TEXT,
      read BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function resolveDealForInvestor(investorUid) {
  const q = await pool.query(
    `SELECT d.deal_id, d.deal_no, d.startup_uid, ai.angel_name, ai.profile_picture,
            s.company_name, s.logo
       FROM deal d
       LEFT JOIN angel_investor ai ON ai.uid = d.investor_uid
       LEFT JOIN startup_active s ON s.uid = d.startup_uid
      WHERE d.investor_uid = $1 AND d.status IN ('active','accepted','Active')
      ORDER BY d.updated_at DESC NULLS LAST, d.created_at DESC NULLS LAST
      LIMIT 1`,
    [investorUid]
  );
  return q.rows[0] || null;
}

exports.getChat = async (req, res) => {
  try {
    const { investorUid } = req.params;
    const explicitDealId = req.query.deal_id ? String(req.query.deal_id) : null;
    await ensureChatTable();
    let dealRow = null;
    if (explicitDealId) {
      const q = await pool.query(`SELECT deal_id, deal_no, startup_uid FROM deal WHERE deal_id::text = $1::text`, [explicitDealId]);
      dealRow = q.rows[0] || null;
    } else {
      dealRow = await resolveDealForInvestor(investorUid);
    }
    if (!dealRow) return res.status(404).json({ error: 'Deal not found' });
    const msgs = await pool.query(`SELECT id, deal_id, sender_uid, sender_name, message, attachment_url, read, created_at FROM chat WHERE deal_id = $1 ORDER BY created_at ASC`, [dealRow.deal_id]);
    // Include header info for UI (angel + company)
    const header = await pool.query(
      `SELECT ai.angel_name, ai.profile_picture, s.company_name, s.logo, d.startup_uid
         FROM deal d
         LEFT JOIN angel_investor ai ON ai.uid = d.investor_uid
         LEFT JOIN startup_active s ON s.uid = d.startup_uid
        WHERE d.deal_id = $1`,
      [dealRow.deal_id]
    );
    return res.json({
      deal_id: dealRow.deal_id,
      deal_no: dealRow.deal_no || null,
      startup_uid: header.rows[0]?.startup_uid || dealRow.startup_uid,
      header: header.rows[0] || null,
      messages: msgs.rows,
    });
  } catch (e) {
    console.error('founder getChat error:', e);
    return res.status(500).json({ error: 'Failed to load chat' });
  }
};

exports.postMessage = async (req, res) => {
  try {
    const { investorUid } = req.params;
    const { message, attachment_base64, attachment_mime, deal_id } = req.body || {};
    await ensureChatTable();
    let dealRow = null;
    if (deal_id) {
      const q = await pool.query(`SELECT deal_id, startup_uid FROM deal WHERE deal_id::text = $1::text`, [String(deal_id)]);
      dealRow = q.rows[0] || null;
    } else {
      dealRow = await resolveDealForInvestor(investorUid);
    }
    if (!dealRow) return res.status(404).json({ error: 'Deal not found' });

    // Fetch founder name from startup_active
    const founderQ = await pool.query(`SELECT admin_founder_name FROM startup_active WHERE uid = $1`, [dealRow.startup_uid]);
    const senderName = founderQ.rows[0]?.admin_founder_name || null;

    let attachmentUrl = null;
    if (attachment_base64 && typeof attachment_base64 === 'string') {
      const buffer = Buffer.from(attachment_base64, 'base64');
      const key = `deal/${dealRow.deal_id}/chat/${Date.now()}-${Math.floor(Math.random()*1e6)}`;
      const cmd = new PutObjectCommand({ Bucket: process.env.S3_BUCKET_NAME, Key: key, Body: buffer, ContentType: attachment_mime || 'application/octet-stream' });
      await s3Client.send(cmd);
      const region = process.env.AWS_REGION;
      const bucket = process.env.S3_BUCKET_NAME;
      const encodedKey = key.split('/').map(encodeURIComponent).join('/');
      attachmentUrl = region ? `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}` : `https://${bucket}.s3.amazonaws.com/${encodedKey}`;
    }

    const ins = await pool.query(
      `INSERT INTO chat (deal_id, sender_uid, sender_name, message, attachment_url, read)
       VALUES ($1, $2, $3, $4, $5, false)
       RETURNING id, deal_id, sender_uid, sender_name, message, attachment_url, read, created_at`,
      [dealRow.deal_id, dealRow.startup_uid, senderName, message || null, attachmentUrl]
    );
    const newMsg = ins.rows[0];

    // Broadcast to room for this deal
    try {
      const io = getIO();
      if (io) {
        // to deal room
        io.to(`chat:deal:${dealRow.deal_id}`).emit("chat:new", { message: newMsg, startup_uid: dealRow.startup_uid, investor_uid: investorUid });
        // to investor user room for global notifications
        io.to(`chat:user:${investorUid}`).emit("chat:new", { message: newMsg, startup_uid: dealRow.startup_uid, investor_uid: investorUid });
      }
    } catch (_) {}

    return res.status(201).json({ message: newMsg });
  } catch (e) {
    console.error('founder postMessage error:', e);
    return res.status(500).json({ error: 'Failed to send message' });
  }
};

// Mark messages from the opposite party (investor) as read when founder opens chat
exports.markRead = async (req, res) => {
  try {
    const { investorUid } = req.params;
    const { deal_id } = req.body || {};
    await ensureChatTable();
    let dealRow = null;
    if (deal_id) {
      const q = await pool.query(`SELECT deal_id, startup_uid FROM deal WHERE deal_id::text = $1::text`, [String(deal_id)]);
      dealRow = q.rows[0] || null;
    } else {
      dealRow = await resolveDealForInvestor(investorUid);
    }
    if (!dealRow) return res.status(404).json({ error: 'Deal not found' });
    await pool.query(`UPDATE chat SET read = true WHERE deal_id = $1 AND sender_uid <> $2 AND read = false`, [dealRow.deal_id, dealRow.startup_uid]);
    try {
      const io = getIO();
      if (io) {
        io.to(`chat:user:${dealRow.startup_uid}`).emit('chat:read', { deal_id: dealRow.deal_id, by: dealRow.startup_uid });
      }
    } catch (_) {}
    return res.json({ success: true });
  } catch (e) {
    console.error('founder markRead error:', e);
    return res.status(500).json({ error: 'Failed to mark read' });
  }
};

// Latest message unread status for this investor's deal from founder perspective
exports.getUnreadStatus = async (req, res) => {
  try {
    const { investorUid } = req.params;
    await ensureChatTable();
    const dealRow = await resolveDealForInvestor(investorUid);
    if (!dealRow) return res.status(404).json({ error: 'Deal not found' });
    const latest = await pool.query(
      `SELECT read, sender_uid, created_at FROM chat WHERE deal_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [dealRow.deal_id]
    );
    const r = latest.rows[0];
    const unread = r ? (String(r.sender_uid) !== String(dealRow.startup_uid) && r.read === false) : false;
    return res.json({ deal_id: dealRow.deal_id, unread });
  } catch (e) {
    console.error('founder getUnreadStatus error:', e);
    return res.status(500).json({ error: 'Failed to load unread' });
  }
};

// For a founder startup uid, return list of deal_ids whose latest message
// is from the investor and read=false (i.e., unread for founder)
exports.getUnreadSummaryFounder = async (req, res) => {
  try {
    const { uid } = req.params; // founder's startup uid (same as chat sender for founder)
    if (!uid) return res.status(400).json({ error: 'uid required' });
    await ensureChatTable();

    // Get latest chat per deal for deals belonging to this startup via JOIN (avoids array binding issues)
    const rows = await pool.query(
      `SELECT DISTINCT ON (c.deal_id)
         c.deal_id, c.read, c.sender_uid, c.created_at
       FROM chat c
       JOIN deal d ON d.deal_id = c.deal_id
      WHERE d.startup_uid = $1 AND d.status IN ('active','accepted','Active')
      ORDER BY c.deal_id, c.created_at DESC`,
      [uid]
    );

    const unread = [];
    for (const r of rows.rows) {
      const isUnread = String(r.sender_uid) !== String(uid) && r.read === false;
      if (isUnread) unread.push(String(r.deal_id));
    }
    return res.json({ unread });
  } catch (e) {
    console.error('founder getUnreadSummaryFounder error:', e);
    return res.status(500).json({ error: 'Failed to load unread summary' });
  }
};
