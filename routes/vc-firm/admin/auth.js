const express = require('express');
const router = express.Router();
const onboadingController = require('../../../controllers/vc-firm/admin/onboardingController');
const {
  admin_signup,
  admin_verifyEmail,
  admin_login,
  resendOtp,
  checkEmailExists,
  checkSession,
  getFirmProfile,
  admin_logout
} = require('../../../controllers/vc-firm/admin/authController');

router.get('/test', (req, res) => {
  console.log(" VC Firm test route hit!");
  res.json({
    success: true,
    message: 'VC Firm test route working',
    timestamp: new Date().toISOString()
  });
});

// Authentication routes
router.post('/signup', admin_signup);
router.post('/verify-email', admin_verifyEmail);
router.post('/login', admin_login);
router.post('/resend-otp', resendOtp);

// Utility routes
router.get('/check-email', checkEmailExists);
router.get('/check-session', checkSession);
router.get('/profile/:uid', getFirmProfile);
router.post('/logout', admin_logout);

// Onboarding routes
router.use('/onboarding', onboadingController.saveOnboardingData);

module.exports = router;