const express = require('express');
const { PrismaClient } = require('@prisma/client');
const pageTemplateService = require('../utils/pageTemplateService');
const { APP_NAME, FRONTEND_URL } = require('../utils/appConfig');
const router = express.Router();
const prisma = new PrismaClient();

// Verification callback landing page (Persona redirects here after flow)
router.get('/', async (req, res) => {
  try {
    const { inquiry_id, reference_id, status } = req.query || {};

    // Best-effort DB update for status
    if (inquiry_id) {
      try {
        await prisma.founder_id_verification.update({
          where: { persona_inquiry_id: String(inquiry_id) },
          data: { persona_inquiry_status: status || undefined, updated_at: new Date() },
        }).catch(() => { });
      } catch (_) { }
    }

    // Determine status class and message based on status
    let statusClass = 'pending';
    let statusText = 'Under Review';
    let nextStepsText = 'Our team is reviewing your submitted documents. This process typically takes 1-3 business days. You will receive an email notification once the review is complete.';

    if (status === 'approved' || status === 'passed') {
      statusClass = 'approved';
      statusText = 'Approved';
      nextStepsText = `Your identity has been successfully verified! You can now access all features of your ${APP_NAME} account.`;
    } else if (status === 'declined' || status === 'failed') {
      statusClass = 'rejected';
      statusText = 'Needs Review';
      nextStepsText = 'We need additional information to complete your verification. Please check your email for detailed instructions or contact our support team.';
    }

    const templateData = {
      INQUIRY_ID: inquiry_id || 'Not available',
      STATUS: status || 'pending',
      REFERENCE_ID: reference_id || inquiry_id || 'N/A',
      STATUS_CLASS: statusClass,
      STATUS_TEXT: statusText,
      NEXT_STEPS_TEXT: nextStepsText,
      DASHBOARD_URL: process.env.FRONTEND_URL || FRONTEND_URL
    };

    const html = pageTemplateService.getVerificationCallbackTemplate(templateData);
    return res.status(200).send(html);
  } catch (err) {
    console.error('verification callback error', err);
    const errorHtml = pageTemplateService.getInternalServerError();
    return res.status(500).send(errorHtml || '<html><body><h1>Error</h1><p>Internal server error.</p></body></html>');
  }
});

module.exports = router;
