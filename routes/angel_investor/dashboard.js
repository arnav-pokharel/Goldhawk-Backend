const express = require('express');
const router = express.Router();
const dashboardController = require('../../controllers/angel_investor/dashboardController');
const { authenticateToken } = require('../../controllers/angel_investor/middleware/auth');


router.use(authenticateToken);

router.get('/dashboard/stats', dashboardController.getStats);
router.get('/dashboard/overview', dashboardController.getOverview);

module.exports = router;