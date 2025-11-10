const express = require("express");
const router = express.Router();
const auth = require("../../middleware/auth");
const {
  getFounderEquityH,
  saveFounderEquityH,
} = require("../../controllers/founder/founder_equity_HController");

router.get("/:uid/equity/h", auth, getFounderEquityH);
router.post("/:uid/equity/h/sign", auth, saveFounderEquityH);

module.exports = router;
