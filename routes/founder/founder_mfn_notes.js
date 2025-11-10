const express = require("express");
const router = express.Router();
const auth = require("../../middleware/auth");
const {
  getMfnAgreementNotes,
  saveMfnAgreementNotes,
} = require("../../controllers/founder/founder_mfn_notesController");

// Fetch MFN Agreement signature JSON (preview)
router.get("/:uid/notes/mfn-agreement", auth, getMfnAgreementNotes);

// Save MFN Agreement signature JSON (write-once)
router.post("/:uid/notes/mfn-agreement/sign", auth, saveMfnAgreementNotes);

module.exports = router;

