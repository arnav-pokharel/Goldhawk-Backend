const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const pool = require("../../../db/pool");
const { sendOTPEmail } = require('../../../utils/emailService');
const { createVCFirmS3Folders } = require('../../../services/s3');

const generateToken = (firmId, uid) => {
    return jwt.sign({ firmId, uid }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    });
};

// SIGNUP - Create VC Firm, generate OTP, send email
const admin_signup = async (req, res) => {
    let { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            success: false,
            message: 'Email and password required'
        });
    }

    // Clean email
    email = email.split("?")[0].trim();

    try {
        // 1. Check if the firm already exists
        const existingResult = await pool.query(
            "SELECT 1 FROM vc_firms WHERE email = $1 OR admin_email = $1",
            [email]
        );

        if (existingResult.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Email already registered. Please log in.'
            });
        }

        // 2. Create new firm
        const hashedPassword = await bcrypt.hash(password, 12);
        const uid = uuidv4();
        const firm_number = Math.floor(1000000000 + Math.random() * 9000000000).toString();
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // 3. Insert into database - using correct column names from your schema
        const result = await pool.query(
            `INSERT INTO vc_firms (
                email, password, firm_number, uid, is_verified, verified, otp, otp_expires_at,
                created_at, updated_at, "createdAt", "updatedAt"
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), NOW(), NOW()
            ) RETURNING id, uid, email, firm_number`,
            [email, hashedPassword, firm_number, uid, false, false, otpCode, otpExpiresAt]
        );

        const firm = result.rows[0];

        // 4. Send OTP via email
        await sendOTPEmail(email, otpCode);

        // 5. Create S3 folder structure
        try {
            await createVCFirmS3Folders(uid);
        } catch (s3Error) {
            console.error('S3 folder creation error:', s3Error);
            // Continue even if S3 fails
        }

        console.log("✅ OTP sent to:", email, "Code:", otpCode);

        res.status(201).json({
            success: true,
            message: 'Firm created successfully. Please verify your email with the OTP sent.',
            uid: firm.uid,
            firmId: firm.id,
            nextStep: '/investor/vc_firm/admin/verify-email'
        });

    } catch (error) {
        console.error('VC Firm Admin Signup error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// VERIFY OTP
const admin_verifyEmail = async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({
            success: false,
            message: 'Email and OTP required'
        });
    }

    try {
        // 1. Find firm by email
        const result = await pool.query(
            "SELECT * FROM vc_firms WHERE email = $1 OR admin_email = $1",
            [email]
        );

        const firm = result.rows[0];

        if (!firm) {
            return res.status(404).json({
                success: false,
                message: 'Firm not found'
            });
        }

        if (firm.is_verified || firm.verified) {
            return res.status(400).json({
                success: false,
                message: 'Email already verified'
            });
        }

        // 2. Check OTP expiration
        if (firm.otp_expires_at && new Date() > new Date(firm.otp_expires_at)) {
            return res.status(400).json({
                success: false,
                message: 'OTP has expired. Please request a new one.'
            });
        }

        if (String(firm.otp) !== String(otp)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid OTP'
            });
        }

        // 3. Update firm as verified
        await pool.query(
            `UPDATE vc_firms 
             SET is_verified = true, verified = true, otp = null, otp_expires_at = null,
                 updated_at = NOW(), "updatedAt" = NOW()
             WHERE id = $1`,
            [firm.id]
        );

        // 4. Generate token
        const token = generateToken(firm.id, firm.uid);

        res.cookie('vc_admin_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            signed: true,
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });

        res.status(200).json({
            success: true,
            message: 'Email verified successfully',
            token,
            redirectTo: '/investor/vc_firm/admin/onboarding',
            firm: {
                id: firm.id,
                uid: firm.uid,
                email: firm.email,
                firm_name: firm.firm_name,
                firm_number: firm.firm_number,
                is_verified: true
            }
        });

    } catch (error) {
        console.error('Verify email error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// LOGIN
const admin_login = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            success: false,
            message: 'Email and password required'
        });
    }

    try {
        // 1. Find firm by email
        const result = await pool.query(
            "SELECT * FROM vc_firms WHERE email = $1 OR admin_email = $1",
            [email]
        );

        const firm = result.rows[0];

        if (!firm || !firm.password) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // 2. Verify password
        const isPasswordValid = await bcrypt.compare(password, firm.password);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        if (!firm.is_verified && !firm.verified) {
            return res.status(401).json({
                success: false,
                message: 'Please verify your email first'
            });
        }

        // 3. Update last login
        await pool.query(
            "UPDATE vc_firms SET last_login = NOW(), updated_at = NOW(), \"updatedAt\" = NOW() WHERE id = $1",
            [firm.id]
        );

        // 4. Generate token
        const token = generateToken(firm.id, firm.uid);

        res.cookie('vc_admin_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            signed: true,
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });

        res.status(200).json({
            success: true,
            message: 'Login successful',
            token,
            redirectTo: '/investor/vc_firm/admin/dashboard',
            firm: {
                id: firm.id,
                uid: firm.uid,
                email: firm.email,
                firm_name: firm.firm_name,
                firm_number: firm.firm_number,
                firm_hq: firm.firm_hq,
                is_verified: firm.is_verified
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// RESEND OTP
const resendOtp = async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({
            success: false,
            message: 'Email required'
        });
    }

    try {
        // 1. Find firm by email
        const result = await pool.query(
            "SELECT * FROM vc_firms WHERE email = $1 OR admin_email = $1",
            [email]
        );

        const firm = result.rows[0];

        if (!firm) {
            return res.status(404).json({
                success: false,
                message: 'Firm not found'
            });
        }

        if (firm.is_verified || firm.verified) {
            return res.status(400).json({
                success: false,
                message: 'Email already verified'
            });
        }

        // 2. Generate new OTP
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // 3. Update OTP in database
        await pool.query(
            `UPDATE vc_firms 
             SET otp = $1, otp_expires_at = $2, updated_at = NOW(), "updatedAt" = NOW()
             WHERE id = $3`,
            [otpCode, otpExpiresAt, firm.id]
        );

        // 4. Send OTP via email
        await sendOTPEmail(email, otpCode);

        console.log("✅ OTP resent to:", email, "Code:", otpCode);

        res.status(200).json({
            success: true,
            message: 'OTP sent successfully',
            uid: firm.uid
        });

    } catch (error) {
        console.error('Resend OTP error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// CHECK EMAIL EXISTS
const checkEmailExists = async (req, res) => {
    const { email } = req.query;
    
    if (!email) {
        return res.status(400).json({
            success: false,
            message: 'Email required'
        });
    }

    try {
        const result = await pool.query(
            "SELECT 1 FROM vc_firms WHERE email = $1 OR admin_email = $1",
            [email]
        );

        return res.json({
            success: true,
            exists: result.rows.length > 0
        });

    } catch (error) {
        console.error('Email check error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// CHECK SESSION
const checkSession = (req, res) => {
    const token = req.signedCookies.vc_admin_token;
    
    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'No session cookie'
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        return res.json({
            success: true,
            firm: {
                firmId: decoded.firmId,
                uid: decoded.uid
            }
        });
    } catch (err) {
        console.error('Invalid session:', err.message);
        return res.status(401).json({
            success: false,
            message: 'Invalid session'
        });
    }
};

// GET FIRM PROFILE
const getFirmProfile = async (req, res) => {
    const { uid } = req.params;

    if (!uid) {
        return res.status(400).json({
            success: false,
            message: 'UID required'
        });
    }

    try {
        const result = await pool.query(
            `SELECT 
                id, uid, email, firm_name, firm_number, firm_hq, found_year, 
                legal_structure, url, firm_admin, admin_email, admin_phone, 
                admin_title, firm_logo, is_verified, "createdAt", last_login
             FROM vc_firms WHERE uid = $1`,
            [uid]
        );

        const firm = result.rows[0];

        if (!firm) {
            return res.status(404).json({
                success: false,
                message: 'Firm not found'
            });
        }

        res.status(200).json({
            success: true,
            firm: firm
        });

    } catch (error) {
        console.error('Get firm profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// LOGOUT
const admin_logout = (req, res) => {
    res.clearCookie('vc_admin_token');
    res.status(200).json({
        success: true,
        message: 'Logged out successfully'
    });
};

module.exports = {
    admin_signup,
    admin_verifyEmail,
    admin_login,
    resendOtp,
    checkEmailExists,
    checkSession,
    getFirmProfile,
    admin_logout
};