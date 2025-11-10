const pool = require("../../db/pool");
const { v4: uuidv4 } = require("uuid");

// GET /founder/:uid/safe/term-sheet
// Returns founder_safe.term_sheet_safe JSON (signature payload)
exports.getTermSheetSafe = async (req, res) => {
  const { uid } = req.params;
  const requesterUid = req.user?.uid;
  if (!requesterUid || requesterUid !== uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const { rows } = await pool.query(
      "SELECT term_sheet_safe FROM founder_safe WHERE uid = $1",
      [uid]
    );
    if (!rows.length || !rows[0]?.term_sheet_safe) {
      return res.status(404).json({ error: "No signature found" });
    }
    return res.json(rows[0].term_sheet_safe);
  } catch (err) {
    console.error("getTermSheetSafe error:", err);
    return res.status(500).json({ error: "Failed to fetch Term Sheet SAFE signature", detail: err.message });
  }
};

// POST /founder/:uid/safe/term-sheet/sign
// Write-once setter for founder_safe.term_sheet_safe
exports.saveTermSheetSafe = async (req, res) => {
  const { uid } = req.params;
  const requesterUid = req.user?.uid;
  if (!requesterUid || requesterUid !== uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  let { signerName, signerTitle, signerAddress, signature, signedAt } = req.body || {};
  signerName = signerName || req.body?.name || req.body?.legalName || null;
  signerTitle = signerTitle || req.body?.title || null;
  signature = signature || req.body?.signatureImage || req.body?.sign || null;

  if (!signerName || !signerTitle || !signature) {
    return res.status(400).json({ error: "Missing required fields: signerName, signerTitle, signature" });
  }

  try {
    // Ensure founder exists
    const f = await pool.query("SELECT uid FROM founders WHERE uid = $1", [uid]);
    if (f.rowCount === 0) return res.status(404).json({ error: "Founder not found" });

    // Check write-once policy
    const existing = await pool.query(
      "SELECT id, term_sheet_safe FROM founder_safe WHERE uid = $1",
      [uid]
    );
    if (existing.rowCount > 0 && existing.rows[0]?.term_sheet_safe) {
      return res.status(409).json({ error: "Term Sheet SAFE already signed" });
    }

    // Create row if absent
    if (existing.rowCount === 0) {
      await pool.query(
        "INSERT INTO founder_safe (id, uid, created_at, updated_at) VALUES ($1, $2, NOW(), NOW())",
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

    try {
      await pool.query(
        "UPDATE founder_safe SET term_sheet_safe = $1::jsonb, updated_at = NOW() WHERE uid = $2",
        [JSON.stringify(payload), uid]
      );
    } catch (e) {
      const message = e?.message || "";
      if (message.includes("column \"term_sheet_safe\" does not exist") || message.includes("term_sheet_safe")) {
        try {
          await pool.query("ALTER TABLE founder_safe ADD COLUMN IF NOT EXISTS term_sheet_safe jsonb");
          await pool.query(
            "UPDATE founder_safe SET term_sheet_safe = $1::jsonb, updated_at = NOW() WHERE uid = $2",
            [JSON.stringify(payload), uid]
          );
        } catch (innerErr) {
          console.error("Failed to add term_sheet_safe column or update after adding:", innerErr);
          return res.status(500).json({ error: "Failed to save Term Sheet SAFE signature (migrate)", detail: innerErr.message });
        }
      } else {
        throw e;
      }
    }

    return res.json({ message: "Term Sheet SAFE signature saved", data: payload });
  } catch (err) {
    console.error("saveTermSheetSafe error:", err);
    return res.status(500).json({ error: "Failed to save Term Sheet SAFE signature", detail: err.message });
  }
};

