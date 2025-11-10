const express = require('express');
const router = express.Router();
const {
  getPartners,
  invitePartner,
  getPartnerById,
  updatePartner,
  deletePartner
} = require('../../../controllers/vc-firm/admin/partnersController');

// Get all partners for a firm (Admin only)
router.get('/', getPartners);

// Invite new partner (Admin only)
router.post('/invite', invitePartner);

// Get specific partner (Admin only)
router.get('/:partnerId', getPartnerById);

// Update partner (Admin only)
router.put('/:partnerId', updatePartner);

// Delete partner (Admin only)
router.delete('/:partnerId', deletePartner);

module.exports = router;