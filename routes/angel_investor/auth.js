const express = require('express');
const router = express.Router();
const authController = require('../../controllers/angel_investor/authController');
const { validateSignup, validateOTP } = require('../../controllers/angel_investor/middleware/validation');

// Authentication routes
router.post('/signup', validateSignup, authController.signup);
router.post('/verify-email', validateOTP, authController.verifyEmail);
router.post('/resend-otp', authController.resendOTP);
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

module.exports = router;