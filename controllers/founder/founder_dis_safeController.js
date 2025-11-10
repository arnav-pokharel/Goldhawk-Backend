const pool = require("../../db/pool");
const { v4: uuidv4 } = require("uuid");

// GET /founder/:uid/safe/discount
// Returns founder_safe.discount_safe JSON (signature payload)
exports.getDiscountSafe = async (req, res) => {
  const { uid } = req.params;
  const requesterUid = req.user?.uid;
  if (!requesterUid || requesterUid !== uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const { rows } = await pool.query(
      "SELECT discount_safe FROM founder_safe WHERE uid = $1",
      [uid]
    );
    if (!rows.length || !rows[0]?.discount_safe) {
      return res.status(404).json({ error: "No signature found" });
    }
    return res.json(rows[0].discount_safe);
  } catch (err) {
    console.error("getDiscountSafe error:", err);
    return res.status(500).json({ error: "Failed to fetch Discount SAFE signature", detail: err.message });
  }
};

// POST /founder/:uid/safe/discount/sign
// Write-once setter for founder_safe.discount_safe
exports.saveDiscountSafe = async (req, res) => {
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
      "SELECT id, discount_safe FROM founder_safe WHERE uid = $1",
      [uid]
    );
    if (existing.rowCount > 0 && existing.rows[0]?.discount_safe) {
      return res.status(409).json({ error: "Discount SAFE already signed" });
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
      "UPDATE founder_safe SET discount_safe = $1::jsonb, updated_at = NOW() WHERE uid = $2",
      [JSON.stringify(payload), uid]
    );

    return res.json({ message: "Discount SAFE signature saved", data: payload });
  } catch (err) {
    console.error("saveDiscountSafe error:", err);
    return res.status(500).json({ error: "Failed to save Discount SAFE signature", detail: err.message });
  }
};

