const express = require('express');
const router = express.Router();

// Authentication routes
router.use('/auth', require('./auth'));

// Set password routes (for invited partners)
router.use('/set-password', require('./setPassword'));

// Dashboard and partner management routes
router.use('/dashboard', require('./dashboard'));

module.exports = router;