const express = require('express');
const router = express.Router();
const ctrl = require('../../controllers/founder/founder_idverificationController');

// Create ID verification inquiry and email the link
router.post('/create', ctrl.createFounderVerification);

// Optional: expose session creation for debugging
router.post('/session', ctrl.createPersonaSession);

// Fetch rows
router.get('/:uid', ctrl.getFounderVerification);

// Update status (webhook/worker)
router.post('/update', ctrl.updateFounderVerification);

module.exports = router;
