// routes/founder/founder_signature.js
const express = require("express");
const router = express.Router();
const founderSignatureController = require("../../controllers/founder/founder_signatureController");

// POST /api/founder/signature
router.post("/", founderSignatureController.saveFounderSignature);

module.exports = router;
