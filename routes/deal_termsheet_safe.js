const express = require('express');
const router = express.Router();

const controller = require('../controllers/vc-firm/general_partners/deal_termsheet_safeController');

// Versioned SAFE term sheet flows (deal-scoped)
// Accept: locks the latest version for this deal
router.post('/deal/termsheet/safe/:deal_id/accept', controller.accept);

// Offer/Change: creates a new version row for this deal and unlocks
router.post('/deal/termsheet/safe/:deal_id/offer', controller.offer);

// Optional ping endpoint (no-op for data, reserved for notifications)
router.post('/deal/termsheet/safe/:deal_id/ping', controller.ping);

// Fetch the latest/current version for the deal
router.get('/deal/termsheet/safe/:deal_id/current', controller.getCurrent);

// Fetch the history (all versions below latest)
router.get('/deal/termsheet/safe/:deal_id/history', controller.getHistory);

module.exports = router;
