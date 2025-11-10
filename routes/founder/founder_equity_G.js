const express = require("express");
const router = express.Router();
const auth = require("../../middleware/auth");
const {
  getFounderEquityG,
  saveFounderEquityG,
} = require("../../controllers/founder/founder_equity_GController");

router.get("/:uid/equity/g", auth, getFounderEquityG);
router.post("/:uid/equity/g/sign", auth, saveFounderEquityG);

module.exports = router;
