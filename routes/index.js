const express = require("express");
const router = express.Router();
// VC Firm Admin routes
router.use("/vcfirm/admin", require("./vc-firm/admin"));

// General Partner routes (keep these for GP authentication)
router.use("/vc/general_partner", require("./vc-firm/general_partner"));
router.use("/vcfirm/admin", require("./vc-firm/admin/auth"));
router.use("/vc/general_partner", require("./vc-firm/general_partner"));
// --- Authentication ---
router.use("/founder", require("./founder/founder_signup"));
router.use("/founder", require("./founder/founder_login"));
router.use("/founder", require("./founder/founder_logout"));

// --- Onboarding & Data ---
// `founder_onboard` handles step1, step2, step3, and review data endpoints
router.use("/founder", require("./founder/founder_onboard"));
router.use("/founder", require("./founder/founder_submit"));

// --- Legal Document Specifics ---
router.use("/founder", require("./founder/founder_safe"));
router.use("/founder", require("./founder/founder_vcap_safe"));
// Term Sheet SAFE signature routes (preview and write-once)
router.use("/founder", require("./founder/founder_termsheet_safe"));
router.use("/founder", require("./founder/founder_note"));
router.use("/founder/legals", require("./founder/founder_legal"));

// 🧾 Founder Equity Legal Documents (A–M)
router.use("/founder", require("./founder/founder_equity_A"));
router.use("/founder", require("./founder/founder_equity_B"));
router.use("/founder", require("./founder/founder_equity_C"));
router.use("/founder", require("./founder/founder_equity_D"));
router.use("/founder", require("./founder/founder_equity_E"));
router.use("/founder", require("./founder/founder_equity_F"));
router.use("/founder", require("./founder/founder_equity_G"));
router.use("/founder", require("./founder/founder_equity_H"));
router.use("/founder", require("./founder/founder_equity_I"));
router.use("/founder", require("./founder/founder_equity_J"));
router.use("/founder", require("./founder/founder_equity_K"));
router.use("/founder", require("./founder/founder_equity_L"));
router.use("/founder", require("./founder/founder_equity_M"));

// --- Other Founder Features ---
router.use("/founder", require("./founder/founder_company"));
router.use("/founder", require("./founder/founder_validation"));
router.use("/founder", require("./founder/founder_document"));
router.use("/founder", require("./founder/founder_storage"));
router.use("/founder", require("./founder/founder_uploads"));
// Founder routes
router.use("/founder", require("./founder/founder_signature"));
router.use("/founder", require("./founder/founder_board_safe"));
router.use("/founder", require("./founder/founder_board_notes"));
router.use("/founder", require("./founder/founder_inv_bridge"));
// Founder venture pending/accept/cancel routes
router.use("/founder", require("./founder/founder_ventures"));
router.use("/founder", require("./founder/founder_venture_chats"));
router.use("/founder/pitch", require("./founder/founder_pitch"));
router.use("/founder/messages", require("./founder/founder_message"));
router.use("/founder", require("./founder/founder_active"));
router.use("/founder/messages", require("./founder/founder_idverification"));
router.use("/founder", require("./founder/founder_protata_safe"));
// Also mount under a more descriptive path
router.use("/founder/verification", require("./founder/founder_idverification"));

// Persona webhooks receiver
router.use("/webhooks/persona", require("./webhooks/persona"));

// Founder venture requests
router.use("/", require("./startup_request"));

// Back-compat media alias: map legacy profile paths to signed media
router.use("/", require("./media_alias"));

// --- Angel Investor Routes ---
router.use("/angel", require("./angel_investor/auth"));
router.use("/angel", require("./angel_investor/onboarding"));
router.use("/angel", require("./angel_investor/dashboard"));
router.use("/angel", require("./angel_investor/flowdeck"));
router.use("/angel", require("./angel_investor/covenant"));
router.use("/angel", require("./angel_investor/startups"));
router.use("/angel", require("./angel_investor/startup_pipeline_chat"));
router.use("/angel", require("./angel_investor/messages"));
router.use("/angel", require("./angel_investor/settings"));
router.use("/angel", require("./angel_investor/payments"));
router.use("/angel", require("./angel_investor/startup_pending"));
router.use("/angel", require("./angel_investor/startup_pipeline_termsheet"));
router.use("/", require("./angel_investor/deal_termsheet_safe"));
router.use("/angel", require("./angel_investor/startup_pipeline_legal_safe"));
router.use(
  "/angel/startup_pipeline_legal_safe_valuationcap",
  require("./angel_investor/startup_pipeline_legal_safe_valuationcap")
);
router.use(
  "/angel/startup_pipeline_legal_safe_mfn",
  require("./angel_investor/startup_pipeline_legal_safe_mfn")
);
router.use(
  "/angel/startup_pipeline_legal_safe_discount",
  require("./angel_investor/startup_pipeline_legal_safe_discount")
);

// Legal Document Specifics or Angel Investor routes
router.use(
  "/angel/startup_pipeline_legal_safe_board_consent",
  require("./angel_investor/startup_pipeline_legal_safe_board_consent")
);
router.use(
  "/startup_pipeline_legal_safe_board_consent",
  require("./angel_investor/startup_pipeline_legal_safe_board_consent")
);

// --- Account number issuance ---
router.use("/", require("./account_number"));

// --- Versioned deal term sheet routes (SAFE/NOTE) ---
router.use("/", require("./deal_termsheet_safe"));
router.use("/", require("./deal_termsheet_note"));

// --- Call + meeting endpoints ---
router.use("/", require("./calls"));

// --- Investor-facing SAFE Term Sheet (read-only JSON)
router.use("/", require("./angel_investor/termsheet_safe"));

// --- Dev-only helpers ---
router.use("/founder", require("./founder/founder_dev"));

// --- Media (protected streaming) ---
router.use("/", require("./media"));

// --- VC Firm Admin routes ---
router.use("/vcfirm/admin", require("./vc-firm/admin/auth"));

module.exports = router;
