const express = require("express");
const router = express.Router();
const auth = require("../../middleware/auth");
const { getMFNSafe, saveMFNSafe } = require("../../controllers/founder/founder_mfn_safeController");

// Fetch MFN SAFE signature JSON (preview)
router.get("/:uid/safe/mfn", auth, getMFNSafe);

// Save MFN SAFE signature JSON (write-once)
router.post("/:uid/safe/mfn/sign", auth, saveMFNSafe);

module.exports = router;
