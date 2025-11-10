const pool = require('../../db/pool');

async function tableExists(name) {
  try {
    const q = await pool.query('SELECT to_regclass($1) AS t', [name]);
    return Boolean(q.rows?.[0]?.t);
  } catch (_) { return false; }
}

/**
 * GET /startup_pipeline_legal_safe_board_consent/:deal_id
 * Returns SAFE values and board consent info from deal_safe table.
 */
exports.getBoardConsent = async (req, res) => {
  try {
    const { deal_id } = req.params;
    if (!deal_id) return res.status(400).json({ error: 'deal_id required' });

    let response = null;
    if (await tableExists('public.deal_safe')) {
      const rs = await pool.query(
        `SELECT deal_id, "SAFE_FORM", "POST_MONEY_VALUATION", "DISCOUNT_RATE", "SAFE_FORM_FLEX",
                "PRO_RATA_ENABLED", "SAFE_TOTAL_AUTHORIZED", board_consent_safe,
                discount_safe, pro_rata_side_letter_safe, mfn_safe, valuation_cap_safe, created_at
           FROM deal_safe WHERE deal_id = $1 LIMIT 1`,
        [deal_id]
      );
      if (rs.rows.length > 0) {
        const safe = rs.rows[0];
        let boardConsent = {};
        try { boardConsent = typeof safe.board_consent_safe === 'string' ? JSON.parse(safe.board_consent_safe) : (safe.board_consent_safe || {}); } catch (_) {}
        response = {
          deal_id: safe.deal_id,
          SAFE_FORM: safe.SAFE_FORM,
          POST_MONEY_VALUATION: safe.POST_MONEY_VALUATION,
          DISCOUNT_RATE: safe.DISCOUNT_RATE,
          SAFE_FORM_FLEX: safe.SAFE_FORM_FLEX,
          PRO_RATA_ENABLED: safe.PRO_RATA_ENABLED,
          SAFE_TOTAL_AUTHORIZED: safe.SAFE_TOTAL_AUTHORIZED,
          board_consent_safe: boardConsent,
          discount_safe: safe.discount_safe,
          pro_rata_side_letter_safe: safe.pro_rata_side_letter_safe,
          mfn_safe: safe.mfn_safe,
          valuation_cap_safe: safe.valuation_cap_safe,
          created_at: safe.created_at,
        };
      }
    }

    if (!response) {
      const rs = await pool.query(
        `SELECT dt.safe
           FROM deal_termsheet dt
          WHERE dt.deal_id = $1
          ORDER BY dt.created_at DESC NULLS LAST
          LIMIT 1`,
        [deal_id]
      );
      const safeJson = rs.rows?.[0]?.safe || {};
      response = {
        deal_id,
        SAFE_FORM: safeJson.SAFE_FORM || null,
        POST_MONEY_VALUATION: safeJson.POST_MONEY_VALUATION || null,
        DISCOUNT_RATE: safeJson.DISCOUNT_RATE || null,
        SAFE_FORM_FLEX: safeJson.SAFE_FORM_FLEX ?? null,
        PRO_RATA_ENABLED: safeJson.PRO_RATA_ENABLED ?? null,
        SAFE_TOTAL_AUTHORIZED: safeJson.SAFE_TOTAL_AUTHORIZED || null,
        board_consent_safe: {},
        discount_safe: null,
        pro_rata_side_letter_safe: null,
        mfn_safe: null,
        valuation_cap_safe: null,
        created_at: null,
      };
    }

    if (!response) {
      response = {
        deal_id,
        SAFE_FORM: null,
        POST_MONEY_VALUATION: null,
        DISCOUNT_RATE: null,
        SAFE_FORM_FLEX: null,
        PRO_RATA_ENABLED: null,
        SAFE_TOTAL_AUTHORIZED: null,
        board_consent_safe: {},
        discount_safe: null,
        pro_rata_side_letter_safe: null,
        mfn_safe: null,
        valuation_cap_safe: null,
        created_at: null,
      };
    }

    res.json(response);
  } catch (err) {
    console.error('getBoardConsent error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
