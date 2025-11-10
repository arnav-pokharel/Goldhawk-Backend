const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../controllers/angel_investor/middleware/auth');
const controller = require('../../controllers/angel_investor/deal_termsheet_safeController');

// All endpoints require an authenticated angel investor
router.use(authenticateToken);

// Investor proposes an edited SAFE offer
// POST /api/angel/termsheet/safe/:uid/offer
router.post('/angel/termsheet/safe/:uid/offer', controller.offer);

// Investor accepts startup's original SAFE term sheet
// POST /api/angel/termsheet/safe/:uid/accept
router.post('/angel/termsheet/safe/:uid/accept', controller.accept);

// Investor pings startup with a note (pending status)
router.post('/angel/termsheet/safe/:uid/ping', controller.ping);

module.exports = router;
