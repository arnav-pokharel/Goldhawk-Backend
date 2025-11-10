const pool = require("../../db/pool");
const { v4: uuidv4 } = require("uuid");

// GET /founder/:uid/notes/term-sheet
// Returns founder_note.termsheet_notes JSON
exports.getTermSheetNotes = async (req, res) => {
  const { uid } = req.params;
  const requesterUid = req.user?.uid;
  if (!requesterUid || requesterUid !== uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const { rows } = await pool.query(
      "SELECT termsheet_notes FROM founder_note WHERE uid = $1",
      [uid]
    );
    if (!rows.length || !rows[0]?.termsheet_notes) {
      return res.status(404).json({ error: "No signature found" });
    }
    return res.json(rows[0].termsheet_notes);
  } catch (err) {
    console.error("getTermSheetNotes error:", err);
    return res.status(500).json({ error: "Failed to fetch Term Sheet notes", detail: err.message });
  }
};

// POST /founder/:uid/notes/term-sheet/sign
// Write-once setter for founder_note.termsheet_notes
exports.saveTermSheetNotes = async (req, res) => {
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
    // Ensure founder exists
    const f = await pool.query("SELECT uid FROM founders WHERE uid = $1", [uid]);
    if (f.rowCount === 0) return res.status(404).json({ error: "Founder not found" });

    // Check write-once policy
    const existing = await pool.query(
      "SELECT id, termsheet_notes FROM founder_note WHERE uid = $1",
      [uid]
    );
    if (existing.rowCount > 0 && existing.rows[0]?.termsheet_notes) {
      return res.status(409).json({ error: "Term Sheet already signed" });
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
      "UPDATE founder_note SET termsheet_notes = $1::jsonb, updated_at = NOW() WHERE uid = $2",
      [JSON.stringify(payload), uid]
    );

    return res.json({ message: "Term Sheet signature saved", data: payload });
  } catch (err) {
    console.error("saveTermSheetNotes error:", err);
    return res.status(500).json({ error: "Failed to save Term Sheet notes", detail: err.message });
  }
};

