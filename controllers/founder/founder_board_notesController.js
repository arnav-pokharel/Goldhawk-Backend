const pool = require("../../db/pool");
const jwt = require("jsonwebtoken");
const transporter = require("../../utils/mailer");
const { APP_NAME, NO_REPLY_EMAIL } = require("../../utils/appConfig");
const emailTemplateService = require("../../utils/emailTemplateService");

const JWT_SECRET = process.env.JWT_SECRET || "supersecret";

// Helper: sign tokens for directors
function generateSignToken(founderId, directorId) {
  return jwt.sign({ founderId, directorId }, JWT_SECRET, { expiresIn: "7d" });
}

function verifySignToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

/**
 * Founder self-sign inside dashboard
 */
exports.saveFounderBoardNotesSignature = async (req, res) => {
  const { uid } = req.params;
  const { signature, signedAt, full_name } = req.body;

  if (!uid || !signature || !full_name) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const founderDirectorId = `founder-${uid}`;

  try {
    // Update existing founder director entry if present
    await pool.query(
      `
      UPDATE founder_note
      SET board_consent_notes = jsonb_set(
        COALESCE(board_consent_notes, '{}'::jsonb),
        '{directors}',
        (
          SELECT jsonb_agg(
            CASE 
              WHEN d->>'id' = $2 THEN 
                jsonb_set(
                  jsonb_set(
                    jsonb_set(d, '{signatory}', to_jsonb($1::text)),
                    '{signedAt}', to_jsonb($3::text),
                    true
                  ),
                  '{full_name}', to_jsonb($4::text),
                  true
                )
              ELSE d
            END
          )
          FROM jsonb_array_elements(COALESCE(board_consent_notes->'directors', '[]'::jsonb)) d
        ),
        true
      )
      WHERE uid = $5
      `,
      [signature, founderDirectorId, signedAt, full_name, uid]
    );

    // If founder director does not exist, append it
    await pool.query(
      `
      UPDATE founder_note AS fn
      SET board_consent_notes = jsonb_set(
        COALESCE(fn.board_consent_notes, '{}'::jsonb),
        '{directors}',
        COALESCE(fn.board_consent_notes->'directors','[]'::jsonb) ||
          jsonb_build_array(jsonb_build_object(
            'id', $2::text,
            'full_name', $4::text,
            'signatory', $1::text,
            'signedAt', $3::text
          )),
        true
      )
      WHERE fn.uid = $5
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(fn.board_consent_notes->'directors','[]'::jsonb)) d
        WHERE d->>'id' = $2
      )
      `,
      [signature, founderDirectorId, signedAt, full_name, uid]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Error saving founder board notes signature:", err);
    res.status(500).json({ error: "Failed to save signature" });
  }
};

/**
 * Send email invite to director with tokenized link
 */
exports.sendBoardNotesSignRequest = async (req, res) => {
  const { uid } = req.params;
  const { directorId, full_name, email } = req.body;

  const normalizedEmail = normalizeEmail(email);

  if (!uid || !directorId || !normalizedEmail) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const token = generateSignToken(uid, directorId);
    const signUrl = `${process.env.FRONTEND_URL}/external-site/board_consent_notes?token=${token}`;

    // Ensure director exists/updated inside founder_note.board_consent_notes
    try {
      // Update existing director entry
      await pool.query(
        `
        UPDATE founder_note
        SET board_consent_notes = jsonb_set(
          COALESCE(board_consent_notes, '{}'::jsonb),
          '{directors}',
          (
            SELECT jsonb_agg(
              CASE 
                WHEN d->>'id' = $2 THEN 
                  jsonb_set(
                    jsonb_set(d, '{full_name}', to_jsonb($3::text), true),
                    '{email}', to_jsonb($4::text), true
                  )
                ELSE d
              END
            )
            FROM jsonb_array_elements(COALESCE(board_consent_notes->'directors', '[]'::jsonb)) d
          ),
          true
        )
        WHERE uid = $1
        `,
        [uid, directorId, full_name, normalizedEmail]
      );

      // Append if not present
      await pool.query(
        `
        UPDATE founder_note AS fn
        SET board_consent_notes = jsonb_set(
          COALESCE(fn.board_consent_notes, '{}'::jsonb),
          '{directors}',
          COALESCE(fn.board_consent_notes->'directors','[]'::jsonb) ||
            jsonb_build_array(jsonb_build_object(
              'id', $2::text,
              'full_name', $3::text,
              'email', $4::text
            )),
          true
        )
        WHERE fn.uid = $1
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(fn.board_consent_notes->'directors','[]'::jsonb)) d
          WHERE d->>'id' = $2
        )
        `,
        [uid, directorId, full_name, normalizedEmail]
      );
    } catch (dbErr) {
      console.error('Error updating directors list:', dbErr);
      // continue; not fatal for sending token
    }

    // Attempt to send email; if it fails, still return success with emailError
    let emailError = null;
    try {
      const htmlContent = emailTemplateService.getBoardConsentNotesEmail(full_name, uid, signUrl);
      const fromAddress = process.env.SMTP_USER || process.env.EMAIL_USER || NO_REPLY_EMAIL;

      await transporter.sendMail({
        from: `"${APP_NAME}" <${fromAddress}>`,
        to: normalizedEmail,
        subject: `Board Consent Notes Signature Request`,
        text: `Hello ${full_name},

You have been requested to sign the Board Consent – Convertible Promissory Notes for ${uid}.

Please click the link below to review and sign: ${signUrl}`,
        html: htmlContent || `
          <p>Hello ${full_name},</p>
          <p>You have been requested to sign the Board Consent – Convertible Promissory Notes for ${uid}.</p>
          <p>Please click the link below to review and sign:</p>
          <p><a href="${signUrl}" target="_blank">${signUrl}</a></p>
        `,
      });
    } catch (mailErr) {
      console.error("Email send failed:", mailErr);
      emailError = mailErr?.message || "Email failed";
    }

    res.json({ success: true, signUrl, emailError });
  } catch (err) {
    console.error("Error sending board notes sign request:", err);
    res.status(500).json({ error: "Failed to send sign request" });
  }
};

/**
 * Get document for external director by token
 */
exports.getBoardNotesDocByToken = async (req, res) => {
  const { token } = req.params;

  try {
    const { founderId, directorId } = verifySignToken(token);

    const result = await pool.query(
      `SELECT 
         fn.board_consent_notes,
         fs2.company_legal_name AS company_name,
         fs2.company_state_incorporated,
         fn."NOTE_TOTAL_AUTHORIZED",
         fn."NOTE_PRO_RATA_ENABLED",
         fn."NOTE_MFN_ENABLED"
       FROM founder_note fn
       JOIN founder_step2 fs2 ON fs2.uid = fn.uid
       WHERE fn.uid = $1`,
      [founderId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Not found" });
    }

    const doc = result.rows[0];
    const directors = doc.board_consent_notes?.directors || [];
    const director = directors.find((d) => d.id === directorId);

    if (!director) {
      return res.status(404).json({ error: "Director not found" });
    }

    res.json({
      companyName: doc.company_name,
      stateOfIncorporation: doc.company_state_incorporated,
      noteTotalAuthorized: Number(doc.NOTE_TOTAL_AUTHORIZED || 0),
      noteProRataEnabled: Boolean(doc.NOTE_PRO_RATA_ENABLED),
      noteMfnEnabled: Boolean(doc.NOTE_MFN_ENABLED),
      consentDate: doc.board_consent_notes?.consent_date || null,
      directorName: director.full_name,
      signatory: director.signatory,
      signedAt: director.signedAt,
    });
  } catch (err) {
    console.error("Error verifying token:", err);
    res.status(400).json({ error: "Invalid or expired link" });
  }
};

/**
 * Save director signature by token
 */
exports.saveDirectorBoardNotesSignature = async (req, res) => {
  const { token } = req.params;
  const { signature, signedAt } = req.body;

  try {
    const { founderId, directorId } = verifySignToken(token);

    await pool.query(
      `
      UPDATE founder_note
      SET board_consent_notes = jsonb_set(
        COALESCE(board_consent_notes, '{}'::jsonb),
        '{directors}',
        (
          SELECT jsonb_agg(
            CASE 
              WHEN d->>'id' = $2 THEN 
                jsonb_set(
                  jsonb_set(d, '{signatory}', to_jsonb($1::text)),
                  '{signedAt}', to_jsonb($3::text),
                  true
                )
              ELSE d
            END
          )
          FROM jsonb_array_elements(COALESCE(board_consent_notes->'directors', '[]'::jsonb)) d
        ),
        true
      )
      WHERE uid = $4
      `,
      [signature, directorId, signedAt, founderId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Error saving director board notes signature:", err);
    res.status(400).json({ error: "Invalid or expired link" });
  }
};

/**
 * Lock/unlock the board consent notes
 */
exports.lockBoardNotes = async (req, res) => {
  const { uid } = req.params;
  const { locked } = req.body;

  try {
    await pool.query(
      `
      UPDATE founder_note
      SET board_consent_notes = jsonb_set(
        COALESCE(board_consent_notes, '{}'::jsonb),
        '{locked}',
        to_jsonb($1::boolean),
        true
      )
      WHERE uid = $2
      `,
      [Boolean(locked), uid]
    );
    res.json({ success: true, locked });
  } catch (err) {
    console.error("Error updating board notes lock state:", err);
    res.status(500).json({ error: "Failed to update lock state" });
  }
};
