const express = require('express');
const router = express.Router();
const founderVerificationController = require('../../controllers/founder/founder_idverificationController');
const crypto = require('crypto');

// Persona sends webhook payloads describing inquiry events. This endpoint
// performs an optional HMAC signature check (if PERSONA_WEBHOOK_SECRET is set)
// and then forwards the inquiry id + status to the verification update handler.
router.post('/', express.json(), async (req, res) => {
  try {
    const secret = process.env.PERSONA_WEBHOOK_SECRET;
    if (secret) {
      const sig = req.headers['x-persona-signature'] || req.headers['x-signature'];
      if (!sig) return res.status(400).send('Missing signature');
      const hmac = crypto.createHmac('sha256', secret).update(JSON.stringify(req.body)).digest('hex');
      if (hmac !== sig) return res.status(401).send('Invalid signature');
    }

    const body = req.body || {};
    // Persona event payloads vary. Attempt to extract inquiry id and status.
    const inquiryId = body?.data?.id || body?.resource?.id || body?.inquiry_id;
    const status = body?.data?.attributes?.status || body?.resource?.status || body?.status;

    if (!inquiryId) return res.status(400).send('Missing inquiry id');

    // Map Persona status to our DB values if necessary
    // For simplicity, pass through the status string.
    await founderVerificationController.updateFounderVerification({ body: { inquiryId, status, reason: body?.data?.attributes?.reason || null } }, {
      json: (obj) => obj,
      status: (code) => ({ send: (msg) => { } }),
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('persona webhook error', err);
    return res.status(500).json({ success: false });
  }
});

module.exports = router;
