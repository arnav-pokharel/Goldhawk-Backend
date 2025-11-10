const express = require('express');
const router = express.Router();
const ctrl = require('../../controllers/founder/founder_emailverificationController');

// Send / Resend email verification link
router.post('/send', ctrl.send);
router.post('/resend', ctrl.resend);

// Confirm email (HTML page)
router.get('/confirm', ctrl.confirm);

module.exports = router;

