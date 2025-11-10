const express = require("express");
const router = express.Router();
const { saveConvertibleSignature } = require("../../controllers/founder/founder_convertibleController");

// Founder signs Convertible Notes inside dashboard
router.post("/:uid/convertible-notes/sign", saveConvertibleSignature);

module.exports = router;

