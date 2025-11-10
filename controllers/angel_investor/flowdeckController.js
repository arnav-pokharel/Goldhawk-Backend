const pool = require('../../db/pool');
const { getPrivateUrl } = require('../../services/s3');

function extractKeyFromUrl(raw) {
  try {
    const u = new URL(raw);
    // pathname only (strip leading '/') and ignore any existing query params/signatures
    return decodeURIComponent(u.pathname.replace(/^\//, '')) || null;
  } catch (_) {
    // Fallback to previous regex-based extraction
    try {
      const m = String(raw).match(/^https?:\/\/[^\/]+\/(.*)$/);
      if (m && m[1]) return decodeURIComponent(m[1].split('?')[0]);
    } catch (_) {}
  }
  return null;
}

exports.getZenithView = async (req, res) => {
  try {
    if (!req.user || !req.user.uid) {
      return res.status(401).json({ error: 'Unauthorized: missing investor context' });
    }
    const { uid } = req.user;
    
    // Get investor preferences for filtering
    const investorPrefs = await pool.query(
      `SELECT preferred_size, preferred_range, risk, preferred_stage, preferred_sector
       FROM angel_stats 
       WHERE uid = $1`,
      [uid]
    );
    
    // Prefer selecting term_sheet if present, but fall back gracefully if column doesn't exist
    let queryStrWithTerm = `
      SELECT uid, company_name, hq_address, deal_amount AS deal,
        pitch1_description, stack_1, stack_2, stack_3, stack_4,
        logo,
        thumb_url AS pitch1_thumb_path,
        term_sheet, pitch_deck,
        metric_1, metric_2, metric_3, metric_4, metric_5, metric_6, metric_7
      FROM startup_active 
      WHERE 1=1
    `;
    let queryStrNoTerm = `
      SELECT uid, company_name, hq_address, deal_amount AS deal,
        pitch1_description, stack_1, stack_2, stack_3, stack_4,
        logo,
        thumb_url AS pitch1_thumb_path,
        pitch_deck,
        metric_1, metric_2, metric_3, metric_4, metric_5, metric_6, metric_7
      FROM startup_active 
      WHERE 1=1
    `;
    let queryParams = [];
    
    // Apply filters based on investor preferences
    if (investorPrefs.rows.length > 0) {
      const prefs = investorPrefs.rows[0];
      
      if (prefs.preferred_stage) {
      queryStrWithTerm += ` AND deal_amount ILIKE $${queryParams.length + 1}`;
      queryStrNoTerm   += ` AND deal_amount ILIKE $${queryParams.length + 1}`;
      queryParams.push(`%${prefs.preferred_stage}%`);
      }
      
      if (prefs.preferred_sector) {
      queryStrWithTerm += ` AND (stack_1 ILIKE $${queryParams.length + 1} OR stack_2 ILIKE $${queryParams.length + 1} OR stack_3 ILIKE $${queryParams.length + 1} OR stack_4 ILIKE $${queryParams.length + 1})`;
      queryStrNoTerm   += ` AND (stack_1 ILIKE $${queryParams.length + 1} OR stack_2 ILIKE $${queryParams.length + 1} OR stack_3 ILIKE $${queryParams.length + 1} OR stack_4 ILIKE $${queryParams.length + 1})`;
      queryParams.push(`%${prefs.preferred_sector}%`);
      }
    }
    
    // Add additional query parameters from request if any
    const { stage, sector, size } = req.query;
    
    if (stage) {
      queryStrWithTerm += ` AND deal_amount ILIKE $${queryParams.length + 1}`;
      queryStrNoTerm   += ` AND deal_amount ILIKE $${queryParams.length + 1}`;
      queryParams.push(`%${stage}%`);
    }
    
    if (sector) {
      queryStrWithTerm += ` AND (stack_1 ILIKE $${queryParams.length + 1} OR stack_2 ILIKE $${queryParams.length + 1} OR stack_3 ILIKE $${queryParams.length + 1} OR stack_4 ILIKE $${queryParams.length + 1})`;
      queryStrNoTerm   += ` AND (stack_1 ILIKE $${queryParams.length + 1} OR stack_2 ILIKE $${queryParams.length + 1} OR stack_3 ILIKE $${queryParams.length + 1} OR stack_4 ILIKE $${queryParams.length + 1})`;
      queryParams.push(`%${sector}%`);
    }
    
    queryStrWithTerm += ' ORDER BY company_name';
    queryStrNoTerm   += ' ORDER BY company_name';

    let startups;
    try {
      startups = await pool.query(queryStrWithTerm, queryParams);
    } catch (e) {
      if (e && e.code === '42703') {
        // Missing column (e.g., term_sheet); retry without it
        startups = await pool.query(queryStrNoTerm, queryParams);
      } else {
        throw e;
      }
    }
    const rows = startups.rows || [];
    const transformed = await Promise.all(rows.map(async (r) => {
      const rawLogo = r.logo || null;
      const logoKey = rawLogo ? (rawLogo.startsWith('http') ? extractKeyFromUrl(rawLogo) : rawLogo) : null;
      let signedLogo = null;
      if (logoKey) { try { signedLogo = await getPrivateUrl(logoKey, 3600); } catch (_) {} }

      const rawThumb = r.pitch1_thumb_path || null;
      const thumbKey = rawThumb ? (rawThumb.startsWith('http') ? extractKeyFromUrl(rawThumb) : rawThumb) : null;
      let signedThumb = null;
      if (thumbKey) { try { signedThumb = await getPrivateUrl(thumbKey, 3600); } catch (_) {} }

      let publicThumb = null;
      if (!signedThumb && thumbKey && process.env.S3_BUCKET_NAME) {
        const bucket = process.env.S3_BUCKET_NAME;
        const region = process.env.AWS_REGION;
        const encodedKey = thumbKey.split('/').map(encodeURIComponent).join('/');
        publicThumb = region
          ? `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`
          : `https://${bucket}.s3.amazonaws.com/${encodedKey}`;
      }

      return { ...r, logo_url: signedLogo || rawLogo, pitch1_thumbnail_url: signedThumb || publicThumb || rawThumb };
    }));
    
    res.json({ startups: transformed });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error fetching zenith view' });
  }
};

exports.getFocusView = async (req, res) => {
  try {
    const { uid } = req.params;
    
    let qWith = `SELECT uid, company_name, hq_address, deal_amount AS deal, 
              pitch1_description, pitch2_description, pitch3_description,
              stack_1, stack_2, stack_3, stack_4,
              pitch1_link, pitch2_link, pitch3_link,
              term_sheet, pitch_deck,
              logo,
              thumb_url AS pitch1_thumb_path,
              metric_1, metric_2, metric_3, metric_4, metric_5, metric_6, metric_7
       FROM startup_active 
       WHERE uid = $1`;
    let qNo = `SELECT uid, company_name, hq_address, deal_amount AS deal, 
              pitch1_description, pitch2_description, pitch3_description,
              stack_1, stack_2, stack_3, stack_4,
              pitch1_link, pitch2_link, pitch3_link,
              pitch_deck,
              logo,
              thumb_url AS pitch1_thumb_path,
              metric_1, metric_2, metric_3, metric_4, metric_5, metric_6, metric_7
       FROM startup_active 
       WHERE uid = $1`;
    let startup;
    try {
      startup = await pool.query(qWith, [uid]);
    } catch (e) {
      if (e && e.code === '42703') {
        startup = await pool.query(qNo, [uid]);
      } else {
        throw e;
      }
    }
    
    if (startup.rows.length === 0) {
      return res.status(404).json({ error: 'Startup not found' });
    }
    const row = startup.rows[0];
    const raw = row.logo || null;
    const key = raw ? (raw.startsWith('http') ? extractKeyFromUrl(raw) : raw) : null;
    let signed = null;
    if (key) { try { signed = await getPrivateUrl(key, 3600); } catch (_) {} }

    const rawThumb = row.pitch1_thumb_path || null;
    const thumbKey = rawThumb ? (rawThumb.startsWith('http') ? extractKeyFromUrl(rawThumb) : rawThumb) : null;
    let signedThumb = null;
    if (thumbKey) { try { signedThumb = await getPrivateUrl(thumbKey, 3600); } catch (_) {} }

    res.json({ startup: { ...row, logo_url: signed || raw, pitch1_thumbnail_url: signedThumb || rawThumb } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error fetching focus view' });
  }
};

exports.getFilters = async (req, res) => {
  try {
    const { uid } = req.user;
    
    const filters = await pool.query(
      `SELECT preferred_size, preferred_range, risk, preferred_stage, preferred_sector
       FROM angel_stats 
       WHERE uid = $1`,
      [uid]
    );
    
    res.json({ filters: filters.rows[0] || {} });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error fetching filters' });
  }
};

exports.saveFilters = async (req, res) => {
  try {
    const { uid } = req.user;
    const { 
      preferred_size, 
      preferred_range, 
      risk, 
      preferred_stage, 
      preferred_sector 
    } = req.body;
    
    // Check if filters already exist
    const existingFilters = await pool.query(
      'SELECT uid FROM angel_stats WHERE uid = $1',
      [uid]
    );
    
    if (existingFilters.rows.length > 0) {
      // Update existing filters
      await pool.query(
        `UPDATE angel_stats 
         SET preferred_size = $1, preferred_range = $2, risk = $3, 
             preferred_stage = $4, preferred_sector = $5
         WHERE uid = $6`,
        [preferred_size, preferred_range, risk, preferred_stage, preferred_sector, uid]
      );
    } else {
      // Insert new filters
      await pool.query(
        `INSERT INTO angel_stats 
         (uid, preferred_size, preferred_range, risk, preferred_stage, preferred_sector)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [uid, preferred_size, preferred_range, risk, preferred_stage, preferred_sector]
      );
    }
    
    res.json({ message: 'Filters saved successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error saving filters' });
  }
};

exports.getStartupDetails = async (req, res) => {
  try {
    const { uid } = req.params;
    let qWith = `SELECT uid, company_name, hq_address, deal_amount AS deal, 
              pitch1_description, pitch2_description, pitch3_description,
              stack_1, stack_2, stack_3, stack_4,
              pitch1_link, pitch2_link, pitch3_link,
              term_sheet, pitch_deck,
              logo,
              thumb_url AS pitch1_thumb_path,
              metric_1, metric_2, metric_3, metric_4, metric_5, metric_6, metric_7
       FROM startup_active 
       WHERE uid = $1`;
    let qNo = `SELECT uid, company_name, hq_address, deal_amount AS deal, 
              pitch1_description, pitch2_description, pitch3_description,
              stack_1, stack_2, stack_3, stack_4,
              pitch1_link, pitch2_link, pitch3_link,
              pitch_deck,
              logo,
              thumb_url AS pitch1_thumb_path,
              metric_1, metric_2, metric_3, metric_4, metric_5, metric_6, metric_7
       FROM startup_active 
       WHERE uid = $1`;
    let startup;
    try {
      startup = await pool.query(qWith, [uid]);
    } catch (e) {
      if (e && e.code === '42703') {
        startup = await pool.query(qNo, [uid]);
      } else {
        throw e;
      }
    }
    
    if (startup.rows.length === 0) {
      return res.status(404).json({ error: 'Startup not found' });
    }
    const row = startup.rows[0];
    const raw = row.logo || null;
    const key = raw ? (raw.startsWith('http') ? extractKeyFromUrl(raw) : raw) : null;
    let signed = null;
    if (key) { try { signed = await getPrivateUrl(key, 3600); } catch (_) {} }
    
    res.json({ startup: { ...row, logo_url: signed || raw } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error fetching startup details' });
  }
};

exports.startDeal = async (req, res) => {
  try {
    const { uid } = req.user;
    const { startup_uid } = req.body;
    
    // Check if deal already exists
    const existingDeal = await pool.query(
      'SELECT deal_id FROM deal WHERE investor_uid = $1 AND startup_uid = $2',
      [uid, startup_uid]
    );
    
    if (existingDeal.rows.length > 0) {
      return res.status(400).json({ error: 'Deal already exists' });
    }
    
    // Check if investor has fund validation
    const fundValidation = await pool.query(
      'SELECT fund_validation FROM angel_investor WHERE uid = $1',
      [uid]
    );
    
    if (!fundValidation.rows[0]?.fund_validation) {
      return res.status(400).json({ error: 'Fund validation required to start a deal' });
    }
    
    // Create new deal
    const newDeal = await pool.query(
      `INSERT INTO deal (investor_uid, startup_uid, status)
       VALUES ($1, $2, 'pending')
       RETURNING deal_id, investor_uid, startup_uid, status, created_at`,
      [uid, startup_uid]
    );
    
    res.status(201).json({ 
      message: 'Deal started successfully',
      deal: newDeal.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error starting deal' });
  }
};

exports.viewTermSheet = async (req, res) => {
  try {
    const { deal_id } = req.params;
    const { uid } = req.user;
    
    // Verify user has access to this deal
    const dealAccess = await pool.query(
      'SELECT deal_id FROM deal WHERE deal_id = $1 AND investor_uid = $2',
      [deal_id, uid]
    );
    
    if (dealAccess.rows.length === 0) {
      return res.status(404).json({ error: 'Deal not found' });
    }
    
    // Get term sheet from startup_active table (fallback if column missing)
    let termSheet;
    try {
      termSheet = await pool.query(
        `SELECT s.term_sheet, s.uid as startup_uid, s.company_name
         FROM startup_active s
         JOIN deal d ON s.uid = d.startup_uid
         WHERE d.deal_id = $1`,
        [deal_id]
      );
    } catch (e) {
      if (e && e.code === '42703') {
        // term_sheet column not present
        return res.status(404).json({ error: 'Term sheet not available' });
      }
      throw e;
    }
    
    if (termSheet.rows.length === 0) {
      return res.status(404).json({ error: 'Term sheet not found' });
    }
    
    res.json({ termSheet: termSheet.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error fetching term sheet' });
  }
};

exports.acceptTermSheet = async (req, res) => {
  try {
    const { deal_id } = req.params;
    const { uid } = req.user;
    
    // Verify user has access to this deal
    const dealAccess = await pool.query(
      'SELECT deal_id, startup_uid FROM deal WHERE deal_id = $1 AND investor_uid = $2',
      [deal_id, uid]
    );
    
    if (dealAccess.rows.length === 0) {
      return res.status(404).json({ error: 'Deal not found' });
    }
    
    // Get term sheet from startup_active table
    let termSheet;
    try {
      termSheet = await pool.query(
        `SELECT term_sheet
         FROM startup_active s
         JOIN deal d ON s.uid = d.startup_uid
         WHERE d.deal_id = $1`,
        [deal_id]
      );
    } catch (e) {
      if (e && e.code === '42703') {
        return res.status(404).json({ error: 'Term sheet not available' });
      }
      throw e;
    }
    
    if (termSheet.rows.length === 0) {
      return res.status(404).json({ error: 'Term sheet not found' });
    }
    
    // Create term sheet record in deal_termsheet
    const newTermSheet = await pool.query(
      `INSERT INTO deal_termsheet (deal_id, version, proposed_by, status, terms)
       VALUES ($1, 1, 'founder', 'accepted', $2)
       RETURNING id, deal_id, version, proposed_by, status, terms, created_at`,
      [deal_id, termSheet.rows[0].term_sheet]
    );
    
    // Update deal status to active
    await pool.query(
      'UPDATE deal SET status = $1, updated_at = NOW() WHERE deal_id = $2',
      ['active', deal_id]
    );
    
    res.json({ 
      message: 'Term sheet accepted successfully',
      termSheet: newTermSheet.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error accepting term sheet' });
  }
};

exports.counterTermSheet = async (req, res) => {
  try {
    const { deal_id } = req.params;
    const { uid } = req.user;
    const { terms } = req.body;
    
    // Verify user has access to this deal
    const dealAccess = await pool.query(
      'SELECT deal_id FROM deal WHERE deal_id = $1 AND investor_uid = $2',
      [deal_id, uid]
    );
    
    if (dealAccess.rows.length === 0) {
      return res.status(404).json({ error: 'Deal not found' });
    }
    
    // Get latest version
    const latestVersion = await pool.query(
      'SELECT COALESCE(MAX(version), 0) as max_version FROM deal_termsheet WHERE deal_id = $1',
      [deal_id]
    );
    
    const newVersion = latestVersion.rows[0].max_version + 1;
    
    // Insert new term sheet version
    const newTermSheet = await pool.query(
      `INSERT INTO deal_termsheet (deal_id, version, proposed_by, status, terms)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, deal_id, version, proposed_by, status, terms, created_at`,
      [deal_id, newVersion, 'investor', 'pending', terms]
    );
    
    res.status(201).json({ 
      message: 'Counter term sheet created successfully',
      termSheet: newTermSheet.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error creating counter term sheet' });
  }
};
