const express = require("express");
const router = express.Router();
const auth = require("../../middleware/auth");
const {
  getFounderEquityK,
  saveFounderEquityK,
} = require("../../controllers/founder/founder_equity_KController");

router.get("/:uid/equity/k", auth, getFounderEquityK);
router.post("/:uid/equity/k/sign", auth, saveFounderEquityK);

module.exports = router;
