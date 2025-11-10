const express = require("express");
const { logoutFounder } = require("../../controllers/founder/founder_logoutController");

const router = express.Router();
router.post("/logout", logoutFounder);

module.exports = router;
