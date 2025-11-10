const express = require("express");
const router = express.Router();
const boardConsentController = require("../../controllers/angel_investor/startup_pipeline_legal_safe_board_consentController");

// GET SAFE + board consent data for a deal
router.get("/:deal_id", boardConsentController.getBoardConsent);

module.exports = router;

