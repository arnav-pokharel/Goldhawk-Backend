const express = require('express');
const router = express.Router();
const onboardingController = require('../../controllers/angel_investor/onboardingController');
const { authenticateToken } = require('../../controllers/angel_investor/middleware/auth');

// Public onboarding routes (mirror founder/signup logic)
router.post('/onboarding/signup', onboardingController.signupAngel);
router.post('/onboarding/verify-otp', onboardingController.verifyOtp);
router.get('/onboarding/exists', onboardingController.checkEmailExists);
router.get('/onboarding/session', onboardingController.checkSession);
router.get('/onboarding/onboarding-status', onboardingController.getOnboardingStatus);

// Protected onboarding routes (require authenticated angel)
router.use(authenticateToken);
router.get('/onboarding/profile', onboardingController.getProfile);
router.post('/onboarding/personal', onboardingController.updatePersonalInfo);
router.post('/onboarding/verify-phone', onboardingController.verifyPhone);
router.post('/onboarding/upload-photo', onboardingController.uploadPhoto);

module.exports = router;
