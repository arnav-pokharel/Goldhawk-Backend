const express = require('express');
const router = express.Router();
const angel_auth = require('../../../middleware/auth');
const {
  angel_saveOnboardingStep1,
  angel_saveOnboardingStep2,
  angel_submitOnboarding
} = require('../../../controllers/angel_vc_onboarding');

// Protected routes
router.post('/angel_onboarding/step1', angel_auth, angel_saveOnboardingStep1);
router.post('/angel_onboarding/step2', angel_auth, angel_saveOnboardingStep2);
router.post('/angel_onboarding/submit', angel_auth, angel_submitOnboarding);

module.exports = router;