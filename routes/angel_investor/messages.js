const express = require('express');
const router = express.Router();
const messagesController = require('../../controllers/angel_investor/messagesController');
const { authenticateToken } = require('../../controllers/angel_investor/middleware/auth');


router.use(authenticateToken);

router.get('/messages/support', messagesController.getSupportMessages);
router.post('/messages/support', messagesController.sendSupportMessage);

module.exports = router;