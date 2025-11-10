const { v4: uuidv4 } = require("uuid");
const pool = require("../../db/pool");
const s3 = require("../../services/s3");

function extractKey(stored) {
  if (!stored) return null;
  try {
    if (/^https?:\/\//i.test(stored)) {
      const u = new URL(stored);
      return decodeURIComponent(u.pathname.replace(/^\/+/, ""));
    }
  } catch (_) {}
  return String(stored);
}

//
// 🏢 SAVE or UPDATE company profile
//
exports.saveCompanyProfile = async (req, res) => {
  const { uid, company } = req.body;

  if (!uid || !company) {
    return res.status(400).json({ error: "uid and company data required" });
  }

  try {
    const exists = await pool.query("SELECT uid FROM company_profiles WHERE uid = $1", [uid]);

    if (exists.rows.length > 0) {
      await pool.query(
        `UPDATE company_profiles
         SET company = $1, updated_at = NOW()
         WHERE uid = $2`,
        [company, uid]
      );
      return res.json({ message: "Company profile updated" });
    } else {
      await pool.query(
        `INSERT INTO company_profiles (id, uid, company, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())`,
        [uuidv4(), uid, company]
      );
      return res.status(201).json({ message: "Company profile created" });
    }
  } catch (err) {
    console.error("Error saving company profile:", err);
    return res.status(500).json({ error: "Could not save company profile" });
  }
};

//
// 🏢 GET company profile by UID
//
exports.getCompanyProfile = async (req, res) => {
  const { uid } = req.query;
  if (!uid) return res.status(400).json({ error: "uid required" });

  try {
    const result = await pool.query("SELECT * FROM company_profiles WHERE uid = $1", [uid]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Company profile not found" });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching company profile:", err);
    return res.status(500).json({ error: "Could not fetch company profile" });
  }
};

// GET /founder/:uid/company-dashboard
exports.getCompanyDashboard = async (req, res) => {
  try {
    const uid = req.params.uid;
    if (!uid) return res.status(400).json({ error: 'uid required' });

    // founders: acc_number
    const f = await pool.query('SELECT acc_number FROM founders WHERE uid = $1', [uid]);
    const accNumber = f.rows[0]?.acc_number || '';

    // founder_step2: company core info
    const s2 = await pool.query(
      `SELECT company_name, hq_address, company_website, company_description, logo_url,
              metric_1, metric_2, metric_3, metric_4, metric_5, metric_6, metric_7, metric_8,
              traction, current_round_type, company_industry
       FROM founder_step2 WHERE uid = $1 LIMIT 1`,
      [uid]
    );
    const row = s2.rows[0] || {};

    // founders count from founder_step1
    const c1 = await pool.query('SELECT COUNT(1) AS c FROM founder_step1 WHERE uid = $1', [uid]);
    const foundersCount = Number(c1.rows[0]?.c || 0);

    // Resolve logo URL (prefer signed private URL)
    let logoUrl = row.logo_url || null;
    const key = extractKey(logoUrl);
    if (key) {
      try { logoUrl = await s3.getPrivateUrl(key, 3600); } catch (_) {}
    }

    return res.json({
      logoUrl,
      companyName: row.company_name || '',
      hqAddress: row.hq_address || '',
      accNumber,
      companyWebsite: row.company_website || '',
      companyTagline: row.company_description || '',
      metric_1: row.metric_1 || '',
      metric_2: row.metric_2 || '',
      metric_3: row.metric_3 || '',
      metric_4: row.metric_4 || '',
      metric_5: row.metric_5 || '',
      metric_6: row.metric_6 || '',
      metric_7: row.metric_7 || '',
      metric_8: row.metric_8 || '',
      stage: row.current_round_type || '',
      type: row.company_industry || '',
      foundersCount,
      traction: row.traction || '',
    });
  } catch (e) {
    console.error('Company dashboard error:', e);
    return res.status(500).json({ error: 'Failed to load company dashboard' });
  }
};

// POST /founder/:uid/company-logo  { logoDataUrl }
exports.updateCompanyLogo = async (req, res) => {
  try {
    const uid = req.params.uid;
    const { logoDataUrl } = req.body || {};
    if (!uid || !logoDataUrl) return res.status(400).json({ error: 'uid and logoDataUrl required' });

    // Parse data URL
    const m = /^data:([^;]+);base64,(.+)$/.exec(String(logoDataUrl));
    if (!m) return res.status(400).json({ error: 'Invalid data URL' });
    const mimetype = m[1];
    const buffer = Buffer.from(m[2], 'base64');
    const ext = mimetype.split('/')[1] || 'png';
    const key = `founder/${uid}/profile/logo.${ext}`;

    await s3.uploadFile(buffer, key, mimetype);

    // Save to founder_step2 (upsert create if missing), and mirror to startup_active.logo
    const exists = await pool.query('SELECT uid FROM founder_step2 WHERE uid = $1', [uid]);
    if (exists.rows.length > 0) {
      await pool.query('UPDATE founder_step2 SET logo_url = $1, updated_at = NOW() WHERE uid = $2', [key, uid]);
    } else {
      await pool.query(
        `INSERT INTO founder_step2 (id, uid, logo_url, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())`,
        [uuidv4(), uid, key]
      );
    }
    try { await pool.query('UPDATE startup_active SET logo = $1 WHERE uid = $2', [key, uid]); } catch (_) {}

    // Return a fetchable URL
    let url = null;
    try { url = await s3.getPrivateUrl(key, 3600); } catch (_) {}
    if (!url) {
      const bucket = process.env.S3_BUCKET_NAME;
      const region = process.env.AWS_REGION;
      const encoded = key.split('/').map(encodeURIComponent).join('/');
      url = region ? `https://${bucket}.s3.${region}.amazonaws.com/${encoded}` : `https://${bucket}.s3.amazonaws.com/${encoded}`;
    }

    return res.json({ success: true, url });
  } catch (e) {
    console.error('Update company logo error:', e);
    return res.status(500).json({ error: 'Failed to update logo' });
  }
};

// POST /founder/:uid/company-update { companyWebsite, companyTagline, metrics, traction }
exports.updateCompanyDetails = async (req, res) => {
  try {
    const uid = req.params.uid;
    const { companyWebsite, companyTagline, traction } = req.body || {};
    // Accept both nested metrics object and flattened metric_1..metric_8 at top-level
    const metrics = (req.body && req.body.metrics && typeof req.body.metrics === 'object')
      ? req.body.metrics
      : {
          metric_1: req.body?.metric_1,
          metric_2: req.body?.metric_2,
          metric_3: req.body?.metric_3,
          metric_4: req.body?.metric_4,
          metric_5: req.body?.metric_5,
          metric_6: req.body?.metric_6,
          metric_7: req.body?.metric_7,
          metric_8: req.body?.metric_8,
        };
    if (!uid) return res.status(400).json({ error: 'uid required' });

    const exists = await pool.query('SELECT uid FROM founder_step2 WHERE uid = $1', [uid]);
    const data = [
      companyWebsite || null,
      companyTagline || null,
      metrics.metric_1 || null,
      metrics.metric_2 || null,
      metrics.metric_3 || null,
      metrics.metric_4 || null,
      metrics.metric_5 || null,
      metrics.metric_6 || null,
      metrics.metric_7 || null,
      metrics.metric_8 || null,
      traction || null,
      uid,
    ];
    if (exists.rows.length > 0) {
      await pool.query(
        `UPDATE founder_step2
         SET company_website = $1,
             company_description = $2,
             metric_1 = $3, metric_2 = $4, metric_3 = $5, metric_4 = $6,
             metric_5 = $7, metric_6 = $8, metric_7 = $9, metric_8 = $10,
             traction = $11,
             updated_at = NOW()
         WHERE uid = $12`,
        data
      );
    } else {
      await pool.query(
        `INSERT INTO founder_step2 (id, uid, company_website, company_description,
                                    metric_1, metric_2, metric_3, metric_4,
                                    metric_5, metric_6, metric_7, metric_8,
                                    traction, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())`,
        [uuidv4(), uid, ...data.slice(0, 11)]
      );
    }

    // Mirror some values to startup_active for investor view
    try {
      await pool.query(
        `UPDATE startup_active
           SET metric_1 = $1, metric_2 = $2, metric_3 = $3, metric_4 = $4,
               metric_5 = $5, metric_6 = $6, metric_7 = $7, metric_8 = $8
         WHERE uid = $9`,
        [
          metrics.metric_1 || null,
          metrics.metric_2 || null,
          metrics.metric_3 || null,
          metrics.metric_4 || null,
          metrics.metric_5 || null,
          metrics.metric_6 || null,
          metrics.metric_7 || null,
          metrics.metric_8 || null,
          uid,
        ]
      );
    } catch (_) {}

    return res.json({ success: true });
  } catch (e) {
    console.error('Update company details error:', e);
    return res.status(500).json({ error: 'Failed to update company details' });
  }
};
