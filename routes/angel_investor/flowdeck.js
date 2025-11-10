const express = require('express');
const router = express.Router();
const flowdeckController = require('../../controllers/angel_investor/flowdeckController');
const { authenticateToken } = require('../../controllers/angel_investor/middleware/auth');


router.use(authenticateToken);

router.get('/flowdeck/zenith', flowdeckController.getZenithView);
router.get('/flowdeck/focus/:uid', flowdeckController.getFocusView);
router.get('/flowdeck/filters', flowdeckController.getFilters);
router.post('/flowdeck/filters', flowdeckController.saveFilters);
router.get('/flowdeck/startup/:uid', flowdeckController.getStartupDetails);
router.post('/flowdeck/start-deal', flowdeckController.startDeal);
router.get('/flowdeck/termsheet/:deal_id', flowdeckController.viewTermSheet);
router.post('/flowdeck/termsheet/:deal_id/accept', flowdeckController.acceptTermSheet);
router.post('/flowdeck/termsheet/:deal_id/counter', flowdeckController.counterTermSheet);

module.exports = router;