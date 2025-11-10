// routes/founder/founder_safe.js
const express = require("express");
const router = express.Router();
const { getSafe, saveSafe } = require("../../controllers/founder/founder_safeController");

// GET /founder/:uid/safe
router.get("/:uid/safe", getSafe);

// POST /founder/:uid/safe
router.post("/:uid/safe", saveSafe);
// Discount SAFE signature routes are handled in routes/founder/founder_dis_safe.js

module.exports = router;
