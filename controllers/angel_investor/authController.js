const bcrypt = require('bcrypt');
const pool = require("../../db/pool");
const { generateOTP, generateJWT } = require('../../utils/helpers');
const { sendOTPEmail } = require('../../utils/emailService');
const { setCloudFrontCookies } = require('../../utils/cloudfront');
const {
  setSessionCookie,
  setUidCookie,
  clearSessionCookies,
  clearUidCookies,
} = require('../../utils/cookies');

function setSessionCookies(res, uid, token) {
  setSessionCookie(res, token);
  setUidCookie(res, uid);
}


exports.signup = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Check if user exists
    const userExists = await pool.query(
      'SELECT uid FROM angel_investor WHERE email = $1',
      [email]
    );
    
    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    // Generate OTP
    const otp = generateOTP();
    
    // Create user
    const newUser = await pool.query(
      `INSERT INTO angel_investor (email, password, otp) 
       VALUES ($1, $2, $3) RETURNING uid, email, created_at`,
      [email, hashedPassword, otp]
    );
     console.log("OTP for signup=======>:", otp); // For testing purposes only, remove in production
    // Send OTP to email
    try {
      await sendOTPEmail(email, otp);
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
    }
    
    res.status(201).json({
      message: 'User created successfully. Please verify your email.',
      user: newUser.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error during signup' });
  }
};

exports.verifyEmail = async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    const user = await pool.query(
      'SELECT uid, otp FROM angel_investor WHERE email = $1',
      [email]
    );
    
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (user.rows[0].otp !== otp) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }
    
    // Update user as verified
    await pool.query(
      'UPDATE angel_investor SET is_verified = true, otp = null WHERE email = $1',
      [email]
    );
    
    // Issue or ensure an account number for this angel investor (non-blocking)
    try {
      const { ensureAngelAccount } = require('../account_numberController');
      await ensureAngelAccount(user.rows[0].uid, null);
    } catch (e) {
      console.warn('Account number issuance (angel) failed or deferred:', e?.message || e);
    }

    // Generate JWT token
    const token = generateJWT(user.rows[0].uid);

    setSessionCookies(res, user.rows[0].uid, token);

    res.json({
      message: 'Email verified successfully',
      token,
      uid: user.rows[0].uid
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error during email verification' });
  }
};

exports.resendOTP = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    const user = await pool.query(
      'SELECT uid, is_verified FROM angel_investor WHERE email = $1',
      [email]
    );
    
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (user.rows[0].is_verified) {
      return res.status(400).json({ error: 'Email is already verified' });
    }
    
    // Generate new OTP
    const otp = generateOTP();
    
    // Update OTP in database
    await pool.query(
      'UPDATE angel_investor SET otp = $1 WHERE email = $2',
      [otp, email]
    );
    console.log("OTP for resend=======>:", otp); // For testing purposes only, remove in production
    // Send OTP to email
    try {
      await sendOTPEmail(email, otp);
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      return res.status(500).json({ error: 'Failed to send OTP email' });
    }
    
    res.json({ message: 'OTP sent successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error during OTP resend' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const user = await pool.query(
      'SELECT uid, email, password, is_verified FROM angel_investor WHERE email = $1',
      [email]
    );
    
    if (user.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    if (!user.rows[0].is_verified) {
      return res.status(403).json({ error: 'Email not verified' });
    }
    
    const isValidPassword = await bcrypt.compare(password, user.rows[0].password);
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate JWT token
    const token = generateJWT(user.rows[0].uid);

    setSessionCookies(res, user.rows[0].uid, token);

    res.json({
      message: 'Login successful',
      token,
      uid: user.rows[0].uid
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error during login' });
  }
};

exports.logout = async (req, res) => {
  clearSessionCookies(res);
  clearUidCookies(res);
  res.json({ message: 'Logout successful' });
};

exports.forgotPassword = async (req, res) => {
  // Implementation for forgot password
  res.status(501).json({ error: 'Not implemented yet' });
};

exports.resetPassword = async (req, res) => {
  // Implementation for reset password
  res.status(501).json({ error: 'Not implemented yet' });
};











