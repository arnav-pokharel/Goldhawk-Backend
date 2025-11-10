const pool = require("../../db/pool");

const beginTransaction = async () => { const c = await pool.connect(); await c.query("BEGIN"); return c; };
const commitTransaction = async (c) => { await c.query("COMMIT"); c.release(); };
const rollbackTransaction = async (c) => { await c.query("ROLLBACK"); c.release(); };

// ---- STEP 1 ----
exports.getStep1 = async (req, res) => {
  const { uid } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT id, uid, founder_index,
              founder_full_name AS "FOUNDER_FULL_NAME",
              founder_title     AS "FOUNDER_TITLE",
              founder_email     AS "FOUNDER_EMAIL",
              founder_number    AS "FOUNDER_NUMBER",
              founder_address   AS "FOUNDER_ADDRESS",
              founder_city      AS "FOUNDER_CITY",
              founder_state     AS "FOUNDER_STATE",
              founder_country   AS "FOUNDER_COUNTRY",
              founder_zip       AS "FOUNDER_ZIP",
              founder_linkedin  AS "FOUNDER_LINKEDIN",
              founder_picture   AS "FOUNDER_PICTURE",
              founder_education AS "FOUNDER_EDUCATION",
              founder_bio       AS "FOUNDER_BIO"
       FROM founder_step1 WHERE uid = $1 ORDER BY founder_index ASC`,
      [uid]
    );
    return res.json(rows || []);
  } catch (err) {
    console.error("getStep1 error:", err);
    return res.json([]); // 👈 safe default
  }
};


const { v4: uuidv4 } = require("uuid");

exports.createStep1 = async (req, res) => {
  const { uid } = req.params;
  const { founder_index, FOUNDER_FULL_NAME, FOUNDER_TITLE, FOUNDER_EMAIL,
          FOUNDER_NUMBER, FOUNDER_ADDRESS, FOUNDER_CITY, FOUNDER_STATE, FOUNDER_COUNTRY, FOUNDER_ZIP,
          FOUNDER_LINKEDIN, FOUNDER_EDUCATION, FOUNDER_BIO, FOUNDER_PICTURE } = req.body;

  const c = await beginTransaction();
  try {
    const r = await c.query(
      `INSERT INTO founder_step1
       (id, uid, founder_index, founder_full_name, founder_title, founder_email,
        founder_number, founder_address, founder_city, founder_state, founder_country, founder_zip, founder_linkedin,
        founder_education, founder_bio, founder_picture, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW(),NOW())
       RETURNING id`,
      [uuidv4(), uid, founder_index || 1, FOUNDER_FULL_NAME, FOUNDER_TITLE, FOUNDER_EMAIL,
       FOUNDER_NUMBER, FOUNDER_ADDRESS || "", FOUNDER_CITY || "", FOUNDER_STATE || "", FOUNDER_COUNTRY || "", FOUNDER_ZIP || "",
       FOUNDER_LINKEDIN || "", FOUNDER_EDUCATION || "", FOUNDER_BIO || "", FOUNDER_PICTURE || ""]
    );
    await c.query("UPDATE founders SET step1 = true, updated_at = NOW() WHERE uid = $1", [uid]);
    await commitTransaction(c);
    res.status(201).json({ id: r.rows[0].id, message: "Step 1 saved" });
  } catch (err) {
    await rollbackTransaction(c);
    console.error("createStep1 error:", err);
    res.status(500).json({ error: "Failed to save step 1", detail: err?.message });
  }
};

exports.updateStep1 = async (req, res) => {
  const { uid, id } = req.params;
  const updates = req.body;
  const map = {
    founder_index: "founder_index",
    FOUNDER_FULL_NAME: "founder_full_name",
    FOUNDER_TITLE: "founder_title",
    FOUNDER_EMAIL: "founder_email",
    FOUNDER_NUMBER: "founder_number",
    FOUNDER_ADDRESS: "founder_address",
    FOUNDER_CITY: "founder_city",
    FOUNDER_STATE: "founder_state",
    FOUNDER_COUNTRY: "founder_country",
    FOUNDER_ZIP: "founder_zip",
    FOUNDER_LINKEDIN: "founder_linkedin",
    FOUNDER_EDUCATION: "founder_education",
    FOUNDER_BIO: "founder_bio",
    FOUNDER_PICTURE: "founder_picture",
  };
  const c = await beginTransaction();
  try {
    const fields = [], values = [];
    let i = 1;
    for (const key in map) {
      if (updates[key] !== undefined) {
        fields.push(`${map[key]} = $${i++}`);
        values.push(updates[key]);
      }
    }
    if (fields.length === 0) {
      await rollbackTransaction(c);
      return res.status(400).json({ error: "No valid fields" });
    }
    values.push(uid, id);
    const q = `UPDATE founder_step1 SET ${fields.join(", ")}, updated_at = NOW()
               WHERE uid = $${i++} AND id = $${i++} RETURNING id`;
    const r = await c.query(q, values);
    if (r.rowCount === 0) {
      await rollbackTransaction(c);
      return res.status(404).json({ error: "Not found" });
    }
    await c.query("UPDATE founders SET step1 = true, updated_at = NOW() WHERE uid = $1", [uid]);
    await commitTransaction(c);
    res.json({ message: "Step 1 updated", id });
  } catch (err) {
    await rollbackTransaction(c);
    console.error("updateStep1 error:", err);
    res.status(500).json({ error: "Failed to update step 1" });
  }
};

exports.deleteStep1 = async (req, res) => {
  const { uid, id } = req.params;
  try {
    const r = await pool.query("DELETE FROM founder_step1 WHERE uid = $1 AND id = $2", [uid, id]);
    if (r.rowCount === 0) return res.status(404).json({ error: "Not found" });
    res.json({ message: "Step 1 entry deleted" });
  } catch (err) {
    console.error("deleteStep1 error:", err);
    res.status(500).json({ error: "Failed to delete step 1" });
  }
};
