const pool = require("../../db/pool");

// GET Founder Stock Purchase Agreement
exports.getFounderEquityA = async (req, res) => {
  const { uid } = req.params;
  const requesterUid = req.user?.uid;

  if (!requesterUid || requesterUid !== uid)
    return res.status(401).json({ error: "Unauthorized" });

  try {
    const { rows } = await pool.query(
      'SELECT "FSPA_JSON" FROM founder_equity WHERE "UID" = $1',
      [uid]
    );
    if (!rows.length || !rows[0]?.FSPA_JSON)
      return res.status(404).json({ error: "No signature found" });

    return res.json(rows[0].FSPA_JSON);
  } catch (err) {
    console.error("getFounderEquityA error:", err);
    return res.status(500).json({ error: "Failed to fetch FSPA_JSON", detail: err.message });
  }
};

// POST Founder Stock Purchase Agreement
exports.saveFounderEquityA = async (req, res) => {
  const { uid } = req.params;
  const requesterUid = req.user?.uid;
  const { signerName, signerTitle, signerAddress, signature, signedAt } = req.body || {};

  if (!requesterUid || requesterUid !== uid)
    return res.status(401).json({ error: "Unauthorized" });

  if (!signerName || !signerTitle || !signature)
    return res.status(400).json({ error: "Missing required fields" });

  try {
    const existing = await pool.query('SELECT "FSPA_JSON" FROM founder_equity WHERE "UID" = $1', [uid]);
    if (existing.rowCount > 0 && existing.rows[0]?.FSPA_JSON)
      return res.status(409).json({ error: "Already signed" });

    const payload = {
      signed: true,
      signerName,
      signerTitle,
      signerAddress: signerAddress || null,
      signature,
      signedAt: signedAt || new Date().toISOString(),
    };

    if (existing.rowCount === 0)
      await pool.query('INSERT INTO founder_equity ("UID") VALUES ($1)', [uid]);

    await pool.query(
      'UPDATE founder_equity SET "FSPA_JSON" = $1::jsonb WHERE "UID" = $2',
      [JSON.stringify(payload), uid]
    );

    return res.json({ message: "FSPA signature saved", data: payload });
  } catch (err) {
    console.error("saveFounderEquityA error:", err);
    return res.status(500).json({ error: "Failed to save FSPA_JSON", detail: err.message });
  }
};
