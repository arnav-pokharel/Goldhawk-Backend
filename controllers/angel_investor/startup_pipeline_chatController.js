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

async function resolveDealForInvestorAndStartup(investorUid, startupUid) {
  const q = await pool.query(
    `SELECT deal_id, deal_no FROM deal WHERE investor_uid = $1 AND startup_uid = $2 AND status IN ('active','accepted','Active') LIMIT 1`,
    [investorUid, startupUid]
  );
  return q.rows[0] || null;
}

exports.getChat = async (req, res) => {
  try {
    const { uid: investorUid } = req.user || {};
    const { uid } = req.params; // startup uid
    if (!investorUid || !uid) return res.status(400).json({ error: 'uid required' });
    await ensureChatTable();
    const deal = await resolveDealForInvestorAndStartup(investorUid, uid);
    if (!deal) return res.status(404).json({ error: 'Deal not found' });
    const rows = await pool.query(`SELECT id, deal_id, sender_uid, sender_name, message, attachment_url, read, created_at FROM chat WHERE deal_id = $1 ORDER BY created_at ASC`, [deal.deal_id]);
    return res.json({ deal_id: deal.deal_id, deal_no: deal.deal_no || null, messages: rows.rows });
  } catch (e) {
    console.error('getChat error:', e);
    return res.status(500).json({ error: 'Failed to load chat' });
  }
};

exports.postMessage = async (req, res) => {
  try {
    const { uid: investorUid } = req.user || {};
    const { uid } = req.params; // startup uid
    const { message, attachment_base64, attachment_mime } = req.body || {};
    if (!investorUid || !uid) return res.status(400).json({ error: 'uid required' });
    await ensureChatTable();
    const deal = await resolveDealForInvestorAndStartup(investorUid, uid);
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    let attachmentUrl = null;
    if (attachment_base64 && typeof attachment_base64 === 'string') {
      const buffer = Buffer.from(attachment_base64, 'base64');
      const key = `deal/${deal.deal_id}/chat/${Date.now()}-${Math.floor(Math.random()*1e6)}`;
      const cmd = new PutObjectCommand({ Bucket: process.env.S3_BUCKET_NAME, Key: key, Body: buffer, ContentType: attachment_mime || 'application/octet-stream' });
      await s3Client.send(cmd);
      const region = process.env.AWS_REGION;
      const bucket = process.env.S3_BUCKET_NAME;
      const encodedKey = key.split('/').map(encodeURIComponent).join('/');
      attachmentUrl = region ? `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}` : `https://${bucket}.s3.amazonaws.com/${encodedKey}`;
    }

    const angelNameQ = await pool.query('SELECT angel_name FROM angel_investor WHERE uid = $1', [investorUid]);
    const senderName = angelNameQ.rows[0]?.angel_name || null;

    const ins = await pool.query(
      `INSERT INTO chat (deal_id, sender_uid, sender_name, message, attachment_url, read)
       VALUES ($1, $2, $3, $4, $5, false)
       RETURNING id, deal_id, sender_uid, sender_name, message, attachment_url, read, created_at`,
      [deal.deal_id, investorUid, senderName, message || null, attachmentUrl]
    );
    const newMsg = ins.rows[0];

    // Broadcast to room for this deal
    try {
      const io = getIO();
      if (io) {
        // to deal room
        io.to(`chat:deal:${deal.deal_id}`).emit("chat:new", { message: newMsg, startup_uid: uid, investor_uid: investorUid });
        // to founder user room for global notifications
        io.to(`chat:user:${uid}`).emit("chat:new", { message: newMsg, startup_uid: uid, investor_uid: investorUid });
      }
    } catch (_) {}

    return res.status(201).json({ message: newMsg });
  } catch (e) {
    console.error('postMessage error:', e);
    return res.status(500).json({ error: 'Failed to send message' });
  }
};

// Mark messages from the opposite party as read when investor opens chat
exports.markRead = async (req, res) => {
  try {
    const { uid: investorUid } = req.user || {};
    const { uid } = req.params; // startup uid
    if (!investorUid || !uid) return res.status(400).json({ error: 'uid required' });
    const deal = await resolveDealForInvestorAndStartup(investorUid, uid);
    if (!deal) return res.status(404).json({ error: 'Deal not found' });
    await ensureChatTable();
    await pool.query(`UPDATE chat SET read = true WHERE deal_id = $1 AND sender_uid <> $2 AND read = false`, [deal.deal_id, investorUid]);
    try {
      const { getIO } = require("../../services/socket");
      const io = getIO();
      if (io) {
        io.to(`chat:user:${investorUid}`).emit('chat:read', { deal_id: deal.deal_id, by: investorUid });
      }
    } catch (_) {}
    return res.json({ success: true });
  } catch (e) {
    console.error('markRead (investor) error:', e);
    return res.status(500).json({ error: 'Failed to mark read' });
  }
};

// Return unread summary for investor across all deals: a deal is unread if
// the latest message is from the opposite party and read=false
exports.getUnreadSummary = async (req, res) => {
  try {
    const { uid: investorUid } = req.user || {};
    if (!investorUid) return res.status(400).json({ error: 'uid required' });

    const rows = await pool.query(
      `SELECT DISTINCT ON (c.deal_id)
         c.deal_id,
         c.read,
         c.sender_uid,
         c.created_at
       FROM chat c
       JOIN deal d ON d.deal_id = c.deal_id
      WHERE d.investor_uid = $1
      ORDER BY c.deal_id, c.created_at DESC`,
      [investorUid]
    );

    const unread = [];
    for (const r of rows.rows) {
      const isUnread = String(r.sender_uid) !== String(investorUid) && r.read === false;
      if (isUnread) unread.push(String(r.deal_id));
    }
    return res.json({ unread });
  } catch (e) {
    console.error('getUnreadSummary error:', e);
    return res.status(500).json({ error: 'Failed to load unread summary' });
  }
};
