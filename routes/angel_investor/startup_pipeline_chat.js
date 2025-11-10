const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../controllers/angel_investor/middleware/auth');
const ctrl = require('../../controllers/angel_investor/startup_pipeline_chatController');

router.use(authenticateToken);

// GET/POST chat for a startup in investor pipeline by startup uid
router.get('/startups/pipeline/:uid/chat', ctrl.getChat);
router.post('/startups/pipeline/:uid/chat', ctrl.postMessage);
router.post('/startups/pipeline/:uid/chat/read', ctrl.markRead);
router.get('/startups/unread', ctrl.getUnreadSummary);

module.exports = router;
