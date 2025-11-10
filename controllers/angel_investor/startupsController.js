const pool = require('../../db/pool');

exports.getPendingDeals = async (req, res) => {
  try {
    const { uid } = req.user;
    
    const deals = await pool.query(
      `SELECT d.deal_id, d.startup_uid, d.status, d.created_at, d.updated_at,
              s.company_name, s.hq_address, s.logo
       FROM deal d
       JOIN startup_active s ON d.startup_uid = s.uid
       WHERE d.investor_uid = $1 AND d.status = 'pending'`,
      [uid]
    );
    
    res.json({ deals: deals.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error fetching pending deals' });
  }
};

exports.getPipelineDeals = async (req, res) => {
  try {
    const { uid } = req.user;
    
    const deals = await pool.query(
      `SELECT d.deal_id, d.startup_uid, d.status, d.created_at, d.updated_at,
              d.deal_no, d.action,
              s.company_name, s.hq_address, s.logo,
              s.admin_founder_profile_picture, s.admin_founder_name
       FROM deal d
       JOIN startup_active s ON d.startup_uid = s.uid
       WHERE d.investor_uid = $1 AND d.status = 'active'`,
      [uid]
    );
    
    res.json({ deals: deals.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error fetching pipeline deals' });
  }
};

exports.getPortfolioDeals = async (req, res) => {
  try {
    const { uid } = req.user;
    
    const deals = await pool.query(
      `SELECT d.deal_id, d.startup_uid, d.status, d.created_at, d.updated_at,
              s.company_name, s.hq_address, s.logo
       FROM deal d
       JOIN startup_active s ON d.startup_uid = s.uid
       WHERE d.investor_uid = $1 AND d.status = 'closed'`,
      [uid]
    );
    
    res.json({ deals: deals.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error fetching portfolio deals' });
  }
};

exports.getDealDetails = async (req, res) => {
  try {
    const { deal_id } = req.params;
    const { uid } = req.user;
    
    const deal = await pool.query(
      `SELECT d.deal_id, d.startup_uid, d.status, d.created_at, d.updated_at,
              s.company_name, s.hq_address, s.pitch1_description, s.pitch2_description,
              s.pitch3_description, s.stack_1, s.stack_2, s.stack_3, s.stack_4,
              s.pitch1_link, s.pitch2_link, s.pitch3_link, s.term_sheet, s.pitch_deck
       FROM deal d
       JOIN startup_active s ON d.startup_uid = s.uid
       WHERE d.deal_id = $1 AND d.investor_uid = $2`,
      [deal_id, uid]
    );
    
    if (deal.rows.length === 0) {
      return res.status(404).json({ error: 'Deal not found' });
    }
    
    res.json({ deal: deal.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error fetching deal details' });
  }
};

exports.getTermSheet = async (req, res) => {
  try {
    const { deal_id } = req.params;
    const { uid } = req.user;
    
    // Verify user has access to this deal
    const dealAccess = await pool.query(
      'SELECT deal_id FROM deal WHERE deal_id = $1 AND investor_uid = $2',
      [deal_id, uid]
    );
    
    if (dealAccess.rows.length === 0) {
      return res.status(404).json({ error: 'Deal not found' });
    }
    
    const termSheets = await pool.query(
      `SELECT id, deal_id, version, proposed_by, status, terms, created_at, updated_at
       FROM deal_termsheet
       WHERE deal_id = $1
       ORDER BY version DESC`,
      [deal_id]
    );
    
    res.json({ termSheets: termSheets.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error fetching term sheets' });
  }
};

exports.proposeTermSheet = async (req, res) => {
  try {
    const { deal_id } = req.params;
    const { uid } = req.user;
    const { terms } = req.body;
    
    // Verify user has access to this deal
    const dealAccess = await pool.query(
      'SELECT deal_id FROM deal WHERE deal_id = $1 AND investor_uid = $2',
      [deal_id, uid]
    );
    
    if (dealAccess.rows.length === 0) {
      return res.status(404).json({ error: 'Deal not found' });
    }
    
    // Get latest version
    const latestVersion = await pool.query(
      'SELECT COALESCE(MAX(version), 0) as max_version FROM deal_termsheet WHERE deal_id = $1',
      [deal_id]
    );
    
    const newVersion = latestVersion.rows[0].max_version + 1;
    
    // Insert new term sheet version
    const newTermSheet = await pool.query(
      `INSERT INTO deal_termsheet (deal_id, version, proposed_by, status, terms)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, deal_id, version, proposed_by, status, terms, created_at`,
      [deal_id, newVersion, 'investor', 'pending', terms]
    );
    
    res.status(201).json({ termSheet: newTermSheet.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error proposing term sheet' });
  }
};

exports.acceptTermSheet = async (req, res) => {
  try {
    const { deal_id } = req.params;
    const { uid } = req.user;
    const { term_sheet_id } = req.body;
    
    // Verify user has access to this deal
    const dealAccess = await pool.query(
      'SELECT deal_id FROM deal WHERE deal_id = $1 AND investor_uid = $2',
      [deal_id, uid]
    );
    
    if (dealAccess.rows.length === 0) {
      return res.status(404).json({ error: 'Deal not found' });
    }
    
    // Update term sheet status to accepted
    const updatedTermSheet = await pool.query(
      `UPDATE deal_termsheet 
       SET status = 'accepted', updated_at = NOW()
       WHERE id = $1 AND deal_id = $2
       RETURNING id, deal_id, version, proposed_by, status, terms, updated_at`,
      [term_sheet_id, deal_id]
    );
    
    if (updatedTermSheet.rows.length === 0) {
      return res.status(404).json({ error: 'Term sheet not found' });
    }
    
    // If both parties have accepted, update deal status
    const acceptedByBoth = await pool.query(
      `SELECT COUNT(DISTINCT proposed_by) as count
       FROM deal_termsheet
       WHERE deal_id = $1 AND status = 'accepted'`,
      [deal_id]
    );
    
    if (acceptedByBoth.rows[0].count === 2) {
      await pool.query(
        'UPDATE deal SET status = $1, updated_at = NOW() WHERE deal_id = $2',
        ['active', deal_id]
      );
    }
    
    res.json({ termSheet: updatedTermSheet.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error accepting term sheet' });
  }
};

exports.getMeetings = async (req, res) => {
  try {
    const { deal_id } = req.params;
    const { uid } = req.user;
    
    // Verify user has access to this deal
    const dealAccess = await pool.query(
      'SELECT deal_id FROM deal WHERE deal_id = $1 AND investor_uid = $2',
      [deal_id, uid]
    );
    
    if (dealAccess.rows.length === 0) {
      return res.status(404).json({ error: 'Deal not found' });
    }
    
    // In a real implementation, you would fetch meetings from a meetings table
    // For this example, we'll return a placeholder response
    res.json({ message: 'Meeting functionality to be implemented' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error fetching meetings' });
  }
};

exports.scheduleMeeting = async (req, res) => {
  try {
    const { deal_id } = req.params;
    const { uid } = req.user;
    const { meeting_time } = req.body;
    
    // Verify user has access to this deal
    const dealAccess = await pool.query(
      'SELECT deal_id FROM deal WHERE deal_id = $1 AND investor_uid = $2',
      [deal_id, uid]
    );
    
    if (dealAccess.rows.length === 0) {
      return res.status(404).json({ error: 'Deal not found' });
    }
    
    // In a real implementation, you would integrate with a calendar API
    // For this example, we'll return a placeholder response
    res.json({ message: 'Meeting scheduling to be implemented', meeting_time });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error scheduling meeting' });
  }
};

exports.getMeetingLogs = async (req, res) => {
  try {
    const { deal_id, id } = req.params;
    const { uid } = req.user;
    
    // Verify user has access to this deal
    const dealAccess = await pool.query(
      'SELECT deal_id FROM deal WHERE deal_id = $1 AND investor_uid = $2',
      [deal_id, uid]
    );
    
    if (dealAccess.rows.length === 0) {
      return res.status(404).json({ error: 'Deal not found' });
    }
    
    // Get meeting logs
    const meetingLogs = await pool.query(
      'SELECT id, deal_id, transcript, created_at FROM meeting_logs WHERE id = $1 AND deal_id = $2',
      [id, deal_id]
    );
    
    if (meetingLogs.rows.length === 0) {
      return res.status(404).json({ error: 'Meeting logs not found' });
    }
    
    res.json({ meetingLogs: meetingLogs.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error fetching meeting logs' });
  }
};

exports.getLegalDocuments = async (req, res) => {
  try {
    const { deal_id } = req.params;
    const { uid } = req.user;
    
    // Verify user has access to this deal
    const dealAccess = await pool.query(
      'SELECT deal_id FROM deal WHERE deal_id = $1 AND investor_uid = $2',
      [deal_id, uid]
    );
    
    if (dealAccess.rows.length === 0) {
      return res.status(404).json({ error: 'Deal not found' });
    }
    
    // Get legal documents
    const legalDocuments = await pool.query(
      'SELECT id, deal_id, document_type, status, signed_at, created_at FROM legals WHERE deal_id = $1',
      [deal_id]
    );
    
    res.json({ legalDocuments: legalDocuments.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error fetching legal documents' });
  }
};

exports.signLegalDocument = async (req, res) => {
  try {
    const { deal_id } = req.params;
    const { uid } = req.user;
    const { document_id } = req.body;
    
    // Verify user has access to this deal
    const dealAccess = await pool.query(
      'SELECT deal_id FROM deal WHERE deal_id = $1 AND investor_uid = $2',
      [deal_id, uid]
    );
    
    if (dealAccess.rows.length === 0) {
      return res.status(404).json({ error: 'Deal not found' });
    }
    
    // Update document status to signed
    const updatedDocument = await pool.query(
      `UPDATE legals 
       SET status = 'signed', signed_at = NOW()
       WHERE id = $1 AND deal_id = $2
       RETURNING id, deal_id, document_type, status, signed_at, created_at`,
      [document_id, deal_id]
    );
    
    if (updatedDocument.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    res.json({ document: updatedDocument.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error signing document' });
  }
};

exports.getChatMessages = async (req, res) => {
  try {
    const { deal_id } = req.params;
    const { uid } = req.user;
    
    // Verify user has access to this deal
    const dealAccess = await pool.query(
      'SELECT deal_id, startup_uid FROM deal WHERE deal_id = $1 AND investor_uid = $2',
      [deal_id, uid]
    );
    
    if (dealAccess.rows.length === 0) {
      return res.status(404).json({ error: 'Deal not found' });
    }
    
    const startup_uid = dealAccess.rows[0].startup_uid;
    
    // Get chat messages
    const messages = await pool.query(
      `SELECT id, investor_uid, startup_uid, message, sent_at
       FROM chat
       WHERE (investor_uid = $1 AND startup_uid = $2)
       ORDER BY sent_at ASC`,
      [uid, startup_uid]
    );
    
    res.json({ messages: messages.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error fetching chat messages' });
  }
};

exports.sendChatMessage = async (req, res) => {
  try {
    const { deal_id } = req.params;
    const { uid } = req.user;
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // Verify user has access to this deal
    const dealAccess = await pool.query(
      'SELECT deal_id, startup_uid FROM deal WHERE deal_id = $1 AND investor_uid = $2',
      [deal_id, uid]
    );
    
    if (dealAccess.rows.length === 0) {
      return res.status(404).json({ error: 'Deal not found' });
    }
    
    const startup_uid = dealAccess.rows[0].startup_uid;
    
    // Insert chat message
    const newMessage = await pool.query(
      `INSERT INTO chat (investor_uid, startup_uid, message)
       VALUES ($1, $2, $3)
       RETURNING id, investor_uid, startup_uid, message, sent_at`,
      [uid, startup_uid, message]
    );
    
    res.status(201).json({ message: newMessage.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error sending message' });
  }
};

exports.makeInvestment = async (req, res) => {
  try {
    const { deal_id } = req.params;
    const { uid } = req.user;
    const { amount } = req.body;
    
    // Verify user has access to this deal and it's in the correct status
    const dealAccess = await pool.query(
      `SELECT deal_id, startup_uid, status 
       FROM deal 
       WHERE deal_id = $1 AND investor_uid = $2 AND status = 'active'`,
      [deal_id, uid]
    );
    
    if (dealAccess.rows.length === 0) {
      return res.status(404).json({ error: 'Deal not found or not active' });
    }
    
    // Check if all legal documents are signed
    const unsignedDocuments = await pool.query(
      `SELECT COUNT(*) as count
       FROM legals
       WHERE deal_id = $1 AND status != 'signed'`,
      [deal_id]
    );
    
    if (unsignedDocuments.rows[0].count > 0) {
      return res.status(400).json({ error: 'Not all documents are signed' });
    }
    
    // Check if user has sufficient funds
    const fundStatus = await pool.query(
      'SELECT fund_amount FROM angel_funds WHERE uid = $1',
      [uid]
    );
    
    if (fundStatus.rows.length === 0 || !fundStatus.rows[0].fund_amount) {
      return res.status(400).json({ error: 'Funds not verified' });
    }
    
    // Here we would integrate with your payment gateway
    // This is a placeholder for the payment processing logic
    
    // Update deal status to closed
    await pool.query(
      'UPDATE deal SET status = $1, updated_at = NOW() WHERE deal_id = $2',
      ['closed', deal_id]
    );
    
    res.json({ message: 'Investment successful', deal_id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error processing investment' });
  }
};
