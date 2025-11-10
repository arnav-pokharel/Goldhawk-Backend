const pool = require("../../db/pool");

/**
 * Save founder or investor signature into discount_safe JSON column
 */
exports.saveFounderSignature = async (req, res) => {
  const { founderId, signature, role } = req.body;

  if (!founderId || !signature || !role) {
    return res.status(400).json({ error: "Missing founderId, signature, or role" });
  }

  // Decide which key to update inside discount_safe JSON
  const key = role === "INVESTOR" ? "investorSignature" : "founderSignature";

  try {
    await pool.query(
      `
      UPDATE founder_safe
      SET discount_safe = jsonb_set(
        COALESCE(discount_safe, '{}'::jsonb),
        $1,
        $2::jsonb,
        true
      )
      WHERE founder_id = $3
      `,
      [`{${key}}`, JSON.stringify(signature), founderId]
    );

    res.json({ success: true, message: `${role} signature saved successfully` });
  } catch (err) {
    console.error("Error saving signature:", err);
    res.status(500).json({ error: "Failed to save signature" });
  }
};
