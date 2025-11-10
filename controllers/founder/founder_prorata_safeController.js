const pool = require("../../db/pool");
const { v4: uuidv4 } = require("uuid");

// GET /founder/:uid/safe/pro-rata-side-letter
// Returns founder_safe.pro_rata_side_letter_safe JSON (signature payload)
exports.getProRataSafe = async (req, res) => {
  const { uid } = req.params;
  const requesterUid = req.user?.uid;
  if (!requesterUid || requesterUid !== uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const { rows } = await pool.query(
      "SELECT pro_rata_side_letter_safe FROM founder_safe WHERE uid = $1",
      [uid]
    );
    if (!rows.length || !rows[0]?.pro_rata_side_letter_safe) {
      return res.status(404).json({ error: "No signature found" });
    }
    return res.json(rows[0].pro_rata_side_letter_safe);
  } catch (err) {
    console.error("getProRataSafe error:", err);
    return res.status(500).json({ error: "Failed to fetch Pro Rata SAFE signature", detail: err.message });
  }
};

// POST /founder/:uid/safe/pro-rata-side-letter/sign
// Write-once setter for founder_safe.pro_rata_side_letter_safe
exports.saveProRataSafe = async (req, res) => {
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
      "SELECT id, pro_rata_side_letter_safe FROM founder_safe WHERE uid = $1",
      [uid]
    );
    if (existing.rowCount > 0 && existing.rows[0]?.pro_rata_side_letter_safe) {
      return res.status(409).json({ error: "Pro Rata Side Letter SAFE already signed" });
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

    await pool.query(
      "UPDATE founder_safe SET pro_rata_side_letter_safe = $1::jsonb, updated_at = NOW() WHERE uid = $2",
      [JSON.stringify(payload), uid]
    );

    return res.json({ message: "Pro Rata Side Letter SAFE signature saved", data: payload });
  } catch (err) {
    console.error("saveProRataSafe error:", err);
    return res.status(500).json({ error: "Failed to save Pro Rata SAFE signature", detail: err.message });
  }
};
