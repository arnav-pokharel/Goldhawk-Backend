const express = require('express');
const router = express.Router();
const { getLegals } = require('../../controllers/founder/founder_legalController');
// const { requireAuth } = require('../../../middleware/auth'); // Example: if you have auth middleware

/**
 * @swagger
 * /founder/legals:
 *   get:
 *     summary: Fetches legal documents and their status for a founder
 *     tags: [Founder, Legals]
 *     parameters:
 *       - in: query
 *         name: uid
 *         schema:
 *           type: string
 *         required: true
 *         description: The unique ID of the founder.
 *     responses:
 *       200:
 *         description: A list of legal documents and their statuses.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 documents:
 *                   type: array
 *       400:
 *         description: Founder UID is required.
 *       500:
 *         description: Internal server error.
 */
router.get('/', /* requireAuth, */ getLegals);

module.exports = router;