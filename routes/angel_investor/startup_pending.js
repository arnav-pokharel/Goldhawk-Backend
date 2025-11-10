const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../controllers/angel_investor/middleware/auth');
const controller = require('../../controllers/angel_investor/startup_pendingController');

router.use(authenticateToken);

// GET /api/angel/startup/pending
router.get('/startup/pending', controller.list);

module.exports = router;
