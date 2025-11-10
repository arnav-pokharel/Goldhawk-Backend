const express = require("express");
const router = express.Router();
const auth = require("../../middleware/auth");
const {
  getFounderEquityM,
  saveFounderEquityM,
} = require("../../controllers/founder/founder_equity_MController");

router.get("/:uid/equity/m", auth, getFounderEquityM);
router.post("/:uid/equity/m/sign", auth, saveFounderEquityM);

module.exports = router;
