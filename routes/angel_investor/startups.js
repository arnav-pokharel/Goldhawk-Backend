const express = require('express');
const router = express.Router();
const startupsController = require('../../controllers/angel_investor/startupsController');
const { authenticateToken } = require('../../controllers/angel_investor/middleware/auth');

router.use(authenticateToken);

// Pipeline management
router.get('/startups/pending', startupsController.getPendingDeals);
router.get('/startups/pipeline', startupsController.getPipelineDeals);
router.get('/startups/portfolio', startupsController.getPortfolioDeals);
router.get('/startups/deal/:deal_id', startupsController.getDealDetails);

// Term sheet management
router.get('/startups/deal/:deal_id/termsheet', startupsController.getTermSheet);
router.post('/startups/deal/:deal_id/termsheet', startupsController.proposeTermSheet);
router.put('/startups/deal/:deal_id/termsheet/accept', startupsController.acceptTermSheet);

// Meeting management
router.get('/startups/deal/:deal_id/meetings', startupsController.getMeetings);
router.post('/startups/deal/:deal_id/meetings', startupsController.scheduleMeeting);
router.get('/startups/deal/:deal_id/meetings/:id/logs', startupsController.getMeetingLogs);

// Legal documents
router.get('/startups/deal/:deal_id/legals', startupsController.getLegalDocuments);
router.post('/startups/deal/:deal_id/legals/sign', startupsController.signLegalDocument);

// Chat functionality
router.get('/startups/deal/:deal_id/chat', startupsController.getChatMessages);
router.post('/startups/deal/:deal_id/chat', startupsController.sendChatMessage);

// Investment action
router.post('/startups/deal/:deal_id/invest', startupsController.makeInvestment);

module.exports = router;