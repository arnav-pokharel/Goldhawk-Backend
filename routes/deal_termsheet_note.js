const express = require('express');
const router = express.Router();

const controller = require('../controllers/vc-firm/general_partners/deal_termsheet_noteController');

// Versioned NOTE term sheet flows (deal-scoped)
router.post('/deal/termsheet/note/:deal_id/accept', controller.accept);
router.post('/deal/termsheet/note/:deal_id/offer', controller.offer);
router.post('/deal/termsheet/note/:deal_id/ping', controller.ping);

router.get('/deal/termsheet/note/:deal_id/current', controller.getCurrent);
router.get('/deal/termsheet/note/:deal_id/history', controller.getHistory);

module.exports = router;
