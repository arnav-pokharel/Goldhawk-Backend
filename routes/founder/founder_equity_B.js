const express = require("express");
const router = express.Router();
const auth = require("../../middleware/auth");
const {
  getFounderEquityB,
  saveFounderEquityB,
} = require("../../controllers/founder/founder_equity_BController");

router.get("/:uid/equity/b", auth, getFounderEquityB);
router.post("/:uid/equity/b/sign", auth, saveFounderEquityB);

module.exports = router;
