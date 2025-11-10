const express = require('express');
const router = express.Router();
const ctrl = require('../../controllers/founder/founder_venturesController');

// Pending venture requests for a founder
router.get('/:uid/ventures/requests', ctrl.getPendingDeals);
// Active venture deals
router.get('/:uid/ventures/active', ctrl.getActiveDeals);

// Deal actions
router.post('/deal/:dealId/cancel', ctrl.cancelDeal);
router.post('/deal/:dealId/accept', ctrl.acceptDeal);
// Alternate paths for compatibility
router.post('/ventures/deal/:dealId/cancel', ctrl.cancelDeal);
router.post('/ventures/deal/:dealId/accept', ctrl.acceptDeal);

module.exports = router;
