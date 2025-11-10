const express = require("express");
const router = express.Router();
const auth = require("../../middleware/auth");
const {
  getFounderEquityI,
  saveFounderEquityI,
} = require("../../controllers/founder/founder_equity_IController");

router.get("/:uid/equity/i", auth, getFounderEquityI);
router.post("/:uid/equity/i/sign", auth, saveFounderEquityI);

module.exports = router;
