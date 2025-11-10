const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require("../../../db/pool");

// Login for General Partners
const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email and password required'
    });
  }

  try {
    const result = await pool.query(
      `SELECT p.*, f.firm_name, f.uid as firm_uid 
       FROM vc_partners p 
       LEFT JOIN vc_firms f ON p.firm_uid::text = f.id::text 
       WHERE p.email = $1 AND p.status = 'active'`,
      [email]
    );

    const partner = result.rows[0];

    if (!partner || !partner.password) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const isPasswordValid = await bcrypt.compare(password, partner.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Update last login if column exists
    try {
      await pool.query(
        `UPDATE vc_partners SET "updatedAt" = NOW() WHERE id = $1`,
        [partner.id]
      );
    } catch (updateError) {
      console.log('Could not update partner record:', updateError.message);
    }

    // Generate token
    const token = jwt.sign(
      { 
        partnerId: partner.id, 
        uid: partner.partner_uid, 
        firmId: partner.firm_uid, 
        role: 'general_partner',
        email: partner.email
      }, 
      process.env.JWT_SECRET, 
      { expiresIn: '7d' }
    );


    res.status(200).json({
      success: true,
      message: 'Login successful',
      token: token,
      redirectTo: '/investor/vc_firm/general_partner/dashboard',
      partner: {
        id: partner.id,
        partner_uid: partner.partner_uid,
        email: partner.email,
        full_name: partner.full_name,
        role: partner.role,
        firm_name: partner.firm_name,
        firm_uid: partner.firm_uid
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error: ' + error.message
    });
  }
};

// Check Session
const checkSession = (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'No token provided'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.role !== 'general_partner') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token role'
      });
    }
    
    return res.json({
      success: true,
      partner: {
        partnerId: decoded.partnerId,
        uid: decoded.uid,
        firmId: decoded.firmId,
        email: decoded.email,
        role: decoded.role
      }
    });
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
};

// Logout
const logout = (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
};

module.exports = {
  login,
  checkSession,
  logout
};