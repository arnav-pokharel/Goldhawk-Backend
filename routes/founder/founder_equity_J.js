const express = require("express");
const router = express.Router();
const auth = require("../../middleware/auth");
const {
  getFounderEquityJ,
  saveFounderEquityJ,
} = require("../../controllers/founder/founder_equity_JController");

router.get("/:uid/equity/j", auth, getFounderEquityJ);
router.post("/:uid/equity/j/sign", auth, saveFounderEquityJ);

module.exports = router;
