const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../controllers/angel_investor/middleware/auth');
const controller = require('../../controllers/angel_investor/startup_pipeline_termsheetController');

router.use(authenticateToken);

// GET /angel/startup/pipeline/:uid/termsheet
// Returns { deal_id, fund_type, current, history[], locked }
router.get('/startup/pipeline/:uid/termsheet', controller.getByStartup);

module.exports = router;
