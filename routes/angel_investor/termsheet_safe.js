const express = require('express');
const router = express.Router();
const controller = require('../../controllers/angel_investor/termsheet_safeController');

// Public read-only endpoint for investor-facing SAFE term sheet JSON
// GET /api/startup/:uid/termsheet_safe
router.get('/startup/:uid/termsheet_safe', controller.getStartupSafeTermsheet);

module.exports = router;
