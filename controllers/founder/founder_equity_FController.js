const pool = require("../../db/pool");

exports.getFounderEquityF = async (req, res) => {
  const { uid } = req.params;
  const requesterUid = req.user?.uid;
  if (!requesterUid || requesterUid !== uid)
    return res.status(401).json({ error: "Unauthorized" });
  try {
    const { rows } = await pool.query(
      'SELECT "BOARD_CONSENT_JSON" FROM founder_equity WHERE "UID" = $1',
      [uid]
    );
    if (!rows.length || !rows[0]?.BOARD_CONSENT_JSON)
      return res.status(404).json({ error: "No signature found" });
    res.json(rows[0].BOARD_CONSENT_JSON);
  } catch (err) {
    console.error("getFounderEquityF error:", err);
    res.status(500).json({ error: "Failed to fetch BOARD_CONSENT_JSON", detail: err.message });
  }
};

exports.saveFounderEquityF = async (req, res) => {
  const { uid } = req.params;
  const requesterUid = req.user?.uid;
  const { signerName, signerTitle, signerAddress, signature, signedAt } = req.body || {};
  if (!requesterUid || requesterUid !== uid)
    return res.status(401).json({ error: "Unauthorized" });
  if (!signerName || !signerTitle || !signature)
    return res.status(400).json({ error: "Missing required fields" });
  try {
    const existing = await pool.query('SELECT "BOARD_CONSENT_JSON" FROM founder_equity WHERE "UID" = $1', [uid]);
    if (existing.rowCount > 0 && existing.rows[0]?.BOARD_CONSENT_JSON)
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
      'UPDATE founder_equity SET "BOARD_CONSENT_JSON" = $1::jsonb WHERE "UID" = $2',
      [JSON.stringify(payload), uid]
    );
    res.json({ message: "BOARD_CONSENT signature saved", data: payload });
  } catch (err) {
    console.error("saveFounderEquityF error:", err);
    res.status(500).json({ error: "Failed to save BOARD_CONSENT_JSON", detail: err.message });
  }
};
