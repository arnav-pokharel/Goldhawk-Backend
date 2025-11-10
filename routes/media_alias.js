const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { getPrivateUrl } = require('../services/s3');

// Back-compat: map legacy app paths to media stream URLs without requiring auth
// Example: /api/ang_investor/:uid/profile/:file -> redirect to CloudFront or signed stream
router.get('/ang_investor/:uid/profile/:file', async (req, res) => {
  try {
    const { uid, file } = req.params;
    if (!uid || !file) return res.status(400).json({ error: 'Invalid path' });
    const key = `ang_investor/${uid}/profile/${file}`;

    const ttlSec = Number(process.env.MEDIA_TOKEN_TTL_SEC || 6 * 60 * 60);
    const base = `${req.protocol}://${req.get('host')}`;
    try {
      const privateUrl = await getPrivateUrl(key, ttlSec);
      if (privateUrl) return res.redirect(302, privateUrl);
    } catch (_) { }

    const secrets = [process.env.COOKIE_SECRET, process.env.JWT_SECRET, process.env.SESSION_SECRET].filter(Boolean);
    const secret = secrets[0];
    if (!secret) return res.status(500).json({ error: 'Server not configured for media signing' });
    const token = jwt.sign({ bucket: process.env.S3_BUCKET_NAME, key }, secret, { expiresIn: ttlSec });
    const url = `${base}/api/media/stream-signed?token=${encodeURIComponent(token)}`;
    return res.redirect(302, url);
  } catch (e) {
    console.error('media_alias error:', e);
    return res.status(500).json({ error: 'Failed to resolve media' });
  }
});

module.exports = router;
