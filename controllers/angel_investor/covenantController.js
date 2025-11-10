const pool = require('../../db/pool');

exports.getStatus = async (req, res) => {
  try {
    const { uid } = req.user;
    
    const status = await pool.query(
      `SELECT step1, kyc_validation, fund_validation, bg_check, number_verify
       FROM angel_investor 
       WHERE uid = $1`,
      [uid]
    );
    
    res.json({ status: status.rows[0] || {} });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error fetching covenant status' });
  }
};

exports.submitKYC = async (req, res) => {
  try {
    const { uid } = req.user;
    // In a real implementation, we would handle KYC document upload and processing
    // For this example we'll just mark KYC as validated
    
    await pool.query(
      'UPDATE angel_investor SET kyc_validation = true, updated_at = NOW() WHERE uid = $1',
      [uid]
    );
    
    res.json({ message: 'KYC submitted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error submitting KYC' });
  }
};

exports.linkPlaid = async (req, res) => {
  try {
    const { uid } = req.user;
    // In a real implementation, we would integrate with Plaid API
    // For this example we'll just mark fund validation as true
    
    await pool.query(
      'UPDATE angel_investor SET fund_validation = true, updated_at = NOW() WHERE uid = $1',
      [uid]
    );
    
    // Also update angel_funds table
    await pool.query(
      'INSERT INTO angel_funds (uid, fund_amount, checked_at) VALUES ($1, $2, $3)',
      [uid, true, new Date().toISOString()]
    );
    
    res.json({ message: 'Plaid linked successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error linking Plaid' });
  }
};

exports.getFundStatus = async (req, res) => {
  try {
    const { uid } = req.user;
    
    const fundStatus = await pool.query(
      'SELECT fund_amount, checked_at FROM angel_funds WHERE uid = $1',
      [uid]
    );
    
    res.json({ fundStatus: fundStatus.rows[0] || {} });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error fetching fund status' });
  }
};

exports.saveInvestmentProfile = async (req, res) => {
  try {
    const { uid } = req.user;
    const {
      accreditation, net_worth, annual_income, investing_exp,
      preferred_size, preferred_range, risk, preferred_stage,
      preferred_sector, motiv
    } = req.body;
    
    // Check if investment profile already exists
    const existingProfile = await pool.query(
      'SELECT uid FROM angel_stats WHERE uid = $1',
      [uid]
    );
    
    if (existingProfile.rows.length > 0) {
      // Update existing profile
      await pool.query(
        `UPDATE angel_stats 
         SET accreditation = $1, net_worth = $2, annual_income = $3, investing_exp = $4,
             preferred_size = $5, preferred_range = $6, risk = $7, preferred_stage = $8,
             preferred_sector = $9, motiv = $10
         WHERE uid = $11`,
        [accreditation, net_worth, annual_income, investing_exp, 
         preferred_size, preferred_range, risk, preferred_stage,
         preferred_sector, motiv, uid]
      );
    } else {
      // Insert new profile
      await pool.query(
        `INSERT INTO angel_stats 
         (uid, accreditation, net_worth, annual_income, investing_exp,
          preferred_size, preferred_range, risk, preferred_stage,
          preferred_sector, motiv)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [uid, accreditation, net_worth, annual_income, investing_exp,
         preferred_size, preferred_range, risk, preferred_stage,
         preferred_sector, motiv]
      );
    }
    
    res.json({ message: 'Investment profile saved successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error saving investment profile' });
  }
};

exports.getInvestmentProfile = async (req, res) => {
  try {
    const { uid } = req.user;
    
    const investmentProfile = await pool.query(
      `SELECT accreditation, net_worth, annual_income, investing_exp,
              preferred_size, preferred_range, risk, preferred_stage,
              preferred_sector, motiv
       FROM angel_stats 
       WHERE uid = $1`,
      [uid]
    );
    
    res.json({ investmentProfile: investmentProfile.rows[0] || {} });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error fetching investment profile' });
  }
};