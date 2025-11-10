const express = require('express');
const router = express.Router();
const controller = require('../controllers/vc-firm/admin/account_numberController');

// Issue a unique 10-digit account number for a founder after OTP verification
// POST /api/account_number/founder
// Body: { uid: <uuid>, name?: <company_name optional now, can be set later> }
router.post('/account_number/founder', controller.issueFounder);

// Issue a unique 10-digit account number for an angel investor after OTP verification
// POST /api/account_number/angel
// Body: { uid: <uuid>, name?: <angel_name optional now, can be set later> }
router.post('/account_number/angel', controller.issueAngel);

module.exports = router;
