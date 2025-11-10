const express = require('express');
const router = express.Router();
const ctrl = require('../../controllers/founder/founder_venture_chatController');

// Founder venture chat by investor UID (deal resolved server-side)
router.get('/venture/chats/:investorUid', ctrl.getChat);
router.post('/venture/chats/:investorUid', ctrl.postMessage);
router.post('/venture/chats/:investorUid/read', ctrl.markRead);
router.get('/venture/chats/:investorUid/unread', ctrl.getUnreadStatus);
// Founder-wide chat unread summary
router.get('/chats/unread/:uid', ctrl.getUnreadSummaryFounder);

module.exports = router;
