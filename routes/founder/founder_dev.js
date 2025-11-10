const express = require('express');
const router = express.Router();
const dev = require('../../controllers/founder/founder_devController');

router.post('/_dev/create_test', dev.createTestFounder);
router.get('/_dev/founder/:uid', dev.getFounder);

module.exports = router;
