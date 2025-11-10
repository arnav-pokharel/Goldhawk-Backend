const express = require("express");
const router = express.Router();
const auth = require("../../middleware/auth");
const {
  getFounderEquityE,
  saveFounderEquityE,
} = require("../../controllers/founder/founder_equity_EController");

router.get("/:uid/equity/e", auth, getFounderEquityE);
router.post("/:uid/equity/e/sign", auth, saveFounderEquityE);

module.exports = router;
