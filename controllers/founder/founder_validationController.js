const { v4: uuidv4 } = require("uuid");
const pool = require("../../db/pool");

// Check whether a table exists in the current DB
async function tableExists(tableName) {
  try {
    const q = await pool.query("SELECT to_regclass($1) AS reg", [tableName]);
    return !!(q.rows[0] && q.rows[0].reg);
  } catch (e) {
    console.warn("tableExists check failed:", e?.message || e);
    return false;
  }
}

//
//  SAVE validation data (DDE / Access)
//
exports.saveValidationData = async (req, res) => {
  const { uid, type, data } = req.body;
  if (!uid || !type || !data) {
    return res.status(400).json({ error: "uid, type, and data required" });
  }

  const validTypes = ["DDE", "Access"];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: "Invalid type. Must be 'DDE' or 'Access'" });
  }

  try {
    // If the optional legacy table doesn't exist, return a safe success so callers don't receive 500s.
    const existsTable = await tableExists('validation_data');
    if (!existsTable) {
      console.warn('validation_data table not present; skipping persistence for', uid, type);
      return res.status(201).json({ message: `${type} validation saved (skipped: table missing)` });
    }
    const exists = await pool.query(
      "SELECT * FROM validation_data WHERE uid = $1 AND type = $2",
      [uid, type]
    );

    if (exists.rows.length > 0) {
      await pool.query(
        "UPDATE validation_data SET data = $1, updated_at = NOW() WHERE uid = $2 AND type = $3",
        [data, uid, type]
      );
    } else {
      await pool.query(
        "INSERT INTO validation_data (uid, type, data, created_at, updated_at) VALUES ($1, $2, $3, NOW(), NOW())",
        [uid, type, data]
      );
    }

    res.status(201).json({ message: `${type} validation saved` });
  } catch (err) {
    console.error("Validation save error:", err);
    res.status(500).json({ error: "Could not save validation data" });
  }
};

//
//  GENERATE validation report (mock AI summary)
//
exports.generateValidationReport = async (req, res) => {
  const { uid } = req.body;
  if (!uid) {
    return res.status(400).json({ error: "UID is required" });
  }

  try {
    // Fetch existing data
    const profiles = await pool.query("SELECT * FROM founder_profiles WHERE uid = $1", [uid]);
    // validation_data may not exist on all deployments; fall back to empty
    let validations;
    try {
      validations = await pool.query("SELECT * FROM validation_data WHERE uid = $1", [uid]);
    } catch (e) {
      if (e.code === '42P01') {
        // undefined_table
        validations = { rows: [] };
      } else throw e;
    }
    const pitch = await pool.query("SELECT * FROM pitch_files WHERE uid = $1", [uid]);

    // Reshape data
    const profileData = Object.fromEntries(profiles.rows.map((p) => [p.file_type, p.data]));
    const validationData = Object.fromEntries(validations.rows.map((v) => [v.type, v.data]));
    const pitchData = Object.fromEntries(pitch.rows.map((p) => [p.file_name, p.s3_url]));

    // Build report
    const report = {
      profile: profileData,
      validation: validationData,
      pitch: pitchData,
      summary:
        "AI analysis mock summary: Founder is promising based on team, IP ownership, and pitch strength.",
    };

    // Upsert into validation_reports
    const exists = await pool.query("SELECT uid FROM validation_reports WHERE uid = $1", [uid]);
    if (exists.rows.length > 0) {
      await pool.query(
        "UPDATE validation_reports SET report = $1, updated_at = NOW() WHERE uid = $2",
        [report, uid]
      );
    } else {
      await pool.query(
        "INSERT INTO validation_reports (uid, report, created_at, updated_at) VALUES ($1, $2, NOW(), NOW())",
        [uid, report]
      );
    }

    res.status(200).json({ message: "Validation report generated", summary: report.summary });
  } catch (err) {
    console.error("Report generation failed:", err);
    res.status(500).json({ error: "Failed to generate report", details: err.message });
  }
};

//
//  GET validation data by type
//
exports.getValidationByType = async (req, res) => {
  const { uid, type } = req.query;

  if (!uid || !type) {
    return res.status(400).json({ error: "uid and type required" });
  }

  try {
    // If the legacy table isn't present, return a safe empty shape instead of a 500
    const existsTable = await tableExists('validation_data');
    if (!existsTable) {
      return res.json({ data: null });
    }

    const result = await pool.query("SELECT * FROM validation_data WHERE uid = $1 AND type = $2", [uid, type]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Validation data not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Validation fetch error:", err);
    res.status(500).json({ error: "Could not fetch validation data" });
  }
};


//
//  GET validation progress snapshot
//
exports.getValidationProgress = async (req, res) => {
  const { uid } = req.params;

  if (!uid) {
    return res.status(400).json({ error: "uid required" });
  }

  try {
    console.log("Fetching validation progress for uid:", uid);

    console.log("Querying founder_step3...");
    const step3Res = await pool.query("SELECT overview_doc_url FROM founder_step3 WHERE uid = $1 ORDER BY updated_at DESC NULLS LAST LIMIT 1", [uid]);
    console.log("founder_step3 query successful.");

    console.log("Checking if founder_validate table exists...");
    const validateTableExists = await tableExists('founder_validate');
    console.log("founder_validate table exists:", validateTableExists);

    console.log("Checking if founder_validation_access table exists...");
    const accessTableExists = await tableExists('founder_validation_access');
    console.log("founder_validation_access table exists:", accessTableExists);

    let validateRow = null;
    if (validateTableExists) {
      console.log("Querying founder_validate...");
      const validateRes = await pool.query("SELECT * FROM founder_validate WHERE uid = $1 ORDER BY updated_at DESC NULLS LAST LIMIT 1", [uid]);
      console.log("founder_validate query successful.");
      validateRow = validateRes.rows[0] || null;
    }

    const step3Row = step3Res.rows[0] || null;

    let derivedTechAcc = validateRow?.tech_acc ?? validateRow?.tech_access ?? null;
    let derivedBizAcc = validateRow?.business_access ?? validateRow?.business_acc ?? null;
    if ((derivedTechAcc == null || derivedBizAcc == null) && accessTableExists) {
      try {
        console.log("Querying founder_validation_access...");
        const acc = await pool.query(
          "SELECT access_sc, access_cicd, access_fe, access_be, access_db FROM founder_validation_access WHERE uid = $1 LIMIT 1",
          [uid]
        );
        console.log("founder_validation_access query successful.");
        if (acc.rows.length > 0) {
          const a = acc.rows[0] || {};
          const anyAccess = !!(a.access_sc || a.access_cicd || a.access_fe || a.access_be || a.access_db);
          if (derivedTechAcc == null && anyAccess) derivedTechAcc = true;
          if (derivedBizAcc == null && anyAccess) derivedBizAcc = true;
        }
      } catch (e) {
        console.error("Fallback access check failed:", e);
      }
    }

    const progress = {
      overview_doc_url: step3Row?.overview_doc_url ?? validateRow?.overview_doc_url ?? null,
      overview_kp: validateRow?.overview_kp ?? null,
      ad_tech: validateRow?.ad_tech ?? null,
      ad_business: validateRow?.ad_business ?? null,
      tech_dde: validateRow?.tech_dde ?? validateRow?.tech_kp ?? null,
      business_dde: validateRow?.business_dde ?? validateRow?.business_kp ?? null,
      tech_acc: derivedTechAcc,
      business_access: derivedBizAcc,
    };

    console.log("Returning progress data:", progress);
    return res.json({ data: progress });
  } catch (err) {
    console.error("Validation progress fetch error:", err);
    return res.status(500).json({ error: "Could not fetch validation progress" });
  }
};
