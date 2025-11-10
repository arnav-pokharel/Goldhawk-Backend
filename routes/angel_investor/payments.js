const express = require('express');
const router = express.Router();
const paymentsController = require('../../controllers/angel_investor/paymentsController');
const { authenticateToken } = require('../../controllers/angel_investor/middleware/auth');


router.use(authenticateToken);

router.get('/payments/methods', paymentsController.getPaymentMethods);
router.post('/payments/methods', paymentsController.addPaymentMethod);
router.delete('/payments/methods/:id', paymentsController.removePaymentMethod);
router.get('/payments/history', paymentsController.getPaymentHistory);
router.get('/payments/receipts/:id', paymentsController.getPaymentReceipt);

module.exports = router;