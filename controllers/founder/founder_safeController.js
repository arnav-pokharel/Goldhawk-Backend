// controllers/founder/founder_safeController.js
const pool = require("../../db/pool");
const { v4: uuidv4 } = require("uuid");
const { beginTransaction, commitTransaction, rollbackTransaction } = require("../../db/transaction");

exports.getSafe = async (req, res) => {
  const { uid } = req.params;
  try {
    const { rows } = await pool.query("SELECT * FROM founder_safe WHERE uid = $1", [uid]);
    res.json(rows[0] || {});
  } catch (err) {
    console.error("getSafe error:", err);
    res.status(500).json({ error: "Failed to fetch SAFE data", detail: err.message });
  }
};

exports.saveSafe = async (req, res) => {
  const { uid } = req.params;
  const b = req.body || {};
  const client = await beginTransaction();
  try {
    const map = {
      safe_form: "SAFE_FORM",
      safe_total_authorized: "SAFE_TOTAL_AUTHORIZED",
      post_money_valuation: "POST_MONEY_VALUATION",
      discount_rate: "DISCOUNT_RATE",
      pro_rata_enabled: "PRO_RATA_ENABLED",
      safe_form_flex: "SAFE_FORM_FLEX"
    };
    Object.keys(map).forEach(k => {
      if (b[k] !== undefined) b[map[k]] = b[k];
    });
    
    // Ensure a founders row exists before we attempt to update/insert dependent rows.
    const fcheck = await client.query('SELECT uid FROM founders WHERE uid = $1', [uid]);
    if (fcheck.rowCount === 0) {
      await rollbackTransaction(client);
      return res.status(404).json({ error: 'Founder not found. Please sign up first.' });
    }
    // Coerce numeric fields to numbers or null to avoid DB type errors
    const SAFE_TOTAL_AUTHORIZED = b.SAFE_TOTAL_AUTHORIZED !== undefined && b.SAFE_TOTAL_AUTHORIZED !== '' ? Number(b.SAFE_TOTAL_AUTHORIZED) : null;
    const POST_MONEY_VALUATION = b.POST_MONEY_VALUATION !== undefined && b.POST_MONEY_VALUATION !== '' ? Number(b.POST_MONEY_VALUATION) : null;
    const DISCOUNT_RATE = b.DISCOUNT_RATE !== undefined && b.DISCOUNT_RATE !== '' ? Number(b.DISCOUNT_RATE) : null;
    const SAFE_FORM_FLEX = Boolean(b.SAFE_FORM_FLEX);
    const PRO_RATA_ENABLED = Boolean(b.PRO_RATA_ENABLED);
    
    // Use INSERT ... ON CONFLICT for a more robust and atomic "upsert" operation.
    // This requires a UNIQUE constraint on the `uid` column in the `founder_safe` table.
    await client.query(
      `INSERT INTO founder_safe (
         id, uid, "SAFE_TOTAL_AUTHORIZED", "SAFE_FORM", "SAFE_FORM_FLEX",
         "POST_MONEY_VALUATION", "DISCOUNT_RATE", "PRO_RATA_ENABLED",
         created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       ON CONFLICT (uid) DO UPDATE SET
         "SAFE_TOTAL_AUTHORIZED" = EXCLUDED."SAFE_TOTAL_AUTHORIZED",
         "SAFE_FORM" = EXCLUDED."SAFE_FORM",
         "SAFE_FORM_FLEX" = EXCLUDED."SAFE_FORM_FLEX",
         "POST_MONEY_VALUATION" = EXCLUDED."POST_MONEY_VALUATION",
         "DISCOUNT_RATE" = EXCLUDED."DISCOUNT_RATE",
         "PRO_RATA_ENABLED" = EXCLUDED."PRO_RATA_ENABLED",
         updated_at = NOW()`,
      [
        uuidv4(), uid, SAFE_TOTAL_AUTHORIZED, b.SAFE_FORM || null, 
        SAFE_FORM_FLEX, POST_MONEY_VALUATION, DISCOUNT_RATE, PRO_RATA_ENABLED
      ]
    );
    await commitTransaction(client);
    res.json({ message: "SAFE details saved" });
  } catch (err) {
    await rollbackTransaction(client);
    console.error("saveSafe error:", err, { body: b });
    const detail = {
      message: err?.message || String(err),
      code: err?.code || null,
      constraint: err?.constraint || null,
    };
    res.status(500).json({ error: "Failed to save SAFE details", detail });
  }
};

exports.saveDiscountSafeSignature = async (req, res) => {
  const { uid } = req.params; // founder uid
  const { signatureData } = req.body;

  if (!signatureData || !signatureData.name || !signatureData.signature) {
    return res.status(400).json({ error: "Invalid signature data" });
  }

  try {
    await pool.query(
      `UPDATE founder_safe
       SET discount_safe = $1
       WHERE uid = $2`,
      [signatureData, uid]
    );

    res.json({ success: true, message: "Signature saved successfully" });
  } catch (err) {
    console.error("Error saving discount_safe:", err);
    res.status(500).json({ error: "Failed to save signature" });
  }
};