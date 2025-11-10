const express = require("express");
const router = express.Router();
const controller = require("../../controllers/angel_investor/startup_pipeline_legal_safe_valuationcapController");

// GET valuation cap doc + signatures
router.get("/:deal_id", controller.getValuationCap);

// Founder signs
router.post("/:deal_id/founder-sign", controller.signFounder);

// Investor signs
router.post("/:deal_id/investor-sign", controller.signInvestor);

module.exports = router;
