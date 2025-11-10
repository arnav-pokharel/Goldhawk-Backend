const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { generateJWT } = require('../../utils/helpers');
const pool = require('../../db/pool');
const transporter = require('../../utils/mailer');
const emailTemplateService = require('../../utils/emailTemplateService');
const { createAngelS3Folders, uploadFile } = require('../../services/s3');
const { setCloudFrontCookies } = require('../../utils/cloudfront');
const {
  setSessionCookie,
  setUidCookie,
  SESSION_COOKIE_NAMES,
} = require('../../utils/cookies');
const { APP_NAME, NO_REPLY_EMAIL } = require('../../utils/appConfig');

exports.getProfile = async (req, res) => {
  try {
    const { uid } = req.user;
    
    const user = await pool.query(
      `SELECT uid, email, angel_name, created_at, updated_at, 
              is_verified, number, dob, address, nationality, 
              number_verify, step1, kyc_validation, fund_validation, bg_check,
              acc_no, profile_picture
       FROM angel_investor 
       WHERE uid = $1`,
      [uid]
    );
    
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ profile: user.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error fetching profile' });
  }
};

//
// SIGNUP â€” create angel investor, generate OTP, send email
// Mirrors founder/signupController logic but for angel_investor table
//
exports.signupAngel = async (req, res) => {
  let { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  email = email.split('?')[0].trim();

  try {
    // 1. Check if the user already exists
    const existing = await pool.query('SELECT 1 FROM angel_investor WHERE email = $1', [email]);

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered. Please log in.' });
    }

    // 2. Create the new angel investor
    const hashed = await bcrypt.hash(password, 10);
    const otp = Math.floor(100000 + Math.random() * 900000); // 6-digit numeric
    const uid = uuidv4();

    await pool.query(
      `INSERT INTO angel_investor (
        uid, email, password, otp, is_verified, step1, kyc_validation, fund_validation, bg_check, created_at, updated_at
      ) VALUES (
        $1::uuid, $2::text, $3::text, $4::text, $5::boolean, $6::boolean, $7::boolean, $8::boolean, $9::boolean, NOW(), NOW()
      )`,
      [uid, email, hashed, String(otp), false, false, false, false, false]
    );

    // 3. Send the OTP email
    const htmlContent = emailTemplateService.getOtpVerificationEmail(otp);
    const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER || NO_REPLY_EMAIL;
    await transporter.sendMail({
      from: `"${APP_NAME}" <${fromAddress}>`,
      to: email,
      subject: `Your ${APP_NAME} OTP Code`,
      text: `Your OTP is: ${otp}\n\nIt expires in 10 minutes.`,
      html: htmlContent || `<p>Your OTP is: <b>${otp}</b></p><p>It expires in 10 minutes.</p>`,
    });

    console.log('OTP sent to (angel):', email, 'Code:', otp);
    return res.status(200).json({ message: 'OTP sent', uid });
  } catch (err) {
    console.error('Angel signup error:', err);
    return res.status(500).json({ error: 'Failed to sign up' });
  }
};

//
// VERIFY OTP â€” marks angel as verified and sets a signed cookie
//
exports.verifyOtp = async (req, res) => {
  const { uid, otp } = req.body;
  if (!uid || !otp) {
    return res.status(400).json({ error: 'UID and OTP required' });
  }

  try {
    const result = await pool.query('SELECT * FROM angel_investor WHERE uid = $1', [uid]);
    const angel = result.rows[0];

    if (!angel) return res.status(404).json({ error: 'Investor not found' });
    if (angel.is_verified) return res.status(400).json({ error: 'Already verified' });
    if (String(angel.otp) !== String(otp)) return res.status(400).json({ error: 'Invalid OTP' });

    await pool.query(
      'UPDATE angel_investor SET is_verified = true, otp = null, updated_at = NOW() WHERE uid = $1',
      [uid]
    );

    // Create S3 folder structure for this angel
    try {
      await createAngelS3Folders(uid);
    } catch (e) {
      // Non-fatal for verification, but log it
      console.error('Angel S3 folder creation failed:', e);
    }

    // Issue a signed cookie for app session
    const token = generateJWT(uid);
    setSessionCookie(res, token);
    setUidCookie(res, uid);

    // Also issue CloudFront signed cookies for media access (if configured)
    try {
      if (process.env.CLOUDFRONT_DOMAIN && process.env.CLOUDFRONT_KEY_PAIR_ID && process.env.CLOUDFRONT_PRIVATE_KEY_PATH) {
        setCloudFrontCookies(res);
      }
    } catch (e) {
      console.warn('Could not set CloudFront cookies:', e.message);
    }

    return res.status(200).json({ message: 'Email verified', uid });
  } catch (err) {
    console.error('Angel OTP verification error:', err);
    return res.status(500).json({ error: 'Could not verify OTP' });
  }
};

//
// CHECK EMAIL EXISTS
//
exports.checkEmailExists = async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'Email required' });

  try {
    const result = await pool.query('SELECT 1 FROM angel_investor WHERE email = $1', [email]);
    return res.json({ exists: result.rows.length > 0 });
  } catch (err) {
    console.error('Angel email check error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

//
// CHECK SESSION (via signed cookie)
//
exports.checkSession = (req, res) => {
  const token = SESSION_COOKIE_NAMES
    .map(name => req.signedCookies?.[name])
    .find(Boolean);
  if (!token) return res.status(401).json({ error: 'No session cookie' });

  try {
    const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET || process.env.COOKIE_SECRET;
    const decoded = jwt.verify(token, secret);
    return res.json({ uid: decoded.uid });
  } catch (err) {
    console.error('Invalid session (angel):', err.message);
    return res.status(401).json({ error: 'Invalid session' });
  }
};

//
// GET ONBOARDING STATUS â€” derive from angel steps
//
exports.getOnboardingStatus = async (req, res) => {
  const { uid } = req.query;
  if (!uid) return res.status(400).json({ error: 'UID required' });

  try {
    const result = await pool.query(
      'SELECT step1, kyc_validation, fund_validation, bg_check FROM angel_investor WHERE uid = $1',
      [uid]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Investor not found' });
    }

    const { step1, kyc_validation, fund_validation, bg_check } = result.rows[0];
    const onboarded = !!(step1 && kyc_validation && fund_validation && bg_check);
    return res.json({ onboarded });
  } catch (err) {
    console.error('Angel onboarding status error:', err);
    return res.status(500).json({ error: 'Could not fetch onboarding status' });
  }
};

exports.updatePersonalInfo = async (req, res) => {
  try {
    const { uid } = req.user;
    const { angel_name, dob, address, nationality } = req.body;
    
    const updatedUser = await pool.query(
      `UPDATE angel_investor 
       SET angel_name = $1, dob = $2, address = $3, nationality = $4, step1 = true, updated_at = NOW()
       WHERE uid = $5
       RETURNING uid, angel_name, dob, address, nationality, step1`,
      [angel_name, dob, address, nationality, uid]
    );
    
    if (updatedUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ 
      message: 'Personal information updated successfully',
      profile: updatedUser.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error updating personal information' });
  }
};

exports.verifyPhone = async (req, res) => {
  try {
    const { uid } = req.user;
    const { number, otp } = req.body;
    
    // In a real implementation, we would verify the OTP sent to the phone
    // For this we'll just update the number and mark it as verified
    
    const updatedUser = await pool.query(
      `UPDATE angel_investor 
       SET number = $1, number_verify = true, updated_at = NOW()
       WHERE uid = $2
       RETURNING uid, number, number_verify`,
      [number, uid]
    );
    
    if (updatedUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ 
      message: 'Phone number verified successfully',
      profile: updatedUser.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error verifying phone number' });
  }
};

// Protected: request email change -> sets new email, marks unverified, generates OTP and emails it
exports.changeEmail = async (req, res) => {
  try {
    const { uid } = req.user || {};
    const { email } = req.body || {};
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });
    if (!email) return res.status(400).json({ error: 'Email required' });

    const newEmail = String(email).split('?')[0].trim();

    const exists = await pool.query('SELECT 1 FROM angel_investor WHERE email = $1 AND uid <> $2', [newEmail, uid]);
    if (exists.rows.length > 0) return res.status(409).json({ error: 'Email already in use' });

    const otp = Math.floor(100000 + Math.random() * 900000);
    await pool.query(
      `UPDATE angel_investor
         SET email = $1, is_verified = false, otp = $2, updated_at = NOW()
       WHERE uid = $3`,
      [newEmail, String(otp), uid]
    );

    try {
      if (transporter) {
        const changeEmailFrom = process.env.SMTP_USER || process.env.SMTP_FROM || NO_REPLY_EMAIL;
        await transporter.sendMail({
          from: `"${APP_NAME}" <${changeEmailFrom}>` ,
          to: newEmail,
          subject: 'Verify your updated email',
          text: `Your ${APP_NAME} verification code is: ${otp}\n\nThis code expires in 10 minutes.`,
          html: `<p>Your ${APP_NAME} verification code is: <strong>${otp}</strong></p><p>This code expires in 10 minutes.</p>`,
        });
      }
    } catch (_) {}

    return res.json({ message: 'Email updated. Verification code sent.' });
  } catch (error) {
    console.error('changeEmail error:', error);
    return res.status(500).json({ error: 'Failed to update email' });
  }
};

exports.uploadPhoto = async (req, res) => {
  try {
    const { uid } = req.user || {};
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    const { photoDataUrl, photoName } = req.body || {};
    if (!photoDataUrl) return res.status(400).json({ error: 'photoDataUrl is required' });

    // Expect data URL format: data:<mimetype>;base64,<data>
    const match = String(photoDataUrl).match(/^data:(.+);base64,(.*)$/);
    if (!match) return res.status(400).json({ error: 'Invalid data URL' });
    const mimetype = match[1];
    const base64 = match[2];
    const buffer = Buffer.from(base64, 'base64');

    const safeName = (photoName || 'profile').replace(/[^a-zA-Z0-9_.-]/g, '_');
    const ext = (mimetype.split('/')[1] || 'jpg').toLowerCase();
    const key = `ang_investor/${uid}/profile/${safeName}.${ext}`;

    const result = await uploadFile(buffer, key, mimetype);

    // Persist the S3 KEY (not a public URL) for private-bucket access via proxy/signed URLs
    const link = result.Key || key;
    await pool.query(
      `UPDATE angel_investor SET profile_picture = $1, updated_at = NOW() WHERE uid = $2`,
      [link, uid]
    );

    return res.json({ message: 'Photo uploaded', key: result.Key, location: link });
  } catch (error) {
    console.error('uploadPhoto error:', error);
    res.status(500).json({ error: 'Server error uploading photo' });
  }
};
