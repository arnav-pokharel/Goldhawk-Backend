const express = require("express");
const router = express.Router();
const auth = require("../../middleware/auth");
const {
  getTermSheetNotes,
  saveTermSheetNotes,
} = require("../../controllers/founder/founder_termsheet_notesController");

// Fetch Term Sheet signature JSON (preview)
router.get("/:uid/notes/term-sheet", auth, getTermSheetNotes);

// Save Term Sheet signature JSON (write-once)
router.post("/:uid/notes/term-sheet/sign", auth, saveTermSheetNotes);

module.exports = router;

