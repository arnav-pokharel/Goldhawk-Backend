const express = require('express');
const router = express.Router();
const settingsController = require('../../controllers/angel_investor/settingsController');
const { authenticateToken } = require('../../controllers/angel_investor/middleware/auth');


router.use(authenticateToken);

router.get('/settings/profile', settingsController.getProfile);
router.put('/settings/profile', settingsController.updateProfile);
router.put('/settings/email', settingsController.changeEmail);
router.post('/settings/verify-email', settingsController.verifyEmail);
router.post('/settings/send-otp-current', settingsController.sendOtpToCurrentEmail);
router.put('/settings/password', settingsController.changePassword);
router.put('/settings/preferences', settingsController.updatePreferences);

module.exports = router;
