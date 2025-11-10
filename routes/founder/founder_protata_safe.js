const express = require("express");
const router = express.Router();
const auth = require("../../middleware/auth");
const {
  getProRataSafe,
  saveProRataSafe,
} = require("../../controllers/founder/founder_prorata_safeController");

// Fetch Pro Rata Side Letter SAFE signature JSON (preview)
router.get("/:uid/safe/pro-rata-side-letter", auth, getProRataSafe);

// Save Pro Rata Side Letter SAFE signature JSON (write-once)
router.post("/:uid/safe/pro-rata-side-letter/sign", auth, saveProRataSafe);

module.exports = router;
