const express = require("express");
const router = express.Router();
const auth = require("../../middleware/auth");
const {
  getTermSheetSafe,
  saveTermSheetSafe,
} = require("../../controllers/founder/founder_termsheet_safeController");

// Fetch Term Sheet SAFE signature JSON (preview)
router.get("/:uid/safe/term-sheet", auth, getTermSheetSafe);

// Save Term Sheet SAFE signature JSON (write-once)
router.post("/:uid/safe/term-sheet/sign", auth, saveTermSheetSafe);

module.exports = router;

