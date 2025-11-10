const express = require('express');
const router = express.Router();

// Authentication routes
router.use('/auth', require('./auth'));

// Partner management routes (Admin only)
router.use('/partners', require('./partners'));

module.exports = router;