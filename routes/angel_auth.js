const express = require('express');
const router = express.Router();
const {
  angel_signup,
  angel_verifyEmail,
  angel_login,
  angel_logout
} = require('../controllers/angel_investor/angel_auth');

// Public routes
router.post('/angel_signup', angel_signup);
router.post('/angel_verify-email', angel_verifyEmail);
router.post('/angel_login', angel_login);
router.post('/angel_logout', angel_logout);

module.exports = router;