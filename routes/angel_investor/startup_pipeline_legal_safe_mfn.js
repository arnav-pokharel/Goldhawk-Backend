const express = require("express");
const router = express.Router();
const controller = require("../../controllers/angel_investor/startup_pipeline_legal_safe_mfnController");

router.get("/:deal_id", controller.getMFNSafe);
router.post("/:deal_id/founder-sign", controller.signFounder);
router.post("/:deal_id/investor-sign", controller.signInvestor);

module.exports = router;

