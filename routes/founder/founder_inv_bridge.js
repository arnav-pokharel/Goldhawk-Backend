const express = require('express');
const router = express.Router();
const ctrl = require('../../controllers/founder/founder_inv_bridgeController');

router.get('/investor/angel/:uid/profile', ctrl.getAngelProfile);

module.exports = router;

