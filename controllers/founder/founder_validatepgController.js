"use strict";

const pool = require("../../db/pool");

async function tableExists(tableName) {
  try {
    const q = await pool.query("SELECT to_regclass($1) AS reg", [tableName]);
    return !!(q.rows[0] && q.rows[0].reg);
  } catch (e) {
    return false;
  }
}

async function computeProgress(uid) {
  const [step3Res, hasValidate, hasAccess] = await Promise.all([
    pool.query(
      "SELECT overview_doc_url FROM founder_step3 WHERE uid = $1 ORDER BY updated_at DESC NULLS LAST LIMIT 1",
      [uid]
    ),
    tableExists("founder_validate"),
    tableExists("founder_validation_access"),
  ]);

  const step3Row = step3Res.rows[0] || null;
  let validateRow = null;
  if (hasValidate) {
    const v = await pool.query(
      "SELECT * FROM founder_validate WHERE uid = $1 ORDER BY updated_at DESC NULLS LAST LIMIT 1",
      [uid]
    );
    validateRow = v.rows[0] || null;
  }

  // Derive access booleans; prefer founder_validate, but fall back to presence in founder_validation_access
  let tech_acc = validateRow?.tech_acc ?? validateRow?.tech_access ?? null;
  let business_access = validateRow?.business_access ?? validateRow?.business_acc ?? null;
  if ((tech_acc == null || business_access == null) && hasAccess) {
    try {
      const acc = await pool.query(
        "SELECT access_sc, access_cicd, access_fe, access_be, access_db FROM founder_validation_access WHERE uid = $1 LIMIT 1",
        [uid]
      );
      if (acc.rows.length > 0) {
        const a = acc.rows[0] || {};
        const anyAccess = !!(a.access_sc || a.access_cicd || a.access_fe || a.access_be || a.access_db);
        if (tech_acc == null && anyAccess) tech_acc = true;
        if (business_access == null && anyAccess) business_access = true;
      }
    } catch (e) {
      // ignore
    }
  }

  const progress = {
    overview_doc_url: step3Row?.overview_doc_url ?? validateRow?.overview_doc_url ?? null,
    overview_kp: validateRow?.overview_kp ?? null,
    tech_dde: validateRow?.tech_dde ?? validateRow?.tech_kp ?? null,
    business_dde: validateRow?.business_dde ?? validateRow?.business_kp ?? null,
    tech_acc,
    business_access,
  };

  return progress;
}

function computeNextPath(p) {
  const hasOverview = p.overview_doc_url != null; // or overview_kp handled by controller
  const hasTechDDE = p.tech_dde != null;
  const hasBizDDE = p.business_dde != null;
  const hasTechAcc = p.tech_acc != null;
  const hasBizAcc = p.business_access != null;

  // Rule 1
  if (!hasOverview && !hasTechDDE && !hasBizDDE) return "/founder/dashboard/validate/upload";
  // Rule 2
  if (hasOverview && !hasTechDDE && !hasBizDDE) return "/founder/dashboard/validate/tech_dde";
  // Rule 3
  if (hasOverview && hasTechDDE && !hasBizDDE) return "/founder/dashboard/validate/business_dde";
  // Rule 4/5/6
  if (hasOverview && hasTechDDE && hasBizDDE && (!hasTechAcc || !hasBizAcc)) return "/founder/dashboard/validate/access";
  // Rule 7
  if (hasOverview && hasTechDDE && hasBizDDE && hasTechAcc && hasBizAcc) return "/founder/dashboard/validate/main";
  // Default
  return "/founder/dashboard/validate/main";
}

// JSON: next step
exports.getNextStep = async (req, res) => {
  const uid = (req.params?.uid || req.query?.uid || (req.cookies ? req.cookies.uid : null) || "").toString().trim();
  if (!uid) return res.status(400).json({ error: "uid required" });
  try {
    const progress = await computeProgress(uid);
    const next = computeNextPath(progress);
    return res.json({ next, progress });
  } catch (e) {
    console.error("getNextStep error", e);
    return res.status(500).json({ error: "failed_to_compute_next" });
  }
};

// 302 redirect to next step
exports.redirectToNext = async (req, res) => {
  const uid = (req.params?.uid || req.query?.uid || (req.cookies ? req.cookies.uid : null) || "").toString().trim();
  const frontend = process.env.FRONTEND_URL || "http://www.lunaseed.app";
  if (!uid) return res.redirect(302, `${frontend}/founder/dashboard/validate/upload`);
  try {
    const progress = await computeProgress(uid);
    const next = computeNextPath(progress);
    // Redirect to the frontend app, not the backend domain
    return res.redirect(302, `${frontend}${next}`);
  } catch (e) {
    return res.redirect(302, `${frontend}/founder/dashboard/validate/upload`);
  }
};
