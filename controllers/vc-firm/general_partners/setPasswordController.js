const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require("../../../db/pool");

// Set Password for Invited Partner
const setPassword = async (req, res) => {
  const { token, password, confirmPassword } = req.body;

  if (!token || !password || !confirmPassword) {
    return res.status(400).json({
      success: false,
      message: 'Token, password and confirmation are required'
    });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({
      success: false,
      message: 'Passwords do not match'
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 6 characters long'
    });
  }

  try {
    // Verify the invitation token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.role !== 'partner_invitation') {
      return res.status(400).json({
        success: false,
        message: 'Invalid invitation token'
      });
    }

    const { partnerId, email, firmUid } = decoded;

    // Check if partner exists and is pending
    const partnerResult = await pool.query(
      `SELECT * FROM vc_partners WHERE id = $1 AND email = $2 AND status = 'pending'`,
      [partnerId, email]
    );

    if (partnerResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Partner invitation not found or already accepted'
      });
    }

    const partner = partnerResult.rows[0];

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Update partner with password and activate account
    await pool.query(
      `UPDATE vc_partners 
       SET password = $1, status = 'active', "updatedAt" = NOW()
       WHERE id = $2`,
      [hashedPassword, partnerId]
    );


    // Generate login token
    const loginToken = jwt.sign(
      { 
        partnerId: partner.id, 
        uid: partner.partner_uid, 
        firmId: firmUid, 
        role: 'general_partner',
        email: partner.email
      }, 
      process.env.JWT_SECRET, 
      { expiresIn: '7d' }
    );

    res.status(200).json({
      success: true,
      message: 'Password set successfully. Account activated.',
      token: loginToken,
      redirectTo: '/investor/vc_firm/general_partner/dashboard',
      partner: {
        id: partner.id,
        uid: partner.partner_uid,
        email: partner.email,
        full_name: partner.full_name,
        role: partner.role,
        status: 'active'
      }
    });

  } catch (error) {
    console.error('Set password error:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired invitation link'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(400).json({
        success: false,
        message: 'Invitation link has expired'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Internal server error: ' + error.message
    });
  }
};

// Verify Token (for frontend to check if token is valid)
const verifyToken = async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({
      success: false,
      message: 'Token is required'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.role !== 'partner_invitation') {
      return res.status(400).json({
        success: false,
        message: 'Invalid invitation token'
      });
    }

    const { partnerId, email, firmUid } = decoded;

    // Check if partner exists and is still pending
    const partnerResult = await pool.query(
      `SELECT id, partner_uid, email, full_name, role, status 
       FROM vc_partners 
       WHERE id = $1 AND email = $2 AND status = 'pending'`,
      [partnerId, email]
    );

    if (partnerResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Partner invitation not found or already accepted'
      });
    }

    const partner = partnerResult.rows[0];

    res.status(200).json({
      success: true,
      message: 'Token is valid',
      partner: {
        id: partner.id,
        uid: partner.partner_uid,
        email: partner.email,
        full_name: partner.full_name,
        role: partner.role
      },
      firm_uid: firmUid
    });

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid invitation link'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(400).json({
        success: false,
        message: 'Invitation link has expired'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Internal server error: ' + error.message
    });
  }
};

module.exports = {
  setPassword,
  verifyToken
};