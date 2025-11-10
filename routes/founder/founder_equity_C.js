const express = require("express");
const router = express.Router();
const auth = require("../../middleware/auth");
const {
  getFounderEquityC,
  saveFounderEquityC,
} = require("../../controllers/founder/founder_equity_CController");

router.get("/:uid/equity/c", auth, getFounderEquityC);
router.post("/:uid/equity/c/sign", auth, saveFounderEquityC);

module.exports = router;
