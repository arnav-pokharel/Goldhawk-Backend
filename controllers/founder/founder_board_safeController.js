const jwt = require("jsonwebtoken");
const pool = require("../../db/pool");
const transporter = require("../../utils/mailer");
const { APP_NAME, NO_REPLY_EMAIL } = require("../../utils/appConfig");
const emailTemplateService = require("../../utils/emailTemplateService");

const SESSION_SECRET = process.env.SESSION_SECRET || "supersecret";

function normalizeEmail(input) {
  if (!input) return null;
  if (typeof input === "string") {
    const trimmed = input.trim();
    return trimmed.includes("@") ? trimmed : null;
  }
  if (Array.isArray(input)) {
    for (const item of input) {
      const normalized = normalizeEmail(item);
      if (normalized) return normalized;
    }
    return null;
  }
  if (typeof input === "object") {
    const candidates = [
      input.email,
      input.value,
      input.address,
      input.label,
    ].filter(Boolean);
    for (const candidate of candidates) {
      const normalized = normalizeEmail(candidate);
      if (normalized) return normalized;
    }
  }
  return null;
}

// -------- Founder sends invite --------
exports.sendSignRequest = async (req, res) => {
  const { uid } = req.params;
  const { directorId, full_name, email } = req.body;

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return res.status(400).json({ error: "Valid email address is required" });
  }

  try {
    // Generate a signed token valid for 5 minutes
    const token = jwt.sign({ directorId, uid }, SESSION_SECRET, {
      expiresIn: "5m",
    });

    const { rows } = await pool.query(
      'SELECT board_consent_safe FROM founder_safe WHERE uid = $1',
      [uid]
    );
    if (rows.length === 0) return res.status(404).json({ error: "SAFE not found" });
    let data = rows[0].board_consent_safe || { directors: [] };

    // Update or insert director entry
    const updatedDirectors = data.directors.map((d) =>
      d.id === directorId
        ? {
            ...d,
            full_name,
            email: normalizedEmail,
            sign_token: token,
            token_used: false,
            token_expires_at: new Date(Date.now() + 5 * 60000).toISOString(),
          }
        : d
    );

    if (!updatedDirectors.find((d) => d.id === directorId)) {
      updatedDirectors.push({
        id: directorId,
        full_name,
        email: normalizedEmail,
        signatory: null,
        signedAt: null,
        token_used: false,
        token_expires_at: new Date(Date.now() + 5 * 60000).toISOString(),
        sign_token: token,
      });
    }

    await pool.query(
      'UPDATE founder_safe SET board_consent_safe = $1, updated_at = NOW() WHERE uid = $2',
      [{ directors: updatedDirectors }, uid]
    );

    // Email link - attempt to send, but don't fail the whole request if mail fails
    const link = `${process.env.FRONTEND_URL}/external-site/board_consent_safe?token=${encodeURIComponent(token)}`;
    try {
      const htmlContent = emailTemplateService.getBoardConsentSafeEmail(full_name, uid, link);
      const fromAddress = process.env.SMTP_USER || process.env.EMAIL_USER || NO_REPLY_EMAIL;
      await transporter.sendMail({
        from: `"${APP_NAME}" <${fromAddress}>`,
        to: normalizedEmail,
        subject: "Board Consent SAFE - Signature Request",
        text: `Hello ${full_name},\n\nYou have been requested to sign the Board Consent SAFE.\n\nClick here to sign: ${link}\n\nNote: This link will expire in 5 minutes and can only be used once.`,
        html: htmlContent || `<p>Hello ${full_name},</p>
               <p>You have been requested to sign the Board Consent SAFE.</p>
               <p><a href="${link}">Click here to sign</a></p>
               <p><strong>Note:</strong> This link will expire in 5 minutes and can only be used once.</p>`,
      });
      return res.json({ message: "Sign request sent" });
    } catch (mailErr) {
      console.error("Failed to send sign request email:", mailErr);
      // Return success for DB update but indicate email failure so client can surface a meaningful message
      return res.status(200).json({ message: "Sign request saved but failed to send email", emailError: true });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to send request" });
  }
};

// -------- External board member loads doc --------
exports.getBoardConsentByToken = async (req, res) => {
  const { token } = req.params;

  try {
    const decoded = jwt.verify(token, SESSION_SECRET);
    const { directorId, uid } = decoded;

    const safeRes = await pool.query(
      'SELECT "SAFE_TOTAL_AUTHORIZED", safe_total_authorized, "SAFE_FORM", "PRO_RATA_ENABLED", board_consent_safe FROM founder_safe WHERE uid = $1',
      [uid]
    );
    if (safeRes.rows.length === 0) return res.status(404).json({ error: "SAFE not found" });
    const safeDoc = safeRes.rows[0];
    const data = safeDoc.board_consent_safe || { directors: [] };

    const director = Array.isArray(data.directors) ? data.directors.find((d) => d.id === directorId) : null;

    if (!director) return res.status(404).json({ error: "Director not found" });
    if (director.token_used)
      return res.status(401).json({ error: "Link already used" });

    const step2Res = await pool.query(
      'SELECT company_name, company_state_incorporated FROM founder_step2 WHERE uid = $1 LIMIT 1',
      [uid]
    );
    const step2 = step2Res.rows[0] || {};

    const safeTotal = safeDoc.SAFE_TOTAL_AUTHORIZED ?? safeDoc.safe_total_authorized ?? 0;

    res.json({
      name: director.full_name,
      signatory: director.signatory || null,
      signedAt: director.signedAt || null,
      companyName: step2.company_name || "",
      stateOfIncorporation: step2.company_state_incorporated || "",
      safeTotalAuthorized: Number(safeTotal || 0),
      safeForm: safeDoc.SAFE_FORM || "",
      proRataEnabled: Boolean(safeDoc.PRO_RATA_ENABLED),
      consentDate: (data && data.consent_date) || "",
    });
  } catch (err) {
    console.error("Invalid/expired token:", err);
    res.status(401).json({ error: "Invalid or expired link" });
  }
};

// -------- Founder inline sign --------
exports.founderSign = async (req, res) => {
  const { uid } = req.params;
  const { signature, signedAt, full_name } = req.body;

  try {
    const { rows } = await pool.query(
      'SELECT board_consent_safe FROM founder_safe WHERE uid = $1',
      [uid]
    );
    if (rows.length === 0) return res.status(404).json({ error: "SAFE not found" });
    let data = rows[0].board_consent_safe || { directors: [] };

    const founderDirector = {
      id: `founder-${uid}`, // a unique ID for the founder as a director
      full_name,
      email: null, // Founder signs inline, no email needed for link
      signatory: signature,
      signedAt,
      token_used: true, // Mark as "used" since it's an inline signature
    };

    // Add or update the founder's signature
    const directorIndex = data.directors.findIndex(d => d.id === founderDirector.id);
    if (directorIndex > -1) {
      data.directors[directorIndex] = founderDirector;
    } else {
      data.directors.push(founderDirector);
    }

    await pool.query(
      'UPDATE founder_safe SET board_consent_safe = $1, updated_at = NOW() WHERE uid = $2',
      [data, uid]
    );
    res.json({ message: "Founder signature saved" });
  } catch (err) {
    console.error("Founder sign error:", err);
    res.status(500).json({ error: "Failed to save founder signature" });
  }
};

// -------- External board member submits signature --------
exports.submitSignature = async (req, res) => {
  const { token } = req.params;
  const { signatory, signedAt } = req.body;

  try {
    const decoded = jwt.verify(token, SESSION_SECRET);
    const { directorId, uid } = decoded;

    const { rows } = await pool.query(
      'SELECT board_consent_safe FROM founder_safe WHERE uid = $1',
      [uid]
    );
    if (rows.length === 0) return res.status(404).json({ error: "SAFE not found" });
    let data = rows[0].board_consent_safe || { directors: [] };

    const directorIndex = Array.isArray(data.directors)
      ? data.directors.findIndex((d) => d.id === directorId)
      : -1;
    if (directorIndex === -1)
      return res.status(404).json({ error: "Director not found" });
    if (data.directors[directorIndex].token_used)
      return res.status(401).json({ error: "Link already used" });

    data.directors[directorIndex] = {
      ...data.directors[directorIndex],
      signatory,
      signedAt,
      token_used: true,
    };

    await pool.query(
      'UPDATE founder_safe SET board_consent_safe = $1, updated_at = NOW() WHERE uid = $2',
      [data, uid]
    );

    res.json({ message: "Signature saved" });
  } catch (err) {
    console.error("Signature error:", err);
    res.status(401).json({ error: "Invalid or expired link" });
  }
};

// -------- Founder locks the board (persisted)
exports.lockBoard = async (req, res) => {
  const { uid } = req.params;
  const { locked } = req.body; // expected boolean true to lock
  const actor = req.body.actor || null; // optional: who locked it

  try {
    const { rows } = await pool.query(
      'SELECT board_consent_safe FROM founder_safe WHERE uid = $1',
      [uid]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'SAFE not found' });
    let data = rows[0].board_consent_safe || { directors: [] };

    // Ensure data is an object
    if (typeof data !== 'object' || Array.isArray(data)) data = { directors: [] };

    data.board_locked = Boolean(locked);
    if (data.board_locked) {
      data.locked_at = new Date().toISOString();
      data.locked_by = actor;
    } else {
      // If unlocking (should be rare), clear metadata
      delete data.locked_at;
      delete data.locked_by;
    }

    await pool.query(
      'UPDATE founder_safe SET board_consent_safe = $1, updated_at = NOW() WHERE uid = $2',
      [data, uid]
    );

    res.json({ message: 'Board lock updated', board_consent_safe: data });
  } catch (err) {
    console.error('Lock board error:', err);
    res.status(500).json({ error: 'Failed to update board lock' });
  }
};
