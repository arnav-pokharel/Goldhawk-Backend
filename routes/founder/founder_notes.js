// routes/founder/founder_note.js
const express = require("express");
const router = express.Router();
const { getNotes, saveNotes } = require("../../../controllers/founder/founder_noteController");

// GET /founder/:uid/notes
router.get("/:uid/notes", getNotes);

// POST /founder/:uid/notes
router.post("/:uid/notes", saveNotes);

module.exports = router;