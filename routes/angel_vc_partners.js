const express = require('express');
const router = express.Router();
const angel_auth = require('../../../middleware/auth');
const {
  angel_getPartners,
  angel_addPartner,
  angel_acceptPartnerInvite
} = require('../../../controllers/angel_vc_partners');

// Protected routes
router.get('/angel_partners', angel_auth, angel_getPartners);
router.post('/angel_partners/add', angel_auth, angel_addPartner);
router.post('/angel_partners/accept-invite/:token', angel_auth, angel_acceptPartnerInvite);

module.exports = router;