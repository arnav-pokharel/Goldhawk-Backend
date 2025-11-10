const express = require('express');
const router = express.Router();
const controller = require('../../controllers/angel_investor/startup_pipeline_legal_safeController');
const { authenticateToken } = require('../../controllers/angel_investor/middleware/auth');

// All routes below require investor auth
router.use(authenticateToken);

// GET /angel/startups/deal/:deal_id/legals/safe
// Returns a computed list of SAFE legal documents to show based on deal_safe settings
router.get('/startups/deal/:deal_id/legals/safe', controller.getSafeLegalDocuments);

// Values endpoint for SAFE fields
router.get('/startups/deal/:deal_id/legals/safe/values', controller.getSafeValues);

module.exports = router;
