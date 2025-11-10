const pool = require("../../db/pool");
const { v4: uuidv4 } = require("uuid");

// GET /founder/:uid/safe/valuation-cap
// Returns founder_safe.valuation_cap_safe JSON (signature payload)
exports.getValuationCapSafe = async (req, res) => {
  const { uid } = req.params;
  const requesterUid = req.user?.uid;
  if (!requesterUid || requesterUid !== uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const { rows } = await pool.query(
      "SELECT valuation_cap_safe FROM founder_safe WHERE uid = $1",
      [uid]
    );
    if (!rows.length || !rows[0]?.valuation_cap_safe) {
      return res.status(404).json({ error: "No signature found" });
    }
    return res.json(rows[0].valuation_cap_safe);
  } catch (err) {
    console.error("getValuationCapSafe error:", err);
    return res.status(500).json({ error: "Failed to fetch Valuation Cap SAFE signature", detail: err.message });
  }
};

// POST /founder/:uid/safe/valuation-cap/sign
// Write-once setter for founder_safe.valuation_cap_safe
exports.saveValuationCapSafe = async (req, res) => {
  const { uid } = req.params;
  const requesterUid = req.user?.uid;
  if (!requesterUid || requesterUid !== uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { signerName, signerTitle, signerAddress, signature, signedAt } = req.body || {};

  if (!signerName || !signerTitle || !signature) {
    return res.status(400).json({ error: "Missing required fields: signerName, signerTitle, signature", received: req.body });
  }

  try {
    // Ensure founder exists
    const f = await pool.query("SELECT uid FROM founders WHERE uid = $1", [uid]);
    if (f.rowCount === 0) return res.status(404).json({ error: "Founder not found" });

    // Check write-once policy
    const existing = await pool.query(
      "SELECT id, valuation_cap_safe FROM founder_safe WHERE uid = $1",
      [uid]
    );
    if (existing.rowCount > 0 && existing.rows[0]?.valuation_cap_safe) {
      // Return 409 with the existing payload so frontend can display the stored signature
      try {
        const existingPayload = existing.rows[0].valuation_cap_safe;
        return res.status(409).json({ error: "Valuation Cap SAFE already signed", existing: existingPayload });
      } catch (e) {
        return res.status(409).json({ error: "Valuation Cap SAFE already signed" });
      }
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
        "UPDATE founder_safe SET valuation_cap_safe = $1::jsonb, updated_at = NOW() WHERE uid = $2",
        [JSON.stringify(payload), uid]
      );
    } catch (e) {
      // If column doesn't exist (e.g., DB not migrated yet), create it then retry once
      const message = e?.message || "";
      if (message.includes("column \"valuation_cap_safe\" does not exist") || message.includes("valuation_cap_safe")) {
        try {
          await pool.query("ALTER TABLE founder_safe ADD COLUMN IF NOT EXISTS valuation_cap_safe jsonb");
          await pool.query(
            "UPDATE founder_safe SET valuation_cap_safe = $1::jsonb, updated_at = NOW() WHERE uid = $2",
            [JSON.stringify(payload), uid]
          );
        } catch (innerErr) {
          console.error("Failed to add valuation_cap_safe column or update after adding:", innerErr);
          return res.status(500).json({ error: "Failed to save Valuation Cap SAFE signature (migrate)", detail: innerErr.message });
        }
      } else {
        throw e;
      }
    }

    return res.json({ message: "Valuation Cap SAFE signature saved", data: payload });
  } catch (err) {
    console.error("saveValuationCapSafe error:", err);
    return res.status(500).json({ error: "Failed to save Valuation Cap SAFE signature", detail: err.message });
  }
};
