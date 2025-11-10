const express = require("express");
const router = express.Router();
const auth = require("../../middleware/auth");
const {
  getFounderEquityL,
  saveFounderEquityL,
} = require("../../controllers/founder/founder_equity_LController");

router.get("/:uid/equity/l", auth, getFounderEquityL);
router.post("/:uid/equity/l/sign", auth, saveFounderEquityL);

module.exports = router;
