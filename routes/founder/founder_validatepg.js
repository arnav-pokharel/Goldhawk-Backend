const express = require("express");
const { getNextStep, redirectToNext } = require("../../controllers/founder/founder_validatepgController");

const router = express.Router();

// Returns { next, progress }
router.get("/:uid/validate/next", getNextStep);

// Redirects (302) to the next page
router.get("/:uid/validate/redirect", redirectToNext);

module.exports = router;

