const express = require('express');
const router = express.Router();
const controller = require('../controllers/vc-firm/admin/startup_requestController');

// Founder unread venture requests indicator
router.get('/founder/:uid/ventures/unread', controller.getUnread);
router.post('/founder/:uid/ventures/mark_read', controller.markRead);

module.exports = router;

