const express = require('express');
const router = express.Router();
const { ensureAuthenticated, streamByKey, streamByUrl, issue, streamSigned } = require('../controllers/vc-firm/admin/mediaController');

// Do NOT require cookies/headers for the signed stream. The token itself authorizes access.
router.get('/media/stream-signed', streamSigned);

// Allow issuing a signed URL without cookie headers to unblock media display
// Founders already have CloudFront authorization; this returns a CDN or proxy URL
router.get('/media/issue', issue);

// All other media endpoints require authentication.
router.use(ensureAuthenticated);
router.get('/media/stream-by-key', streamByKey);
router.get('/media/stream-by-url', streamByUrl);

module.exports = router;
