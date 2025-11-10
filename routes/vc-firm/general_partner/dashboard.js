const express = require('express');
const router = express.Router();
const {
  getDashboardData,
  getFlowDeckStartups
} = require('../../../controllers/vc-firm/general_partners/dashboardController');

// Get dashboard overview
router.get('/', getDashboardData);

// Get flow deck startups
router.get('/flowdeck', getFlowDeckStartups);

module.exports = router;