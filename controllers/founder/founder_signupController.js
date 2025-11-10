const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../../db/pool");
const transporter = require("../../utils/mailer");
const emailTemplateService = require("../../utils/emailTemplateService");
const { createFounderS3Folders } = require("../../services/s3");
const { setCloudFrontCookies } = require("../../utils/cloudfront");
const { setSessionCookie, setUidCookie, SESSION_COOKIE_NAMES } = require("../../utils/cookies");
const { APP_NAME, NO_REPLY_EMAIL } = require("../../utils/appConfig");

//
// SIGNUP – create founder, generate OTP, send email
//
exports.signupFounder = async (req, res) => {
  let { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  email = email.split("?")[0].trim();

  try {
    const existing = await pool.query("SELECT 1 FROM founders WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Email already registered. Please log in." });
    }

    const hashed = await bcrypt.hash(password, 10);
    const otp = Math.floor(100000 + Math.random() * 900000);
    const uid = uuidv4();

    await pool.query(
      `INSERT INTO founders (
        uid, email, password, otp, otp_expires_at, is_verified,
        step1, step2, step3, created_at, updated_at
      ) VALUES (
        $1::uuid, $2::text, $3::text, $4::int,
        NOW() + INTERVAL '10 minutes',
        $5::boolean, $6::boolean, $7::boolean, $8::boolean, NOW(), NOW()
      )`,
      [uid, email, hashed, otp, false, false, false, false]
    );

    let mailSent = false;
    if (transporter && typeof transporter.sendMail === "function" && transporter.isConfigured) {
      try {
        const htmlContent = emailTemplateService.getOtpVerificationEmail(otp);
        const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER || process.env.EMAIL_USER || NO_REPLY_EMAIL;
        await transporter.sendMail({
          from: `"${APP_NAME}" <${fromAddress}>`,
          to: email,
          subject: `Your ${APP_NAME} OTP Code`,
          text: `Your OTP is: ${otp}\n\nIt expires in 10 minutes.`,
          html: htmlContent || `<p>Your OTP is: <b>${otp}</b></p><p>It expires in 10 minutes.</p>`,
        });
        mailSent = true;
      } catch (mailErr) {
        console.warn("[founder.signup] Failed to send OTP email:", mailErr?.message || mailErr);
      }
    } else {
      console.warn("[founder.signup] Mailer not configured; OTP email was not sent.");
    }

    if (!mailSent) {
      console.info(`[founder.signup] OTP for ${email}: ${otp}`);
    }

    const allowDebugOtp = process.env.EXPOSE_DEV_OTP === "true" || process.env.NODE_ENV !== "production";

    const payload = {
      message: mailSent ? "OTP sent" : "OTP generated",
      uid,
      mailSent,
    };

    if (!mailSent && allowDebugOtp) {
      payload.otpDebug = otp;
    }

    return res.status(200).json(payload);
  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({ error: "Failed to sign up" });
  }
};

//
// VERIFY OTP
//
exports.verifyOtp = async (req, res) => {
  const { uid, otp } = req.body;
  if (!uid || !otp) {
    return res.status(400).json({ error: "UID and OTP required" });
  }

  try {
    const result = await pool.query("SELECT * FROM founders WHERE uid = $1", [uid]);
    const founder = result.rows[0];

    if (!founder) return res.status(404).json({ error: "Founder not found" });
    if (founder.is_verified) return res.status(400).json({ error: "Already verified" });

    if (founder.otp_expires_at && new Date() > new Date(founder.otp_expires_at)) {
      return res.status(400).json({ error: "OTP has expired. Please request a new one." });
    }

    if (String(founder.otp) !== String(otp)) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    await pool.query(
      "UPDATE founders SET is_verified = true, otp = null, otp_expires_at = null, updated_at = NOW() WHERE uid = $1",
      [uid]
    );

    await createFounderS3Folders(uid);

    try {
      const { ensureFounderAccount } = require("../account_numberController");
      await ensureFounderAccount(uid, null);
    } catch (e) {
      console.warn("Account number issuance (founder) failed or deferred:", e?.message || e);
    }

    const token = jwt.sign({ uid }, process.env.COOKIE_SECRET, { expiresIn: "7d" });
    setSessionCookie(res, token);

    try {
      if (process.env.CLOUDFRONT_DOMAIN && process.env.CLOUDFRONT_KEY_PAIR_ID && process.env.CLOUDFRONT_PRIVATE_KEY_PATH) {
        setCloudFrontCookies(res);
      }
    } catch (e) {
      console.warn("Could not set CloudFront cookies:", e?.message || e);
    }

    return res.status(200).json({ message: "Email verified", uid });
  } catch (err) {
    console.error("OTP verification error:", err);
    return res.status(500).json({ error: "Could not verify OTP" });
  }
};

//
// CHECK EMAIL EXISTS
//
exports.checkEmailExists = async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: "Email required" });

  try {
    const result = await pool.query("SELECT 1 FROM founders WHERE email = $1", [email]);
    return res.json({ exists: result.rows.length > 0 });
  } catch (err) {
    console.error("Email check error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

//
// CHECK SESSION
//
exports.checkSession = (req, res) => {
  const token = SESSION_COOKIE_NAMES
    .map(name => req.signedCookies?.[name])
    .find(Boolean);
  if (!token) return res.status(401).json({ error: "No session cookie" });

  try {
    const decoded = jwt.verify(token, process.env.COOKIE_SECRET);
    return res.json({ uid: decoded.uid });
  } catch (err) {
    console.error("Invalid session:", err.message);
    return res.status(401).json({ error: "Invalid session" });
  }
};

//
// GET ONBOARDING STATUS
//
exports.getOnboardingStatus = async (req, res) => {
  const { uid } = req.query;
  if (!uid) return res.status(400).json({ error: "UID required" });

  try {
    const result = await pool.query(
      "SELECT step1, step2, step3 FROM founders WHERE uid = $1",
      [uid]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Founder not found" });
    }

    const { step1, step2, step3 } = result.rows[0];
    const onboarded = Boolean(step1 && step2 && step3);

    return res.json({ onboarded });
  } catch (err) {
    console.error("Onboarding status error:", err);
    return res.status(500).json({ error: "Could not fetch onboarding status" });
  }
};
