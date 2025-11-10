const pool = require("../../db/pool");
const { v4: uuidv4 } = require("uuid");

// GET /founder/:uid/notes/mfn-agreement
// Returns the JSON stored in founder_note.mfn_agreement_notes
exports.getMfnAgreementNotes = async (req, res) => {
  const { uid } = req.params;
  const requesterUid = req.user?.uid;
  if (!requesterUid || requesterUid !== uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const { rows } = await pool.query(
      "SELECT mfn_agreement_notes FROM founder_note WHERE uid = $1",
      [uid]
    );
    if (!rows.length || !rows[0]?.mfn_agreement_notes) {
      return res.status(404).json({ error: "No signature found" });
    }
    return res.json(rows[0].mfn_agreement_notes);
  } catch (err) {
    console.error("getMfnAgreementNotes error:", err);
    return res.status(500).json({ error: "Failed to fetch MFN Agreement notes", detail: err.message });
  }
};

// POST /founder/:uid/notes/mfn-agreement/sign
// Write-once setter for founder_note.mfn_agreement_notes
exports.saveMfnAgreementNotes = async (req, res) => {
  const { uid } = req.params;
  const requesterUid = req.user?.uid;
  if (!requesterUid || requesterUid !== uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { signerName, signerTitle, signerAddress, signature, signedAt } = req.body || {};
  if (!signerName || !signerTitle || !signature) {
    return res.status(400).json({ error: "Missing required fields: signerName, signerTitle, signature" });
  }

  try {
    // Ensure founder exists (FK constraint on founder_note.uid)
    const f = await pool.query("SELECT uid FROM founders WHERE uid = $1", [uid]);
    if (f.rowCount === 0) return res.status(404).json({ error: "Founder not found" });

    // Check write-once policy
    const existing = await pool.query(
      "SELECT id, mfn_agreement_notes FROM founder_note WHERE uid = $1",
      [uid]
    );
    if (existing.rowCount > 0 && existing.rows[0]?.mfn_agreement_notes) {
      return res.status(409).json({ error: "MFN Agreement already signed" });
    }

    // Create row if absent
    if (existing.rowCount === 0) {
      await pool.query(
        "INSERT INTO founder_note (id, uid, created_at, updated_at) VALUES ($1, $2, NOW(), NOW())",
        [uuidv4(), uid]
      );
    }

    const payload = {
      signed: true,
      signerName,
      signerTitle,
      signerAddress: signerAddress || null,
      signature,
      signedAt: signedAt || new Date().toISOString(),
    };

    await pool.query(
      "UPDATE founder_note SET mfn_agreement_notes = $1::jsonb, updated_at = NOW() WHERE uid = $2",
      [JSON.stringify(payload), uid]
    );

    return res.json({ message: "MFN Agreement signature saved", data: payload });
  } catch (err) {
    console.error("saveMfnAgreementNotes error:", err);
    return res.status(500).json({ error: "Failed to save MFN Agreement notes", detail: err.message });
  }
};

