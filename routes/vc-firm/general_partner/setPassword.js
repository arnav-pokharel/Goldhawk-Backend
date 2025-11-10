const express = require('express');
const router = express.Router();
const {
  setPassword,
  verifyToken
} = require('../../../controllers/vc-firm/general_partners/setPasswordController');

// Verify invitation token
router.get('/verify-token', verifyToken);

// Set password for invited partner
router.post('/set-password', setPassword);

module.exports = router;