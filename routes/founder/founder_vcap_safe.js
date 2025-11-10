const express = require("express");
const router = express.Router();
const auth = require("../../middleware/auth");
const {
  getValuationCapSafe,
  saveValuationCapSafe,
} = require("../../controllers/founder/founder_vcap_safeController");

// Fetch Valuation Cap SAFE signature JSON (preview)
router.get("/:uid/safe/valuation-cap", auth, getValuationCapSafe);

// Save Valuation Cap SAFE signature JSON (write-once)
router.post("/:uid/safe/valuation-cap/sign", auth, saveValuationCapSafe);

module.exports = router;
