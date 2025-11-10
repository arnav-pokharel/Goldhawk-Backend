const express = require('express');
const router = express.Router();
const {
  login,
  checkSession,
  logout
} = require('../../../controllers/vc-firm/general_partners/loginController');

// Authentication routes
router.post('/login', login);
router.get('/check-session', checkSession);
router.post('/logout', logout);

module.exports = router;