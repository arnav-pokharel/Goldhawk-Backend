const pool = require("../../../db/pool");

exports.getUnread = async (req, res) => {
  try {
    const { uid } = req.params;
    if (!uid) return res.status(400).json({ error: 'uid required' });
    await pool.query('ALTER TABLE founders ADD COLUMN IF NOT EXISTS venture_req_unread INTEGER DEFAULT 0');
    const q = await pool.query('SELECT COALESCE(venture_req_unread,0) AS unread FROM founders WHERE uid = $1', [uid]);
    const unread = Number(q.rows[0]?.unread || 0);
    return res.json({ unread });
  } catch (e) {
    console.error('getUnread error:', e);
    return res.status(500).json({ error: 'Failed to load unread count' });
  }
};

exports.markRead = async (req, res) => {
  try {
    const { uid } = req.params;
    if (!uid) return res.status(400).json({ error: 'uid required' });
    await pool.query('ALTER TABLE founders ADD COLUMN IF NOT EXISTS venture_req_unread INTEGER DEFAULT 0');
    await pool.query('UPDATE founders SET venture_req_unread = 0, updated_at = NOW() WHERE uid = $1', [uid]);
    return res.json({ success: true });
  } catch (e) {
    console.error('markRead error:', e);
    return res.status(500).json({ error: 'Failed to mark as read' });
  }
};

