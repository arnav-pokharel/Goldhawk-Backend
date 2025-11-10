const pool = require("../../db/pool");
const beginTransaction = async () => { const c = await pool.connect(); await c.query("BEGIN"); return c; };
const commitTransaction = async (c) => { await c.query("COMMIT"); c.release(); };
const rollbackTransaction = async (c) => { await c.query("ROLLBACK"); c.release(); };

// ---- STEP 2 ----
exports.getStep2 = async (req, res) => {
  const { uid } = req.params;
  try {
    const { rows } = await pool.query(
    `SELECT
      company_name               AS "COMPANY_LEGAL_NAME",
         company_website            AS "COMPANY_WEBSITE",
         company_incorporation_date AS "COMPANY_INCORPORATION_DATE",
         company_state_incorporated AS "COMPANY_STATE_INCORPORATED",
         company_industry           AS "COMPANY_INDUSTRY",
         company_description        AS "COMPANY_DESCRIPTION",
         hq_address                 AS "HQ_ADDRESS",
         has_prior_rounds_yn        AS "HAS_PRIOR_ROUNDS_YN",
         prior_round_count          AS "PRIOR_ROUND_COUNT",
         rounds                     AS "ROUNDS"
       FROM founder_step2 WHERE uid = $1`,
      [uid]
    );

    const row = rows[0] || {};
    let rounds = [];
    try {
      if (Array.isArray(row.ROUNDS)) rounds = row.ROUNDS;
      else if (row.ROUNDS) rounds = typeof row.ROUNDS === "string" ? JSON.parse(row.ROUNDS) : row.ROUNDS;
      if (!Array.isArray(rounds)) rounds = [];
    } catch (e) {
      console.warn("Failed to parse ROUNDS for step2, falling back to empty array", e);
      rounds = [];
    }

    return res.json({
      COMPANY_LEGAL_NAME: row.COMPANY_LEGAL_NAME ?? null,
      COMPANY_WEBSITE: row.COMPANY_WEBSITE || null,
      COMPANY_INCORPORATION_DATE: row.COMPANY_INCORPORATION_DATE || null,
      COMPANY_STATE_INCORPORATED: row.COMPANY_STATE_INCORPORATED || null,
      COMPANY_INDUSTRY: row.COMPANY_INDUSTRY || null,
      COMPANY_DESCRIPTION: row.COMPANY_DESCRIPTION || null,
      HQ_ADDRESS: row.HQ_ADDRESS || null,
      HAS_PRIOR_ROUNDS_YN: !!row.HAS_PRIOR_ROUNDS_YN,
      PRIOR_ROUND_COUNT: Number(row.PRIOR_ROUND_COUNT || 0),
      ROUNDS: rounds,
    });
  } catch (err) {
    console.error("getStep2 error:", err);
    return res.json({ COMPANY_LEGAL_NAME: null, HAS_PRIOR_ROUNDS_YN: false, PRIOR_ROUND_COUNT: 0, ROUNDS: [] });
  }
};


exports.saveStep2 = async (req, res) => {
  const { uid } = req.params;
  // Ensure hq_address column exists (dynamic migration)
  try {
    await pool.query(
      `ALTER TABLE founder_step2 ADD COLUMN IF NOT EXISTS hq_address TEXT`
    );
  } catch (mErr) {
    console.warn("Could not ensure hq_address column exists:", mErr);
  }
  // accept both uppercase (from API) and lowercase (from front-end) payload keys
  const {
    COMPANY_LEGAL_NAME,
    COMPANY_WEBSITE,
    COMPANY_INCORPORATION_DATE,
    COMPANY_STATE_INCORPORATED,
    COMPANY_INDUSTRY,
    COMPANY_DESCRIPTION,
    HQ_ADDRESS,
    HAS_PRIOR_ROUNDS_YN,
    PRIOR_ROUND_COUNT,
    ROUNDS,
    company_name,
    company_website,
    company_incorporation_date,
    company_state_incorporated,
    company_industry,
    company_description,
    hq_address,
    has_prior_rounds_yn,
    prior_round_count
  } = req.body;
  // prioritize uppercase keys, fallback to lowercase
  const nameToSave = COMPANY_LEGAL_NAME ?? company_name;
  const websiteToSave = COMPANY_WEBSITE ?? company_website;
  const incorpDateToSave = COMPANY_INCORPORATION_DATE ?? company_incorporation_date;
  const stateToSave = COMPANY_STATE_INCORPORATED ?? company_state_incorporated;
  const industryToSave = COMPANY_INDUSTRY ?? company_industry;
  const descriptionToSave = COMPANY_DESCRIPTION ?? company_description;
  const hqToSave = HQ_ADDRESS ?? hq_address;
  const roundsFlag = HAS_PRIOR_ROUNDS_YN ?? has_prior_rounds_yn;
  const roundCount = PRIOR_ROUND_COUNT ?? prior_round_count;
  const c = await beginTransaction();
  try {
    // Try update first (works without requiring a UNIQUE index on uid)
  const update = await c.query(
      `UPDATE founder_step2
     SET company_name               = $2,
       company_website              = $3,
       company_incorporation_date   = $4,
       company_state_incorporated   = $5,
       company_industry             = $6,
       company_description          = $7,
       hq_address                   = $8,
       has_prior_rounds_yn          = $9,
       prior_round_count            = $10,
       rounds                       = $11,
             updated_at                   = NOW()
       WHERE uid = $1`,
        [
          uid,
          nameToSave,
          websiteToSave,
          incorpDateToSave,
          stateToSave,
          industryToSave,
          descriptionToSave,
          hqToSave,
          roundsFlag,
          roundCount,
          JSON.stringify(ROUNDS || [])
        ]
    );

    console.log("Received payload:", req.body); // Debugging input
    console.log("SQL Parameters:", [
      uid,
      nameToSave,
      websiteToSave,
      incorpDateToSave,
      stateToSave,
      industryToSave,
      descriptionToSave,
      hqToSave,
      roundsFlag,
      roundCount,
      JSON.stringify(ROUNDS || [])
    ]); // Debugging SQL parameters

    if (update.rowCount === 0) {
      await c.query(
        `INSERT INTO founder_step2 (
           uid,
           company_name,
           company_website,
           company_incorporation_date,
           company_state_incorporated,
           company_industry,
           company_description,
           hq_address,
           has_prior_rounds_yn,
           prior_round_count,
           rounds,
           created_at,
           updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())`,
        [
          uid,
          nameToSave,
          websiteToSave,
          incorpDateToSave,
          stateToSave,
          industryToSave,
          descriptionToSave,
          hqToSave,
          roundsFlag,
          roundCount,
          JSON.stringify(ROUNDS || [])
        ]
      );
    }

    await c.query("UPDATE founders SET step2 = true, updated_at = NOW() WHERE uid = $1", [uid]);
    await commitTransaction(c);
    res.json({ message: "Step 2 saved" });
  } catch (err) {
    await rollbackTransaction(c);
    console.error("saveStep2 error:", err);
    res.status(500).json({ error: "Failed to save step 2" });
  }
};
