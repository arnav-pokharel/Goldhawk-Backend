const express = require("express");
const router = express.Router();
const { checkFounderActive } = require("../../controllers/founder/founder_activeController");

// Endpoint: GET /api/founder/active/check/:uid
router.get("/active/check/:uid", checkFounderActive);

module.exports = router;
