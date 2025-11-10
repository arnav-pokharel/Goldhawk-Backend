const pool = require('../../db/pool');
const { generateDealStatusSummary } = require('../../utils/helpers');

exports.getStats = async (req, res) => {
  try {
    const { uid } = req.user;
    
    // Get user stats
    const userStats = await pool.query(
      `SELECT step1, kyc_validation, fund_validation, bg_check, number_verify
       FROM angel_investor 
       WHERE uid = $1`,
      [uid]
    );
    
    // Get deal stats
    const dealStats = await pool.query(
      `SELECT status, COUNT(*) as count
       FROM deal 
       WHERE investor_uid = $1
       GROUP BY status`,
      [uid]
    );
    
    // Get investment profile
    const investmentProfile = await pool.query(
      `SELECT accreditation, net_worth, annual_income, investing_exp, 
              preferred_size, preferred_range, risk, preferred_stage, 
              preferred_sector, motiv
       FROM angel_stats 
       WHERE uid = $1`,
      [uid]
    );
    
    res.json({
      userStats: userStats.rows[0] || {},
      dealStats: generateDealStatusSummary(dealStats.rows),
      investmentProfile: investmentProfile.rows[0] || {}
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error fetching dashboard stats' });
  }
};

exports.getOverview = async (req, res) => {
  try {
    const { uid } = req.user;
    
    // Get recent deals
    const recentDeals = await pool.query(
      `SELECT d.deal_id, d.startup_uid, d.status, d.created_at, d.updated_at,
              s.company_name, s.hq_address
       FROM deal d
       JOIN startup_active s ON d.startup_uid = s.uid
       WHERE d.investor_uid = $1
       ORDER BY d.updated_at DESC
       LIMIT 5`,
      [uid]
    );
    
    // Get recent messages
    const recentMessages = await pool.query(
      `SELECT id, message, sent_at
       FROM messages
       WHERE investor_uid = $1
       ORDER BY sent_at DESC
       LIMIT 5`,
      [uid]
    );
    
    res.json({
      recentDeals: recentDeals.rows,
      recentMessages: recentMessages.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error fetching dashboard overview' });
  }
};