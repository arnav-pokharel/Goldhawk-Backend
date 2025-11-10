const pool = require("../../db/pool");
const { uploadFile, getPrivateUrl } = require("../../services/s3");

function extractKeyFromUrl(raw) {
  try {
    const u = new URL(raw);
    return decodeURIComponent(u.pathname.replace(/^\//, '')) || null;
  } catch (_) {
    try {
      const m = String(raw).match(/^https?:\/\/[^\/]+\/(.*)$/);
      if (m && m[1]) return decodeURIComponent(m[1].split('?')[0]);
    } catch (_) {}
  }
  return null;
}

async function columnExists(table, column) {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return rows.length > 0;
}

async function ensureStep2Row(uid) {
  const { rows } = await pool.query(`SELECT uid FROM founder_step2 WHERE uid = $1 LIMIT 1`, [uid]);
  if (!rows.length) {
    await pool.query(
      `INSERT INTO founder_step2 (uid, created_at, updated_at) VALUES ($1, NOW(), NOW())`,
      [uid]
    );
  }
}

exports.getCompanyDashboard = async (req, res) => {
  const { uid } = req.params;
  if (!uid) return res.status(400).json({ error: "uid required" });

  try {
    const step2Res = await pool.query(`SELECT * FROM founder_step2 WHERE uid = $1`, [uid]);
    const foundersRes = await pool.query(`SELECT * FROM founders WHERE uid = $1`, [uid]);
    const activeLogoRes = await pool.query(`SELECT logo FROM startup_active WHERE uid = $1`, [uid]);
    const foundersCountRes = await pool.query(
      `SELECT MAX(COALESCE(founder_index, 0)) AS max_index FROM founder_step1 WHERE uid = $1`,
      [uid]
    );

    const step2 = step2Res.rows[0] || {};
    const founder = foundersRes.rows[0] || {};
    const foundersCount = Number(foundersCountRes.rows[0]?.max_index || 0);
    let storedLogo = step2.logo_url || activeLogoRes.rows[0]?.logo || null;
    let signedLogo = null;
    if (storedLogo) {
      const key = storedLogo.startsWith('http') ? extractKeyFromUrl(storedLogo) : storedLogo;
      if (key) {
        try { signedLogo = await getPrivateUrl(key, 3600); } catch (_) {}
      }
    }


    return res.json({
      logoUrl: (signedLogo || storedLogo),
      companyName: step2.company_name || step2.company_legal_name || null,
      hqAddress: step2.hq_address || null,
      accNumber: founder.acc_number || founder.account_number || null,
      companyWebsite: step2.company_website || null,
      companyTagline: step2.company_description || null,
      metric_1: step2.metric_1 || null,
      metric_2: step2.metric_2 || null,
      metric_3: step2.metric_3 || null,
      metric_4: step2.metric_4 || null,
      metric_5: step2.metric_5 || null,
      metric_6: step2.metric_6 || null,
      metric_7: step2.metric_7 || null,
      metric_8: step2.metric_8 || null,
      stage: step2.current_round_name || null,
      type: step2.current_round_type || null,
      foundersCount,
      traction: step2.traction || null,
    });
  } catch (err) {
    console.error("getCompanyDashboard error:", err);
    return res.status(500).json({ error: "Failed to load company dashboard" });
  }
};

exports.updateCompanyDashboard = async (req, res) => {
  const { uid } = req.params;
  if (!uid) return res.status(400).json({ error: "uid required" });

  const {
    companyWebsite,
    companyTagline,
    metric_1,
    metric_2,
    metric_3,
    metric_4,
    metric_5,
    metric_6,
    metric_7,
    metric_8,
    traction,
    logoUrl,
  } = req.body || {};

  try {
    await ensureStep2Row(uid);
    // Build dynamic update list only for columns that exist.
    const updates = [];
    const values = [];

    async function addIfExists(column, value) {
      if (value === undefined) return;
      if (await columnExists("founder_step2", column)) {
        updates.push(`${column} = $${values.length + 2}`);
        values.push(value);
      }
    }

    await addIfExists("company_website", companyWebsite ?? null);
    await addIfExists("company_description", companyTagline ?? null);
    await addIfExists("metric_1", metric_1 ?? null);
    await addIfExists("metric_2", metric_2 ?? null);
    await addIfExists("metric_3", metric_3 ?? null);
    await addIfExists("metric_4", metric_4 ?? null);
    await addIfExists("metric_5", metric_5 ?? null);
    await addIfExists("metric_6", metric_6 ?? null);
    await addIfExists("metric_7", metric_7 ?? null);
    await addIfExists("metric_8", metric_8 ?? null);
    await addIfExists("traction", traction ?? null);
    await addIfExists("logo_url", logoUrl ?? null);

    if (updates.length === 0) {
      return res.json({ message: "No updatable fields present" });
    }

    const sql = `UPDATE founder_step2 SET ${updates.join(", ")}, updated_at = NOW() WHERE uid = $1`;
    await pool.query(sql, [uid, ...values]);
    return res.json({ message: "Company dashboard updated" });
  } catch (err) {
    console.error("updateCompanyDashboard error:", err);
    return res.status(500).json({ error: "Failed to update company dashboard" });
  }
};

// Accept a base64 data URL in JSON and upload to S3, then persist URL
exports.updateCompanyLogo = async (req, res) => {
  const { uid } = req.params;
  const { logoDataUrl } = req.body || {};
  if (!uid || !logoDataUrl) return res.status(400).json({ error: "uid and logoDataUrl required" });

  try {
    await ensureStep2Row(uid);
    // Parse data URL
    const match = /^data:(.+);base64,(.*)$/.exec(logoDataUrl);
    if (!match) return res.status(400).json({ error: "Invalid image data" });
    const mime = match[1];
    const base64 = match[2];
    const buffer = Buffer.from(base64, "base64");

    // Use a versioned key to bypass CloudFront caching
    const ext = (mime.split("/")[1] || "png").toLowerCase();
    const key = `founder/${uid}/profile/company_logo_${Date.now()}.${ext}`;
    const put = await uploadFile(buffer, key, mime);
    const url = put.Location;

    // Try to persist in founder_step2.logo_url if present
    try {
      // Best-effort: remove previous logo to avoid orphans
      try {
        const prevRes = await pool.query(`SELECT logo_url FROM founder_step2 WHERE uid = $1`, [uid]);
        const prev = prevRes.rows[0]?.logo_url || null;
        const prevKey = prev ? (prev.startsWith('http') ? extractKeyFromUrl(prev) : prev) : null;
        if (prevKey && prevKey !== key) {
          const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
          const { s3Client } = require("../../services/s3");
          try { await s3Client.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET_NAME, Key: prevKey })); } catch (_) {}
        }
      } catch (_) {}
      if (await columnExists("founder_step2", "logo_url")) {
        await pool.query(
          `UPDATE founder_step2 SET logo_url = $2, updated_at = NOW() WHERE uid = $1`,
          [uid, url]
        );
      }
      // Also try startup_active.logo if present
      if (await columnExists("startup_active", "logo")) {
        await pool.query(
          `UPDATE startup_active SET logo = $2 WHERE uid = $1`,
          [uid, url]
        );
      }
    } catch (e) {
      console.warn("Logo URL persistence skipped:", e?.message || e);
    }

    let signedUrl = null;
    try { signedUrl = await getPrivateUrl(key, 3600); } catch (_) {}
    return res.json({ message: "Logo updated", url, signedUrl });
  } catch (err) {
    console.error("updateCompanyLogo error:", err);
    return res.status(500).json({ error: "Failed to update logo" });
  }
};
