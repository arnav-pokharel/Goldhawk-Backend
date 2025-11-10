const pool = require("../../db/pool");

// POST /founder/:uid/convertible-notes/sign
// Saves founder signature for Convertible Notes inside founder_note.convertible_notes JSON.
// Immutable: if a signature already exists, returns 409 and does not overwrite.
exports.saveConvertibleSignature = async (req, res) => {
  const { uid } = req.params;
  const { signature, signerName, signerTitle, signerAddress, signedAt } = req.body || {};

  if (!uid || !signature || !signerName) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // Ensure row exists
    const { rows } = await pool.query("SELECT convertible_notes FROM founder_note WHERE uid = $1", [uid]);
    if (rows.length === 0) {
      // Create row if missing
      await pool.query(
        `INSERT INTO founder_note (uid, convertible_notes, created_at, updated_at)
         VALUES ($1, $2::jsonb, NOW(), NOW())
         ON CONFLICT (uid) DO UPDATE SET convertible_notes = EXCLUDED.convertible_notes, updated_at = NOW()`,
        [uid, JSON.stringify({
          signature,
          signerName,
          signerTitle,
          signerAddress,
          signedAt: signedAt || new Date().toISOString(),
        })]
      );
      return res.json({ success: true, created: true });
    }

    const existing = rows[0].convertible_notes || {};
    if (existing && existing.signature) {
      return res.status(409).json({ error: "Signature already saved and cannot be changed" });
    }

    const payload = {
      signature,
      signerName,
      signerTitle,
      signerAddress,
      signedAt: signedAt || new Date().toISOString(),
    };

    await pool.query(
      `UPDATE founder_note
       SET convertible_notes = $1::jsonb, updated_at = NOW()
       WHERE uid = $2`,
      [JSON.stringify(payload), uid]
    );

    return res.json({ success: true });
  } catch (err) {
    console.error("saveConvertibleSignature error:", err);
    return res.status(500).json({ error: "Failed to save signature" });
  }
};
