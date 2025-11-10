// controllers/founder/founder_noteController.js
const pool = require("../../db/pool");
const { v4: uuidv4 } = require("uuid");
const { beginTransaction, commitTransaction, rollbackTransaction } = require("../../db/transaction");

exports.getNotes = async (req, res) => {
  const { uid } = req.params;
  try {
    const { rows } = await pool.query("SELECT * FROM founder_note WHERE uid = $1", [uid]);
    res.json(rows[0] || {});
  } catch (err) {
    console.error("getNotes error:", err);
    res.status(500).json({ error: "Failed to fetch Notes data", detail: err.message });
  }
};

exports.saveNotes = async (req, res) => {
  const { uid } = req.params;
  const b = req.body || {};
  const client = await beginTransaction();
  try {
    const map = {
      note_total_authorized: "NOTE_TOTAL_AUTHORIZED",
      date_maturity: "DATE_MATURITY",
      interest_rate: "INTEREST_RATE",
      qualified_financing_threshold: "QUALIFIED_FINANCING_THRESHOLD",
      conversion_discount_percent: "CONVERSION_DISCOUNT_PERCENT",
      valuation_cap: "VALUATION_CAP",
      note_pro_rata_enabled: "NOTE_PRO_RATA_ENABLED",
      note_mfn_enabled: "NOTE_MFN_ENABLED",
      amendment_majority_threshold: "AMENDMENT_MAJORITY_THRESHOLD"
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
    const NOTE_TOTAL_AUTHORIZED = b.NOTE_TOTAL_AUTHORIZED !== undefined && b.NOTE_TOTAL_AUTHORIZED !== '' ? Number(b.NOTE_TOTAL_AUTHORIZED) : null;
    const INTEREST_RATE = b.INTEREST_RATE !== undefined && b.INTEREST_RATE !== '' ? Number(b.INTEREST_RATE) : null;
    const QUALIFIED_FINANCING_THRESHOLD = b.QUALIFIED_FINANCING_THRESHOLD !== undefined && b.QUALIFIED_FINANCING_THRESHOLD !== '' ? Number(b.QUALIFIED_FINANCING_THRESHOLD) : null;
    const CONVERSION_DISCOUNT_PERCENT = b.CONVERSION_DISCOUNT_PERCENT !== undefined && b.CONVERSION_DISCOUNT_PERCENT !== '' ? Number(b.CONVERSION_DISCOUNT_PERCENT) : null;
    const VALUATION_CAP = b.VALUATION_CAP !== undefined && b.VALUATION_CAP !== '' ? Number(b.VALUATION_CAP) : null;
    const NOTE_PRO_RATA_ENABLED = Boolean(b.NOTE_PRO_RATA_ENABLED);
    const NOTE_MFN_ENABLED = Boolean(b.NOTE_MFN_ENABLED);
    const AMENDMENT_MAJORITY_THRESHOLD = b.AMENDMENT_MAJORITY_THRESHOLD !== undefined && b.AMENDMENT_MAJORITY_THRESHOLD !== '' ? Number(b.AMENDMENT_MAJORITY_THRESHOLD) : 50;

    // Use INSERT ... ON CONFLICT for a more robust and atomic "upsert" operation.
    // This requires a UNIQUE constraint on the `uid` column in the `founder_note` table.
    await client.query(
      `INSERT INTO founder_note (
         id, uid, "NOTE_TOTAL_AUTHORIZED", "DATE_MATURITY", "INTEREST_RATE",
         "QUALIFIED_FINANCING_THRESHOLD", "CONVERSION_DISCOUNT_PERCENT", "VALUATION_CAP",
         "NOTE_PRO_RATA_ENABLED", "NOTE_MFN_ENABLED", "AMENDMENT_MAJORITY_THRESHOLD",
         created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
       ON CONFLICT (uid) DO UPDATE SET
         "NOTE_TOTAL_AUTHORIZED" = EXCLUDED."NOTE_TOTAL_AUTHORIZED",
         "DATE_MATURITY" = EXCLUDED."DATE_MATURITY",
         "INTEREST_RATE" = EXCLUDED."INTEREST_RATE",
         "QUALIFIED_FINANCING_THRESHOLD" = EXCLUDED."QUALIFIED_FINANCING_THRESHOLD",
         "CONVERSION_DISCOUNT_PERCENT" = EXCLUDED."CONVERSION_DISCOUNT_PERCENT",
         "VALUATION_CAP" = EXCLUDED."VALUATION_CAP",
         "NOTE_PRO_RATA_ENABLED" = EXCLUDED."NOTE_PRO_RATA_ENABLED",
         "NOTE_MFN_ENABLED" = EXCLUDED."NOTE_MFN_ENABLED",
         "AMENDMENT_MAJORITY_THRESHOLD" = EXCLUDED."AMENDMENT_MAJORITY_THRESHOLD",
         updated_at = NOW()`,
      [
        uuidv4(), uid, NOTE_TOTAL_AUTHORIZED, b.DATE_MATURITY || null,
        INTEREST_RATE, QUALIFIED_FINANCING_THRESHOLD, CONVERSION_DISCOUNT_PERCENT,
        VALUATION_CAP, NOTE_PRO_RATA_ENABLED, NOTE_MFN_ENABLED, AMENDMENT_MAJORITY_THRESHOLD
      ]
    );
    await commitTransaction(client);
    res.json({ message: "Notes details saved" });
  } catch (err) {
    await rollbackTransaction(client);
    console.error("saveNotes error:", err, { body: b });
    const detail = {
      message: err?.message || String(err),
      code: err?.code || null,
      constraint: err?.constraint || null,
    };
    res.status(500).json({ error: "Failed to save Notes details", detail });
  }
};