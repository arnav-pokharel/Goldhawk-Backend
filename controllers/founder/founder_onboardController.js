const pool = require("../../db/pool");
const { v4: uuidv4 } = require("uuid");
const { beginTransaction, commitTransaction, rollbackTransaction } = require("../../db/transaction");
const s3 = require("../../services/s3");
const axios = require('axios');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const transporter = require('../../utils/mailer');
const { APP_NAME, NO_REPLY_EMAIL, BACKEND_URL } = require('../../utils/appConfig');
const prisma = new PrismaClient();
const path = require("path");


// ----------------------------
// STEP 1 — Founders
// ----------------------------
exports.getStep1 = async (req, res) => {
  const { uid } = req.params;
  try {
    const result = await pool.query(
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

    // Provide frontend with a short-lived S3 presigned URL for private images (no CloudFront for public display)
    const signedRows = await Promise.all(result.rows.map(async row => {
      const pictureKey = row.FOUNDER_PICTURE;
      if (pictureKey && !pictureKey.startsWith('http')) {
        try {
          const presigned = await s3.getSignedUrlForKey(pictureKey);
          return { ...row, FOUNDER_PICTURE: presigned };
        } catch (e2) {
          console.error(`Failed to create S3 presigned URL for key: ${pictureKey}. Error: ${e2?.message || e2}`);
          return { ...row, FOUNDER_PICTURE: null };
        }
      }
      return row;
    }));

    res.json(signedRows);
  } catch (err) {
    console.error("getStep1 error:", err);
    res.status(500).json({ error: "Failed to fetch founders" });
  }
};

exports.createStep1 = async (req, res) => {
  const { uid } = req.params;
  const {
    founder_index,
    FOUNDER_FULL_NAME,
    FOUNDER_TITLE,
    FOUNDER_EMAIL,
    FOUNDER_NUMBER,
    FOUNDER_ADDRESS,
    FOUNDER_CITY,
    FOUNDER_STATE,
    FOUNDER_COUNTRY,
    FOUNDER_ZIP,
    FOUNDER_LINKEDIN,
    FOUNDER_EDUCATION,
    FOUNDER_BIO,
    FOUNDER_PICTURE,
  } = req.body;

  const client = await beginTransaction();
  try {
    const result = await client.query(
      `INSERT INTO founder_step1
        (id, uid, founder_index, founder_full_name, founder_title, founder_email,
         founder_number, founder_address, founder_city, founder_state, founder_country, founder_zip, founder_linkedin,
         founder_education, founder_bio, founder_picture, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW(),NOW())
       RETURNING id`,
      [
        uuidv4(),
        uid,
        Number(founder_index) || 1,
        FOUNDER_FULL_NAME,
        FOUNDER_TITLE,
        FOUNDER_EMAIL,
        FOUNDER_NUMBER,
        FOUNDER_ADDRESS ?? "",
        FOUNDER_CITY ?? "",
        FOUNDER_STATE ?? "",
        FOUNDER_COUNTRY ?? "",
        FOUNDER_ZIP ?? "",
        FOUNDER_LINKEDIN ?? "",
        FOUNDER_EDUCATION ?? "",
        FOUNDER_BIO ?? "",
        FOUNDER_PICTURE ?? "",
      ]
    );
    await client.query("UPDATE founders SET step1 = true, updated_at = NOW() WHERE uid = $1", [uid]);
    await commitTransaction(client);
    res.status(201).json({ id: result.rows[0].id, message: "Founder added" });
  } catch (err) {
    await rollbackTransaction(client);
    console.error("createStep1 error:", err);
    res.status(500).json({ error: "Failed to create founder", detail: err?.message });
  }
};

exports.updateStep1 = async (req, res) => {
    const { uid, id } = req.params;
    const updates = req.body;
    const fieldToColumnMap = {
        founder_index: 'founder_index', FOUNDER_FULL_NAME: 'founder_full_name',
        FOUNDER_TITLE: 'founder_title', FOUNDER_EMAIL: 'founder_email',
        FOUNDER_NUMBER: 'founder_number', FOUNDER_ADDRESS: 'founder_address',
        FOUNDER_CITY: 'founder_city', FOUNDER_STATE: 'founder_state',
        FOUNDER_COUNTRY: 'founder_country', FOUNDER_ZIP: 'founder_zip',
        FOUNDER_LINKEDIN: 'founder_linkedin',
        FOUNDER_EDUCATION: 'founder_education', FOUNDER_BIO: 'founder_bio',
        FOUNDER_PICTURE: 'founder_picture'
    };
    const client = await beginTransaction();
    try {
        const fields = [];
        const values = [];
        let idx = 1;

        // ✅ FIX: Safely build the SET part of the query
        for (const key in fieldToColumnMap) {
            if (updates[key] !== undefined) {
                const dbColumn = fieldToColumnMap[key];
                fields.push(`${dbColumn} = $${idx++}`);
                values.push(updates[key]);
            }
        }

        if (fields.length === 0) {
            await rollbackTransaction(client);
            return res.status(400).json({ error: "No valid fields to update." });
        }

        // ✅ FIX: Correctly append WHERE clause parameters and their indexes
        const query = `UPDATE founder_step1 
                       SET ${fields.join(", ")}, updated_at = NOW() 
                       WHERE uid = $${idx++} AND id = $${idx++} 
                       RETURNING id`;
        
        values.push(uid, id);

        const result = await client.query(query, values);
        if (result.rowCount === 0) {
            await rollbackTransaction(client);
            return res.status(404).json({ error: "Founder not found" });
        }

        await client.query("UPDATE founders SET step1 = true, updated_at = NOW() WHERE uid = $1", [uid]);
        await commitTransaction(client);
        res.json({ message: "Founder updated", id });
    } catch (err) {
        await rollbackTransaction(client);
        console.error("updateStep1 error:", err);
        res.status(500).json({ error: "Failed to update founder" });
    }
};

exports.uploadAvatar = async (req, res) => {
  const { uid, id } = req.params;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: "No file uploaded." });
  }

  const client = await beginTransaction();
  try {
    // Get founder_index from the step1 row to build the filename
    const step1Res = await client.query("SELECT founder_index FROM founder_step1 WHERE id = $1 AND uid = $2", [id, uid]);
    if (step1Res.rowCount === 0) {
      await rollbackTransaction(client);
      return res.status(404).json({ error: "Founder profile not found." });
    }
    const founderIndex = step1Res.rows[0].founder_index;

    // Construct S3 key
    const ext = path.extname(file.originalname).toLowerCase();
    const key = `founder/${uid}/profile/founder${founderIndex}${ext}`;
    
    // Upload to S3 (assuming s3.js service exists as in other controllers)
    await s3.uploadFile(file.buffer, key, file.mimetype);
    
    // Update founder_step1 with just the S3 key
    await client.query(
      `UPDATE founder_step1 SET founder_picture = $1, updated_at = NOW() WHERE id = $2`,
      [key, id]
    );

    // For the immediate response, generate a signed URL so the frontend can display it
    let displayUrl = null;
    if (process.env.CLOUDFRONT_DOMAIN && process.env.CLOUDFRONT_KEY_PAIR_ID) {
      try {
        displayUrl = s3.getCloudFrontSignedUrl(key);
      } catch (e) {
        console.error(`CRITICAL: Failed to sign avatar URL after upload. Error: ${e.message}. Attempting S3 presign fallback.`);
        try {
          displayUrl = await s3.getSignedUrlForKey(key);
        } catch (e2) {
          console.error(`Failed to create S3 presigned URL for uploaded avatar key: ${key}. Error: ${e2?.message || e2}`);
          displayUrl = null;
        }
      }
    } else {
      // If CloudFront isn't configured, attempt to create a presigned S3 URL
      try {
        displayUrl = await s3.getSignedUrlForKey(key);
      } catch (e) {
        console.error(`Failed to create S3 presigned URL for uploaded avatar key: ${key}. Error: ${e?.message || e}`);
        displayUrl = null;
      }
    }

    // Also upload a public copy for Persona verification and save its public URL to founder_id_verification.profile_picture
    try {
  // Name/path per spec: persona-verification/profile-picture/founder<index>-<uid><ext>
  // Bucket is chosen by PERSONA_BUCKET_NAME env var (recommended) or falls back to S3_BUCKET_NAME.
  const personaKey = `persona-verification/profile-picture/founder${founderIndex}-${uid}${ext}`;
      // Use persona-specific bucket if configured, otherwise fallback to main bucket
      const personaResult = await s3.uploadPersonaPublicFile(file.buffer, personaKey, file.mimetype);
      const personaPublicUrl = personaResult.Location;

      // Log the result so operators can confirm where the object was uploaded (dev-only info)
      console.info(`Persona public avatar uploaded for uid=${uid} founder_index=${founderIndex} -> ${personaPublicUrl}`);

      // Persist the persona public URL into founder_id_verification.profile_picture for the matching uid+founder_index
      try {
        await prisma.founder_id_verification.upsert({
          where: { uid_founder_index: { uid, founder_index: founderIndex } },
          update: { profile_picture: personaPublicUrl, updated_at: new Date(), founder_email: undefined },
          create: {
            uid,
            founder_index: founderIndex,
            profile_picture: personaPublicUrl,
            verification_status: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        });
      } catch (e) {
        console.error('Failed to upsert founder_id_verification profile_picture for', uid, founderIndex, e);
      }
    } catch (e) {
      console.error('Failed to upload persona public copy for avatar', e);
    }

    await commitTransaction(client);
    // By default we do NOT return the personaPublicUrl in API responses (privacy).
    // If you need to debug upload locations temporarily, set env: RETURN_PERSONA_URL=true
    if (process.env.RETURN_PERSONA_URL === 'true') {
      // Read back the profile_picture from DB to include in response for debugging
      const row = await prisma.founder_id_verification.findUnique({ where: { uid_founder_index: { uid, founder_index: founderIndex } } }).catch(() => null);
      const personaPublicUrl = row?.profile_picture || null;
      return res.json({ success: true, publicUrl: displayUrl, personaPublicUrl });
    }

    res.json({ success: true, publicUrl: displayUrl });
  } catch (err) {
    await rollbackTransaction(client);
    console.error("Avatar upload error:", err);
    res.status(500).json({ error: "Failed to upload avatar." });
  }
};

// Return a signed URL (or public URL fallback) for a founder avatar by founder id
exports.getAvatar = async (req, res) => {
  const { uid, id } = req.params;
  try {
    const result = await pool.query("SELECT founder_picture FROM founder_step1 WHERE uid = $1 AND id = $2", [uid, id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Founder not found" });
    const pic = result.rows[0].founder_picture;
    if (!pic) return res.status(404).json({ error: "No picture set" });

    // If stored value is a full URL
    if (pic.startsWith("http://") || pic.startsWith("https://")) {
      // If CloudFront is configured and the stored URL already points to CloudFront domain, return a signed CloudFront URL
      if (process.env.CLOUDFRONT_DOMAIN && pic.includes(process.env.CLOUDFRONT_DOMAIN)) {
        try {
          const signed = s3.getCloudFrontSignedUrl(pic);
          return res.json({ url: signed });
        } catch (err) {
          console.error('CloudFront signing failed, returning stored URL as fallback', err);
          return res.json({ url: pic });
        }
      }

      // Return stored public URL as-is
      return res.json({ url: pic });
    }

    // If stored value is an S3 key (e.g. founder/<uid>/profile/founder1.jpg)
    // Prefer CloudFront signing if configured (so private S3 objects can still be served via CloudFront)
    if (process.env.CLOUDFRONT_DOMAIN && process.env.CLOUDFRONT_KEY_PAIR_ID) {
      try {
        const signed = s3.getCloudFrontSignedUrl(pic);
        return res.json({ url: signed });
      } catch (err) {
        console.error('CloudFront signing failed, falling back to S3 presign/public URL', err);
        // fall through
      }
    }

    // Otherwise produce an S3 presigned URL (for private objects) or fall back to public S3 URL
    try {
      const signed = await s3.getSignedUrlForKey(pic);
      return res.json({ url: signed });
    } catch (err) {
      const fallback = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${encodeURIComponent(pic)}`;
      return res.json({ url: fallback });
    }
  } catch (err) {
    console.error("getAvatar error:", err);
    res.status(500).json({ error: "Failed to get avatar" });
  }
};

exports.deleteStep1 = async (req, res) => {
  const { uid, id } = req.params;
  try {
    const result = await pool.query("DELETE FROM founder_step1 WHERE uid = $1 AND id = $2", [uid, id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Founder not found" });
    res.json({ message: "Founder deleted" });
  } catch (err) {
    console.error("deleteStep1 error:", err);
    res.status(500).json({ error: "Failed to delete founder" });
  }
};

// ----------------------------
// STEP 2 — Company & Legals
// ----------------------------
exports.getStep2 = async (req, res) => {
  const { uid } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT company_name,
              has_prior_rounds_yn,
              prior_round_count,
              prior_round_name_n,
              prior_round_type_n,
              current_round_name,
              current_round_type,
              company_website,
              company_incorporation_date,
              company_state_incorporated,
              company_industry,
              company_description,
              hq_address
       FROM founder_step2
       WHERE uid = $1`,
      [uid]
    );

    if (rows.length === 0) {
      return res.json({
        COMPANY_LEGAL_NAME: null,
        HAS_PRIOR_ROUNDS_YN: false,
        PRIOR_ROUND_COUNT: 0,
        ROUNDS: [],
        CURRENT_ROUND_NAME: null,
        CURRENT_ROUND_TYPE: null,
        COMPANY_WEBSITE: null,
        COMPANY_INCORPORATION_DATE: null,
        COMPANY_STATE_INCORPORATED: null,
        COMPANY_INDUSTRY: null,
        COMPANY_DESCRIPTION: null,
      });
    }

    const row = rows[0];
    // Reconstruct the ROUNDS array from the separate name/type arrays
    let prior_names = row.prior_round_name_n || [];
    let prior_types = row.prior_round_type_n || [];
    // Ensure arrays
    if (!Array.isArray(prior_names)) {
      try { prior_names = typeof prior_names === 'string' ? JSON.parse(prior_names) : Array.from(prior_names || []); } catch (e) { prior_names = []; }
    }
    if (!Array.isArray(prior_types)) {
      try { prior_types = typeof prior_types === 'string' ? JSON.parse(prior_types) : Array.from(prior_types || []); } catch (e) { prior_types = []; }
    }

    const rounds = Array.isArray(prior_names)
      ? prior_names.map((name, i) => ({ name: name || "", type: prior_types[i] || "" }))
      : [];

    // Build the response object with the aliased keys the frontend expects.
    return res.json({
      COMPANY_LEGAL_NAME: row.company_name || null,
      HAS_PRIOR_ROUNDS_YN: row.has_prior_rounds_yn === 'true' || row.has_prior_rounds_yn === true,
      PRIOR_ROUND_COUNT: Number(row.prior_round_count || 0),
      ROUNDS: rounds,
      CURRENT_ROUND_NAME: row.current_round_name || null,
      CURRENT_ROUND_TYPE: row.current_round_type || null,
      COMPANY_WEBSITE: row.company_website || null,
      COMPANY_INCORPORATION_DATE: row.company_incorporation_date || null,
      COMPANY_STATE_INCORPORATED: row.company_state_incorporated || null,
      COMPANY_INDUSTRY: row.company_industry || null,
      COMPANY_DESCRIPTION: row.company_description || null,
      HQ_ADDRESS: row.hq_address || null,
    });
  } catch (err) {
    console.error("getStep2 error:", err);
    res.status(500).json({ error: "Failed to fetch Step 2 data" });
  }
};
exports.saveStep2 = async (req, res) => {
  const { uid } = req.params;
  const updates = req.body || {};

  const client = await beginTransaction();
  try {
    // 1. Fetch existing data to merge with updates
    const { rows } = await client.query("SELECT * FROM founder_step2 WHERE uid = $1", [uid]);
    const existingData = rows[0] || {};

    // 2. Merge incoming updates with existing data, mapping frontend keys to DB columns
    const merged = {
      company_name: updates.COMPANY_LEGAL_NAME ?? updates.company_name ?? existingData.company_name,
      company_website: updates.company_website ?? existingData.company_website,
      company_incorporation_date: updates.company_incorporation_date ?? existingData.company_incorporation_date,
      company_state_incorporated: updates.company_state_incorporated ?? existingData.company_state_incorporated,
      company_industry: updates.company_industry ?? existingData.company_industry,
      company_description: updates.company_description ?? existingData.company_description,
      hq_address: updates.HQ_ADDRESS ?? updates.hq_address ?? existingData.hq_address,
      has_prior_rounds_yn: updates.HAS_PRIOR_ROUNDS_YN ?? updates.has_prior_rounds_yn ?? existingData.has_prior_rounds_yn,
      current_round_name: updates.CURRENT_ROUND_NAME ?? updates.current_round_name ?? existingData.current_round_name,
      current_round_type: updates.CURRENT_ROUND_TYPE ?? updates.current_round_type ?? existingData.current_round_type,
      prior_round_count: updates.PRIOR_ROUND_COUNT ?? updates.prior_round_count ?? existingData.prior_round_count,
      prior_round_name_n: existingData.prior_round_name_n, // Default to existing
      prior_round_type_n: existingData.prior_round_type_n, // Default to existing
    };

    // If the payload contains a full `ROUNDS` array (from onboarding), re-calculate the round columns
    if (updates.ROUNDS && Array.isArray(updates.ROUNDS)) {
      merged.prior_round_name_n = updates.ROUNDS.map((r) => r?.name || "");
      merged.prior_round_type_n = updates.ROUNDS.map((r) => r?.type || "");
      merged.prior_round_count = updates.ROUNDS.length;
      merged.has_prior_rounds_yn = updates.ROUNDS.length > 0;
    }

    // 3. Perform an "upsert" (update or insert)
    if (rows.length > 0) {
      // UPDATE
      await client.query(
        `UPDATE founder_step2
            SET company_name               = $2,
                has_prior_rounds_yn        = $3,
                prior_round_count          = $4,
                prior_round_name_n         = $5,
                prior_round_type_n         = $6,
                current_round_name         = $7,
                current_round_type         = $8,
                company_website            = $9,
                company_incorporation_date = $10,
                company_state_incorporated = $11,
                company_industry           = $12,
                company_description        = $13,
                hq_address                 = $14,
                updated_at                 = NOW()
          WHERE uid = $1`,
        [
          uid,
          merged.company_name,
          String(merged.has_prior_rounds_yn) === 'true',
          merged.prior_round_count,
          merged.prior_round_name_n,
          merged.prior_round_type_n,
          merged.current_round_name,
          merged.current_round_type,
          merged.company_website,
          merged.company_incorporation_date || null,
          merged.company_state_incorporated,
          merged.company_industry,
          merged.company_description,
          merged.hq_address ?? null,
        ]
      );
    } else {
      // INSERT
      const founderCheck = await client.query('SELECT uid FROM founders WHERE uid = $1', [uid]);
      if (founderCheck.rows.length === 0) {
        await rollbackTransaction(client);
        return res.status(404).json({ error: 'Founder not found. Please sign up first.' });
      }

      await client.query(
        `INSERT INTO founder_step2 (
           id, uid, company_name, has_prior_rounds_yn, prior_round_count,
           prior_round_name_n, prior_round_type_n, current_round_name, current_round_type,
           company_website, company_incorporation_date, company_state_incorporated, company_industry, company_description, hq_address,
           created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())`,
        [
          uuidv4(),
          uid,
          merged.company_name,
          String(merged.has_prior_rounds_yn) === 'true',
          merged.prior_round_count,
          merged.prior_round_name_n,
          merged.prior_round_type_n,
          merged.current_round_name,
          merged.current_round_type,
          merged.company_website,
          merged.company_incorporation_date || null,
          merged.company_state_incorporated,
          merged.company_industry,
          merged.company_description,
          merged.hq_address ?? null,
        ]
      );
    }

    // 4. Flag step as complete and commit
    await client.query("UPDATE founders SET step2 = true, updated_at = NOW() WHERE uid = $1", [uid]);
    await commitTransaction(client);
    res.json({ message: "Step 2 saved" });
  } catch (err) {
    await rollbackTransaction(client);
    console.error("saveStep2 error:", err);
    res.status(500).json({ error: "Failed to save Step 2", detail: err?.message });
  }
};

// ----------------------------
// STEP 3 — Uploads
// ----------------------------
exports.getStep3 = async (req, res) => {
  const { uid } = req.params;
  try {
  // Return stored uploads placeholder. The project does not store file metadata in a dedicated column yet,
  // so simply verify whether a founder_step3 row exists and return a safe empty uploads array.
  const result = await pool.query(`SELECT id FROM founder_step3 WHERE uid = $1`, [uid]);
  if (result.rowCount === 0) return res.json({ uploads: [] });
  // If a row exists we still don't have per-file metadata; return empty array for now.
  return res.json({ uploads: [] });
  } catch (err) {
    console.error("getStep3 error:", err);
    res.status(500).json({ error: "Failed to fetch uploads", detail: err?.message });
  }
};

exports.saveStep3 = async (req, res) => {
  const { uid } = req.params;
  const client = await beginTransaction();
  try {
    // Update existing row if present (no schema assumptions on columns)
    const upd = await client.query(
      `UPDATE founder_step3 SET updated_at = NOW() WHERE uid = $1`,
      [uid]
    );
    // If nothing to update, insert minimal row with id + uid
    if (upd.rowCount === 0) {
      await client.query(
        `INSERT INTO founder_step3 (id, uid, created_at, updated_at) VALUES ($1, $2, NOW(), NOW())`,
        [uuidv4(), uid]
      );
    }
    await client.query("UPDATE founders SET step3 = true, updated_at = NOW() WHERE uid = $1", [uid]);
    await commitTransaction(client);
    res.json({ message: "Step 3 saved" });
  } catch (err) {
    await rollbackTransaction(client);
    console.error("saveStep3 error:", err);
    res.status(500).json({ error: "Failed to save uploads", detail: err?.message });
  }
};

// ----------------------------
// STEP 4 — Final Submit
// ----------------------------
exports.submitStep4 = async (req, res) => {
  const { uid } = req.params;
  try {
    const r = await pool.query(
      `SELECT COALESCE(step1,false) AS step1,
              COALESCE(step2,false) AS step2,
              COALESCE(step3,false) AS step3
       FROM founders WHERE uid = $1::uuid`,
      [uid]
    );

    if (r.rowCount === 0) return res.status(404).json({ error: "Founder not found" });

    const { step1, step2, step3 } = r.rows[0];
    if (!step1 || !step2 || !step3) {
      return res.status(400).json({ error: "All onboarding steps must be complete before submitting." });
    }

    // (optional) mark submission time for auditing
    await pool.query(
      `UPDATE founders SET updated_at = NOW() WHERE uid = $1::uuid`,
      [uid]
    );

    // --- Create Persona inquiries + verification rows + send email verification links ---
    const foundersRes = await pool.query(
      `SELECT founder_index, founder_full_name, founder_email FROM founder_step1 WHERE uid = $1 ORDER BY founder_index ASC`,
      [uid]
    );
    const founders = foundersRes.rows || [];

    const created = [];
    const errors = [];

    for (const f of founders) {
      const idx = Number(f.founder_index) || 0;
      const name = f.founder_full_name || '';
      const email = f.founder_email || null;

      // Call Persona to create an inquiry
      let inquiryId = null;
      let inquiryUrl = null;
      try {
        const resp = await axios.post(
          'https://withpersona.com/api/v1/inquiries',
          {
            data: {
              type: 'inquiry',
              attributes: {
                'inquiry-template-id': process.env.PERSONA_TEMPLATE_ID_GOV || process.env.PERSONA_TEMPLATE_ID_KYC || null,
                'reference-id': `${uid}-${idx}`,
              },
            },
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.PERSONA_API_KEY}`,
              'Content-Type': 'application/json',
            },
          }
        );
        inquiryId = resp.data?.data?.id;
        const attrs = resp.data?.data?.attributes || {};
        inquiryUrl = attrs['redirect-url'] || attrs['redirect-uri'] || attrs.redirect_url || attrs.redirect_uri || null;
        // Fallback: create inquiry-session to obtain hosted redirect link if missing
        if (!inquiryUrl) {
          try {
            const ses = await axios.post(
              'https://withpersona.com/api/v1/inquiry-sessions',
              { data: { type: 'inquiry-session', attributes: { include: ['client_token','start_url'], inquiry_id: inquiryId }, relationships: { inquiry: { data: { type: 'inquiry', id: inquiryId } } } } },
              { headers: { Authorization: `Bearer ${process.env.PERSONA_API_KEY}`, 'Content-Type': 'application/json', Accept: 'application/json', 'Persona-Version': process.env.PERSONA_API_VERSION || '2023-01-05' } }
            );
            const sdata = ses?.data?.data || {};
            const sattrs = sdata?.attributes || {};
            const clientToken = sattrs['client-token'] || sattrs.client_token;
            inquiryUrl = clientToken ? `https://withpersona.com/verify?client-token=${clientToken}` : (sattrs['redirect-url'] || sattrs['redirect-uri'] || sattrs['start-url'] || sdata?.links?.self || null);
          } catch (se) {
            console.debug('create inquiry-session failed', se?.response?.data || se?.message || se);
          }
        }
        // Final fallback: construct hosted link using inquiry-id directly
        if (!inquiryUrl && inquiryId) {
          inquiryUrl = `https://withpersona.com/verify?inquiry-id=${encodeURIComponent(inquiryId)}`;
        }
      } catch (e) {
        console.error('Persona inquiry creation failed for', uid, idx, e?.response?.data || e?.message || e);
        errors.push({ uid, founder_index: idx, error: e?.response?.data || e?.message || String(e) });
      }

      // Generate email verification token and link if email exists
      let emailToken = null;
      let emailVerifyLink = null;
      if (email) {
        try {
          emailToken = crypto.randomBytes(24).toString('hex');
          // Prefer BACKEND_URL so verification links hit the API directly. Fallback to APP_ORIGIN/FRONTEND_URL for backward compatibility.
      const base = process.env.BACKEND_URL || process.env.APP_ORIGIN || process.env.FRONTEND_URL || BACKEND_URL;
          emailVerifyLink = `${base.replace(/\/$/,'')}/api/founder/verification/email/confirm?uid=${encodeURIComponent(uid)}&fi=${idx}&t=${emailToken}`;
        } catch (e) {
          console.error('Failed to create email token for', uid, idx, e);
        }
      }

      // Persist verification row via Prisma upsert
      try {
        await prisma.founder_id_verification.upsert({
          where: { uid_founder_index: { uid, founder_index: idx } },
          update: {
            founder_name: name || undefined,
            persona_inquiry_id: inquiryId || undefined,
            verification_url: inquiryUrl || undefined,
            verification_status: null,
            review_reason: null,
            founder_email: email || undefined,
            email_verified: false,
            email_verify_link: emailToken || undefined,
            updated_at: new Date(),
          },
          create: {
            uid,
            founder_index: idx,
            founder_name: name || undefined,
            persona_inquiry_id: inquiryId || undefined,
            verification_url: inquiryUrl || undefined,
            verification_status: null,
            review_reason: null,
            created_at: new Date(),
            updated_at: new Date(),
            founder_email: email || undefined,
            email_verified: false,
            email_verify_link: emailToken || undefined,
          },
        });
      } catch (e) {
        console.error('Failed to upsert founder_id_verification for', uid, idx, e);
        errors.push({ uid, founder_index: idx, error: String(e) });
      }

      // Send the verification email if we have an email and transporter
      if (email && transporter) {
        try {
          const mailHtml = `<p>Hello ${name || 'Founder'},</p>
            <p>Please verify your email by clicking the link below:</p>
            <p><a href="${emailVerifyLink}">Verify Email</a></p>
            <p>To complete identity verification, open this Persona link:</p>
            <p><a href="${inquiryUrl}">Start Identity Verification</a></p>`;
          const mailText = `Hello ${name || 'Founder'},\n\nPlease verify your email by visiting: ${emailVerifyLink}\n\nTo complete identity verification, open this Persona link: ${inquiryUrl}\n`;
          const fromAddress = process.env.SMTP_USER || process.env.EMAIL_USER || NO_REPLY_EMAIL;
          await transporter.sendMail({
            from: `${APP_NAME} <${fromAddress}>`,
            to: email,
            subject: 'Please verify your email and identity',
            text: mailText,
            html: mailHtml,
          });
        } catch (e) {
          console.error('Failed to send verification email to', email, e);
          errors.push({ uid, founder_index: idx, email, error: String(e) });
        }
      }

      created.push({ uid, founder_index: idx, persona_inquiry_id: inquiryId, verification_url: inquiryUrl, founder_email: email, email_verify_link: emailVerifyLink });
    }

    return res.json({ message: "Founder onboarding submitted successfully.", verifications_created: created.length, errors });
  } catch (err) {
    console.error("submitStep4 error:", err);
    res.status(500).json({ error: "Failed to submit onboarding" });
  }
};

exports.getReview = async (req, res) => {
  const { uid } = req.params;
  try {
    const [s1, s2, s3] = await Promise.all([
      pool.query(
        `SELECT id, uid, founder_index,
                founder_full_name AS "FOUNDER_FULL_NAME",
                founder_title     AS "FOUNDER_TITLE",
                founder_email     AS "FOUNDER_EMAIL",
                founder_number    AS "FOUNDER_NUMBER",
                founder_address   AS "FOUNDER_ADDRESS",
                founder_picture   AS "FOUNDER_PICTURE",
                founder_education AS "FOUNDER_EDUCATION",
                founder_bio       AS "FOUNDER_BIO"
         FROM founder_step1
         WHERE uid = $1::uuid
         ORDER BY founder_index ASC`,
        [uid]
      ),
      pool.query(
        `SELECT company_name,
                has_prior_rounds_yn,
                prior_round_count,
                prior_round_name_n,
                prior_round_type_n,
                current_round_name,
                current_round_type
         FROM founder_step2
         WHERE uid = $1::uuid`,
        [uid]
      ),
      pool.query(
        `SELECT id FROM founder_step3 WHERE uid = $1::uuid`,
        [uid]
      ),
    ]);

    const founders = s1.rows || [];
    const step2row = s2.rows[0] || {};

    // Reconstruct the ROUNDS array from the separate name/type arrays
    const prior_names = step2row.prior_round_name_n || [];
    const prior_types = step2row.prior_round_type_n || [];
    const rounds = Array.isArray(prior_names)
      ? prior_names.map((name, i) => ({ name: name || "", type: prior_types[i] || "" }))
      : [];

    const company = {
      COMPANY_LEGAL_NAME: step2row.company_name ?? null,
      HAS_PRIOR_ROUNDS_YN: step2row.has_prior_rounds_yn === 'true' || step2row.has_prior_rounds_yn === true,
      PRIOR_ROUND_COUNT: Number(step2row.prior_round_count || 0),
      ROUNDS: rounds,
      CURRENT_ROUND_NAME: step2row.current_round_name || null,
      CURRENT_ROUND_TYPE: step2row.current_round_type || null,
    };
    const uploads = []; // Step 3 does not handle file uploads yet

    res.json({ founders, company, uploads });
  } catch (err) {
    console.error("getReview error:", err);
    // Don’t crash Step-4 UI — return safe empties
    res.json({
      founders: [],
      company: {
        COMPANY_LEGAL_NAME: null,
        HAS_PRIOR_ROUNDS_YN: false,
        PRIOR_ROUND_COUNT: 0,
        ROUNDS: [],
        CURRENT_ROUND_NAME: null,
        CURRENT_ROUND_TYPE: null,
      },
      uploads: [],
    });
  }
};
