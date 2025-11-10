const express = require("express");
const router = express.Router();
const auth = require("../../middleware/auth");
const {
  getFounderEquityA,
  saveFounderEquityA,
} = require("../../controllers/founder/founder_equity_AController");

// Fetch Founder Stock Purchase Agreement JSON
router.get("/:uid/equity/a", auth, getFounderEquityA);

// Save Founder Stock Purchase Agreement JSON
router.post("/:uid/equity/a/sign", auth, saveFounderEquityA);

module.exports = router;
