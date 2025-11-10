const pool = require("../../db/pool");
const { getPrivateUrl } = require("../../services/s3");

function extractKeyFromUrl(raw) {
  try {
    const u = new URL(raw);
    return decodeURIComponent(u.pathname.replace(/^\//, "")) || null;
  } catch (_) {
    try {
      const m = String(raw).match(/^https?:\/\/[^\/]+\/(.*)$/);
      if (m && m[1]) return decodeURIComponent(m[1].split('?')[0]);
    } catch (_) {}
  }
  return null;
}

// GET /api/angel/startup/pending
// Returns startups that have a deal with the current investor where deal.status = 'pending'
exports.list = async (req, res) => {
  try {
    const investor = req.user;
    if (!investor?.uid) return res.status(401).json({ error: "Unauthorized" });

    // Join deal -> startup_active by startup_uid and filter by investor + pending status
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (s.uid) s.uid, s.company_name, s.hq_address, s.logo
         FROM deal d
         JOIN startup_active s ON s.uid = d.startup_uid
        WHERE d.investor_uid = $1
          AND (d.status::text = 'pending' OR d.status::text = 'PENDING')
        ORDER BY s.uid, d.updated_at DESC NULLS LAST, d.created_at DESC NULLS LAST`,
      [investor.uid]
    );
    const out = await Promise.all((rows || []).map(async (r) => {
      const rawLogo = r.logo || null;
      const key = rawLogo ? (rawLogo.startsWith('http') ? extractKeyFromUrl(rawLogo) : rawLogo) : null;
      let signed = null;
      if (key) { try { signed = await getPrivateUrl(key, 3600); } catch (_) {} }
      return { ...r, logo: signed || rawLogo };
    }));

    return res.json({ startups: out });
  } catch (e) {
    console.error("pending startups error:", e);
    return res.status(500).json({ error: "Failed to fetch pending startups" });
  }
};
