const express = require("express");
const router = express.Router();
const auth = require("../../middleware/auth");
const {
  getProRataRightsNotes,
  saveProRataRightsNotes,
} = require("../../controllers/founder/founder_prorata_notesController");

// Fetch Pro Rata Rights signature JSON (preview)
router.get("/:uid/notes/pro-rata-rights", auth, getProRataRightsNotes);

// Save Pro Rata Rights signature JSON (write-once)
router.post("/:uid/notes/pro-rata-rights/sign", auth, saveProRataRightsNotes);

module.exports = router;

