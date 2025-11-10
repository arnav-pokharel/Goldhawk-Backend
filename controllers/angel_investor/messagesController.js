const pool = require('../../db/pool');

exports.getSupportMessages = async (req, res) => {
  try {
    const { uid } = req.user;
    
    const messages = await pool.query(
      'SELECT id, message, sent_at FROM messages WHERE investor_uid = $1 ORDER BY sent_at DESC',
      [uid]
    );
    
    res.json({ messages: messages.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error fetching support messages' });
  }
};

exports.sendSupportMessage = async (req, res) => {
  try {
    const { uid } = req.user;
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    const newMessage = await pool.query(
      'INSERT INTO messages (investor_uid, message) VALUES ($1, $2) RETURNING id, message, sent_at',
      [uid, message]
    );
    
    res.status(201).json({ message: newMessage.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error sending support message' });
  }
};