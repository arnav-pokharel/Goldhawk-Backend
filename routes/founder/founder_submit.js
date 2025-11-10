// routes/founder/founder_submit.js
const express = require("express");
const router = express.Router();
const { finalizeOnboarding } = require("../../controllers/founder/founder_submitController");

// POST /founder/:uid/submit
router.post("/:uid/submit", finalizeOnboarding);

module.exports = router;
