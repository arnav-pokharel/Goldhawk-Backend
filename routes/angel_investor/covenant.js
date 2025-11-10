const express = require('express');
const router = express.Router();
const covenantController = require('../../controllers/angel_investor/covenantController');
const { authenticateToken } = require('../../controllers/angel_investor/middleware/auth');


router.use(authenticateToken);

router.get('/covenant/status', covenantController.getStatus);
router.post('/covenant/kyc', covenantController.submitKYC);
router.post('/covenant/plaid-link', covenantController.linkPlaid);
router.get('/covenant/fund-status', covenantController.getFundStatus);
router.post('/covenant/investment-profile', covenantController.saveInvestmentProfile);
router.get('/covenant/investment-profile', covenantController.getInvestmentProfile);

module.exports = router;