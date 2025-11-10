// controllers/founder/founder_submitController.js
const pool = require("../../db/pool");

exports.finalizeOnboarding = async (req, res) => {
  const { uid } = req.params;
  if (!uid) return res.status(400).json({ error: "UID required" });

  try {
    // Verify all previous steps are flagged as complete
    const r = await pool.query(
      `SELECT COALESCE(step1,false) AS step1,
              COALESCE(step2,false) AS step2,
              COALESCE(step3,false) AS step3
       FROM founders WHERE uid = $1::uuid`,
      [uid]
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ error: "Founder not found" });
    }

    const { step1, step2, step3 } = r.rows[0];
    if (!step1 || !step2 || !step3) {
      return res.status(400).json({ error: "All onboarding steps must be complete before submitting." });
    }

    return res.json({ message: "Founder onboarding submitted successfully." });
  } catch (err) {
    console.error("finalizeOnboarding error:", err);
    return res.status(500).json({ error: "Failed to finalize onboarding" });
  }
};
