const pool = require("../../db/pool");

// GET /api/founder/:uid/ventures/requests
// Returns pending deals for a founder's startup with investor preview data
exports.getPendingDeals = async (req, res) => {
  try {
    const { uid } = req.params;
    if (!uid) return res.status(400).json({ error: "uid required" });

    // Ensure optional columns exist to avoid errors across environments
    try {
      await pool.query("ALTER TABLE deal ADD COLUMN IF NOT EXISTS chat TEXT");
      await pool.query("ALTER TABLE deal ADD COLUMN IF NOT EXISTS inv_type TEXT");
      await pool.query("ALTER TABLE deal ADD COLUMN IF NOT EXISTS action TEXT");
      await pool.query("ALTER TABLE angel_investor ADD COLUMN IF NOT EXISTS bio TEXT");
      await pool.query("ALTER TABLE angel_investor ADD COLUMN IF NOT EXISTS total_investment INTEGER");
      await pool.query("ALTER TABLE angel_investor ADD COLUMN IF NOT EXISTS total_amount_invested NUMERIC");
    } catch (_) {}

    const q = await pool.query(
      `SELECT 
         d.deal_id,
         d.doc_id,
         d.investor_uid,
         d.startup_uid,
         d.status,
         d.inv_type,
         d.chat,
         d.deal_no,
         d.action,
         d.created_at,
         d.updated_at,
         ai.angel_name,
         ai.profile_picture,
         ai.bio,
         ai.total_investment,
         ai.total_amount_invested
       FROM deal d
       LEFT JOIN angel_investor ai
         ON d.inv_type = 'ang' AND ai.uid = d.investor_uid
       WHERE d.startup_uid = $1 AND d.status = 'pending'
       ORDER BY d.updated_at DESC NULLS LAST, d.created_at DESC NULLS LAST`,
      [uid]
    );

    return res.json({ requests: q.rows || [] });
  } catch (e) {
    console.error("getPendingDeals error:", e);
    return res.status(500).json({ error: "Failed to load pending requests" });
  }
};

// GET /api/founder/:uid/ventures/active
// Returns active deals for a founder with investor preview data
exports.getActiveDeals = async (req, res) => {
  try {
    const { uid } = req.params;
    if (!uid) return res.status(400).json({ error: "uid required" });

    try {
      await pool.query("ALTER TABLE deal ADD COLUMN IF NOT EXISTS chat TEXT");
      await pool.query("ALTER TABLE deal ADD COLUMN IF NOT EXISTS inv_type TEXT");
      await pool.query("ALTER TABLE deal ADD COLUMN IF NOT EXISTS action TEXT");
      await pool.query("ALTER TABLE angel_investor ADD COLUMN IF NOT EXISTS bio TEXT");
      await pool.query("ALTER TABLE angel_investor ADD COLUMN IF NOT EXISTS total_investment INTEGER");
      await pool.query("ALTER TABLE angel_investor ADD COLUMN IF NOT EXISTS total_amount_invested NUMERIC");
    } catch (_) {}

    const q = await pool.query(
      `SELECT 
         d.deal_id,
         d.doc_id,
         d.investor_uid,
         d.startup_uid,
         d.status,
         d.inv_type,
         d.chat,
         d.deal_no,
         d.action,
         d.created_at,
         d.updated_at,
         ai.angel_name,
         ai.profile_picture,
         ai.bio,
         ai.total_investment,
         ai.total_amount_invested
       FROM deal d
       LEFT JOIN angel_investor ai
         ON d.inv_type = 'ang' AND ai.uid = d.investor_uid
       WHERE d.startup_uid = $1 AND d.status IN ('active','accepted','Active')
       ORDER BY d.updated_at DESC NULLS LAST, d.created_at DESC NULLS LAST`,
      [uid]
    );

    return res.json({ deals: q.rows || [] });
  } catch (e) {
    console.error("getActiveDeals error:", e);
    return res.status(500).json({ error: "Failed to load active deals" });
  }
};

// POST /api/founder/deal/:dealId/cancel
exports.cancelDeal = async (req, res) => {
  try {
    const { dealId } = req.params;
    if (!dealId) return res.status(400).json({ error: "dealId required" });

    // Try common spellings just in case of enum
    const tryUpdate = async (statusVal) => {
      return pool.query(
        "UPDATE deal SET status = $2, updated_at = NOW() WHERE deal_id = $1 RETURNING deal_id",
        [dealId, statusVal]
      );
    };
    let updated;
    try {
      updated = await tryUpdate("canceled");
    } catch (_) {
      try { updated = await tryUpdate("cancelled"); } catch (_) {}
    }
    if (!updated || updated.rowCount === 0) return res.status(404).json({ error: "Deal not found" });
    return res.json({ success: true });
  } catch (e) {
    console.error("cancelDeal error:", e);
    return res.status(500).json({ error: "Failed to cancel deal" });
  }
};

// POST /api/founder/deal/:dealId/accept
// Body: { reply?: string }
// Sets deal to active and, if reply provided, stores combined chat JSON
exports.acceptDeal = async (req, res) => {
  try {
    const { dealId } = req.params;
    const { reply } = req.body || {};
    if (!dealId) return res.status(400).json({ error: "dealId required" });

    await pool.query("ALTER TABLE deal ADD COLUMN IF NOT EXISTS chat TEXT");
    await pool.query("ALTER TABLE deal ADD COLUMN IF NOT EXISTS deal_no TEXT");

    // Verify deal exists first (tolerate uuid/text id mismatches)
    const exists = await pool.query(
      "SELECT deal_id, chat FROM deal WHERE deal_id::text = $1::text LIMIT 1",
      [String(dealId).trim()]
    );
    if (exists.rowCount === 0) {
      return res.status(404).json({ error: "Deal not found", dealId });
    }

    let prev = exists.rows[0]?.chat ?? null;
    try {
      // Keep a fresh read (not strictly needed after 'exists')
      const q = await pool.query("SELECT chat FROM deal WHERE deal_id::text = $1::text", [String(dealId).trim()]);
      prev = q.rows[0]?.chat ?? prev;
    } catch (_) {}

    let newChat = prev;
    if (typeof reply === "string" && reply.trim().length > 0) {
      try {
        const parsed = JSON.parse(prev || "null");
        // Normalize to {inv, stp}
        const invMsg = typeof parsed?.inv !== "undefined" ? parsed.inv : (typeof prev === "string" ? prev : null);
        newChat = JSON.stringify({ inv: invMsg, stp: reply });
      } catch (_) {
        // If previous wasn't JSON, store in inv
        const invMsg = prev && String(prev).trim().length > 0 ? String(prev) : null;
        newChat = JSON.stringify({ inv: invMsg, stp: reply });
      }
    }

    // Try update to active; accept tolerant enum variants
    const tryUpdate = async (statusVal) => {
      return pool.query(
        "UPDATE deal SET status = $2, chat = COALESCE($3, chat), updated_at = NOW() WHERE deal_id::text = $1::text RETURNING deal_id",
        [String(dealId).trim(), statusVal, newChat]
      );
    };
    let updated;
    try {
      updated = await tryUpdate("active");
    } catch (_) {
      try { updated = await tryUpdate("accepted"); } catch (_) {}
      if (!updated || updated.rowCount === 0) {
        try { updated = await tryUpdate("Active"); } catch (_) {}
      }
    }
    if (!updated || updated.rowCount === 0) return res.status(404).json({ error: "Deal not found" });

    // Assign an 11-digit numeric unique deal_no if missing on this row
    try {
      const existsNo = await pool.query(
        "SELECT deal_no FROM deal WHERE deal_id::text = $1::text",
        [String(dealId).trim()]
      );
      const currentNo = (existsNo.rows[0] && existsNo.rows[0].deal_no) || null;
      if (!currentNo || String(currentNo).trim() === "") {
        const gen = () => {
          // generate a non-leading-zero 11-digit number as string
          let s = String(Math.floor(1 + Math.random() * 9)); // first digit 1-9
          while (s.length < 11) s += String(Math.floor(Math.random() * 10));
          return s;
        };
        let newNo = gen();
        let attempts = 0;
        while (attempts < 5) {
          const conflict = await pool.query("SELECT 1 FROM deal WHERE deal_no = $1 LIMIT 1", [newNo]);
          if (conflict.rowCount === 0) break;
          newNo = gen();
          attempts++;
        }
        await pool.query(
          "UPDATE deal SET deal_no = $2, updated_at = NOW() WHERE deal_id::text = $1::text",
          [String(dealId).trim(), newNo]
        );
      }
    } catch (e) {
      console.warn('deal_no assignment skipped:', e?.message || e);
    }

    // Ensure S3 folder structure exists for this deal (deal/<deal_id>/{chat,legals}/)
    try {
      const { s3Client } = require("../../services/s3");
      const { PutObjectCommand } = require("@aws-sdk/client-s3");
      const bucket = process.env.S3_BUCKET_NAME;
      if (bucket) {
        const prefixes = [
          `deal/${String(dealId).trim()}/`,
          `deal/${String(dealId).trim()}/chat/`,
          `deal/${String(dealId).trim()}/legals/`,
        ];
        for (const Key of prefixes) {
          try { await s3Client.send(new (require("@aws-sdk/client-s3").PutObjectCommand)({ Bucket: bucket, Key, Body: "" })); } catch (_) {}
        }
      }
    } catch (e) { /* ignore folder creation errors */ }

    // Return the updated deal_no for convenience
    const after = await pool.query(
      "SELECT deal_no FROM deal WHERE deal_id::text = $1::text",
      [String(dealId).trim()]
    );
    return res.json({ success: true, deal_no: after.rows[0]?.deal_no || null });
  } catch (e) {
    console.error("acceptDeal error:", e);
    return res.status(500).json({ error: "Failed to accept deal" });
  }
};
