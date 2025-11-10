const express = require("express");
const router = express.Router();
const auth = require("../../middleware/auth");
const {
  getFounderEquityF,
  saveFounderEquityF,
} = require("../../controllers/founder/founder_equity_FController");

router.get("/:uid/equity/f", auth, getFounderEquityF);
router.post("/:uid/equity/f/sign", auth, saveFounderEquityF);

module.exports = router;
