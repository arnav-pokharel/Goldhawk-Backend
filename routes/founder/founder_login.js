const express = require("express");
const { loginFounder } = require("../../controllers/founder/founder_loginController");

const router = express.Router();
router.post("/login", loginFounder);

module.exports = router;
