const express = require("express");
const router = express.Router();
const auth = require("../../middleware/auth");
const {
  getFounderEquityD,
  saveFounderEquityD,
} = require("../../controllers/founder/founder_equity_DController");

router.get("/:uid/equity/d", auth, getFounderEquityD);
router.post("/:uid/equity/d/sign", auth, saveFounderEquityD);

module.exports = router;
