const bcrypt = require('bcrypt');
const pool = require('../../db/pool');

const transporter = require('../../utils/mailer');
const { APP_NAME, NO_REPLY_EMAIL } = require('../../utils/appConfig');

exports.getProfile = async (req, res) => {
  try {
    const { uid } = req.user;
    
    const profile = await pool.query(
      `SELECT uid, email, angel_name, created_at, updated_at, 
        number, dob, address, nationality, is_verified, acc_no, profile_picture,
        bio, total_investment, total_amount_invested
       FROM angel_investor 
       WHERE uid = $1`,
      [uid]
    );
    
    if (profile.rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    res.json({ profile: profile.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error fetching profile' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { uid } = req.user;
    const { angel_name, number, dob, address, nationality, bio, total_investment, total_amount_invested } = req.body;
    // Normalize phone number (integer column): allow empty -> null, otherwise digits only
    let phoneInt = null;
    if (number !== null && number !== undefined) {
      const digits = String(number).replace(/[^0-9]/g, "").trim();
      if (digits.length > 0) {
        const parsed = parseInt(digits, 10);
        if (!Number.isNaN(parsed)) phoneInt = parsed;
      }
    }
    // Normalize DOB (date column): empty -> null, valid date -> Date
    let dobValue = null;
    if (dob !== null && dob !== undefined && String(dob).trim() !== "") {
      const d = new Date(dob);
      if (!Number.isNaN(d.getTime())) dobValue = d;
    }
    // Accept strings too (e.g., "50+", "USD 500K+")
    const totalInvestmentValue = (total_investment === null || total_investment === undefined || total_investment === "")
      ? null
      : String(total_investment);
    const totalAmountInvestedValue = (total_amount_invested === null || total_amount_invested === undefined || total_amount_invested === "")
      ? null
      : String(total_amount_invested);
    
    const updatedProfile = await pool.query(
      `UPDATE angel_investor 
       SET angel_name = $1, number = $2, dob = $3, address = $4, nationality = $5, bio = $6, total_investment = $7, total_amount_invested = $8, updated_at = NOW()
       WHERE uid = $9
       RETURNING uid, email, angel_name, number, dob, address, nationality, bio, total_investment, total_amount_invested, updated_at, is_verified, acc_no, profile_picture`,
      [
        angel_name,
        phoneInt,
        dobValue,
        address,
        nationality,
        bio ?? null,
        totalInvestmentValue,
        totalAmountInvestedValue,
        uid
      ]
    );
    
    if (updatedProfile.rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    res.json({ 
      message: 'Profile updated successfully',
      profile: updatedProfile.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error updating profile' });
  }
};

// Change email: sets new email, marks unverified, generates OTP and sends email
exports.changeEmail = async (req, res) => {
  try {
    const { uid } = req.user;
    let { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Email required' });
    email = String(email).split('?')[0].trim();

    const exists = await pool.query('SELECT 1 FROM angel_investor WHERE email = $1 AND uid <> $2', [email, uid]);
    if (exists.rows.length > 0) return res.status(409).json({ error: 'Email already in use' });

    const otp = Math.floor(100000 + Math.random() * 900000);
    await pool.query(
      `UPDATE angel_investor
         SET email = $1, is_verified = false, otp = $2, updated_at = NOW()
       WHERE uid = $3`,
      [email, String(otp), uid]
    );

    try {
      if (transporter) {
        const fromAddress = process.env.SMTP_USER || process.env.SMTP_FROM || NO_REPLY_EMAIL;
        await transporter.sendMail({
          from: `"${APP_NAME}" <${fromAddress}>`,
          to: email,
          subject: 'Verify your updated email',
          text: `Your ${APP_NAME} verification code is: ${otp}`,
          html: `<p>Your ${APP_NAME} verification code is: <strong>${otp}</strong></p>`
        });
      }
    } catch (_) {}

    return res.json({ message: 'Email updated. Verification code sent.' });
  } catch (error) {
    console.error('changeEmail error:', error);
    return res.status(500).json({ error: 'Failed to change email' });
  }
};

// Verify email with OTP
exports.verifyEmail = async (req, res) => {
  try {
    const { uid } = req.user;
    const { otp } = req.body || {};
    if (!otp) return res.status(400).json({ error: 'OTP required' });

    const q = await pool.query('SELECT otp FROM angel_investor WHERE uid = $1', [uid]);
    if (q.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    if (String(q.rows[0].otp || '') !== String(otp)) return res.status(400).json({ error: 'Invalid code' });

    await pool.query('UPDATE angel_investor SET is_verified = true, otp = null, updated_at = NOW() WHERE uid = $1', [uid]);
    return res.json({ message: 'Email verified' });
  } catch (error) {
    console.error('verifyEmail error:', error);
    return res.status(500).json({ error: 'Failed to verify email' });
  }
};

// Send OTP to current email (no email change). Useful for confirming identity before change.
exports.sendOtpToCurrentEmail = async (req, res) => {
  try {
    const { uid } = req.user;
    const q = await pool.query('SELECT email FROM angel_investor WHERE uid = $1', [uid]);
    const current = q.rows[0]?.email;
    if (!current) return res.status(404).json({ error: 'Email not found' });

    const otp = Math.floor(100000 + Math.random() * 900000);
    await pool.query('UPDATE angel_investor SET otp = $1, updated_at = NOW() WHERE uid = $2', [String(otp), uid]);
    try {
      if (transporter) {
        const fromAddress = process.env.SMTP_USER || process.env.SMTP_FROM || NO_REPLY_EMAIL;
        await transporter.sendMail({
          from: `"${APP_NAME}" <${fromAddress}>`,
          to: current,
          subject: `Your ${APP_NAME} verification code`,
          text: `Your verification code is: ${otp}`,
          html: `<p>Your verification code is: <strong>${otp}</strong></p>`,
        });
      }
    } catch (_) {}

    return res.json({ message: 'Verification code sent to current email' });
  } catch (error) {
    console.error('sendOtpToCurrentEmail error:', error);
    return res.status(500).json({ error: 'Failed to send code' });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { uid } = req.user;
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    
    // Get current password
    const user = await pool.query(
      'SELECT password FROM angel_investor WHERE uid = $1',
      [uid]
    );
    
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.rows[0].password);
    
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
    
    // Hash new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    
    // Update password
    await pool.query(
      'UPDATE angel_investor SET password = $1, updated_at = NOW() WHERE uid = $2',
      [hashedPassword, uid]
    );
    
    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error changing password' });
  }
};

exports.updatePreferences = async (req, res) => {
  try {
    const { uid } = req.user;
    const {
      preferred_size, preferred_range, risk, preferred_stage,
      preferred_sector, motiv
    } = req.body;
    
    // Check if preferences already exist
    const existingPrefs = await pool.query(
      'SELECT uid FROM angel_stats WHERE uid = $1',
      [uid]
    );
    
    if (existingPrefs.rows.length > 0) {
      // Update existing preferences
      await pool.query(
        `UPDATE angel_stats 
         SET preferred_size = $1, preferred_range = $2, risk = $3, 
             preferred_stage = $4, preferred_sector = $5, motiv = $6
         WHERE uid = $7`,
        [preferred_size, preferred_range, risk, preferred_stage, preferred_sector, motiv, uid]
      );
    } else {
      // Insert new preferences
      await pool.query(
        `INSERT INTO angel_stats 
         (uid, preferred_size, preferred_range, risk, preferred_stage, preferred_sector, motiv)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [uid, preferred_size, preferred_range, risk, preferred_stage, preferred_sector, motiv]
      );
    }
    
    res.json({ message: 'Preferences updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error updating preferences' });
  }
};
