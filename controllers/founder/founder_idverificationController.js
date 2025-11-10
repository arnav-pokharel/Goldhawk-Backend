const { PrismaClient } = require("@prisma/client");
const axios = require("axios");
const crypto = require("crypto");
const transporter = require("../../utils/mailer");
const { APP_NAME, NO_REPLY_EMAIL, BACKEND_URL } = require("../../utils/appConfig");
const emailTemplateService = require("../../utils/emailTemplateService");
const pageTemplateService = require("../../utils/pageTemplateService");
const s3 = require("../../services/s3");

const prisma = new PrismaClient();

// 🔹 Always use sandbox until you go live
const PERSONA_API_URL =
  process.env.PERSONA_API_URL || "https://sandbox.withpersona.com/api/v1";
const PERSONA_API_VERSION = process.env.PERSONA_API_VERSION || "2023-01-05";

/**
 * Create a Persona inquiry-session to get client-token/start-url
 */
async function createPersonaSession(inquiryId) {
  if (!inquiryId) return null;
  try {
    const resp = await axios.post(
      `${PERSONA_API_URL}/inquiry-sessions`,
      {
        data: {
          type: "inquiry-session",
          // Ask Persona to include client-token and start-url in the response
          attributes: { inquiry_id: inquiryId, include: ["client_token", "start_url"] },
          relationships: {
            inquiry: { data: { type: "inquiry", id: inquiryId } },
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PERSONA_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "Persona-Version": PERSONA_API_VERSION,
        },
      }
    );

    console.debug(
      "createPersonaSession resp",
      JSON.stringify(resp.data || resp, null, 2)
    );

    const data = resp?.data?.data || {};
    const attrs = data?.attributes || {};

    const clientToken = attrs["client-token"] || attrs.client_token;
    const startUrl =
      attrs["start-url"] ||
      attrs["redirect-url"] ||
      attrs["redirect_uri"] ||
      null;

    if (clientToken) {
      return `https://withpersona.com/verify?client-token=${clientToken}`;
    }
    if (startUrl) return startUrl;

    console.debug(
      "Persona session did not include start-url or client-token; keys:",
      Object.keys(attrs || {})
    );
  } catch (e) {
    console.error(
      "createPersonaSession error",
      e?.response?.data || e?.message || e
    );
  }
  return null;
}

/**
 * 🔹 Create verification records for founders after onboarding
 */
exports.createFounderVerification = async (req, res) => {
  try {
    const { uid, founders } = req.body;
    const createdRows = [];

    for (const founder of founders) {
      let firstName = null,
        lastName = null,
        email = null,
        profilePictureUrl = null,
        rawPictureKey = null;

      let emailVerified = false;
      try {
        const s1 = await prisma.founder_step1.findFirst({
          where: { uid, founder_index: founder.index },
        });
        if (s1) {
          email = s1.founder_email || null;
          const full = s1.founder_full_name || "";
          const parts = full.trim().split(/\s+/);
          firstName = parts[0] || null;
          lastName = parts.length > 1 ? parts.slice(1).join(" ") : null;
          rawPictureKey = s1.founder_picture || null;
        }
        const existing = await prisma.founder_id_verification.findUnique({
          where: { uid_founder_index: { uid, founder_index: founder.index } },
        }).catch(() => null);
        emailVerified = existing?.email_verified === true;
      } catch {}

      // Guard: Identity verification requires verified email
      if (!emailVerified) {
        return res.status(400).json({
          success: false,
          error: 'Please verify email first',
          code: 'EMAIL_NOT_VERIFIED',
          uid,
          founder_index: founder.index,
        });
      }

      const fields = {};
      if (firstName) fields["name-first"] = firstName;
      if (lastName) fields["name-last"] = lastName;
      if (email) fields["email-address"] = email;

      // 🔹 Create Persona inquiry
      let resp;
      try {
        resp = await axios.post(
          `${PERSONA_API_URL}/inquiries`,
          {
            data: {
              type: "inquiry",
              attributes: {
                "inquiry-template-id": process.env.PERSONA_TEMPLATE_ID_GOV,
                "reference-id": `${uid}-${founder.index}`,
                fields,
              },
            },
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.PERSONA_API_KEY}`,
              "Content-Type": "application/json",
              Accept: "application/json",
              "Persona-Version": PERSONA_API_VERSION,
            },
          }
        );
      } catch (err) {
        console.error(
          "Persona inquiry creation failed:",
          err?.response?.data || err.message
        );
        return res.status(500).json({ error: "Persona inquiry creation failed" });
      }

      const inquiryId = resp.data.data.id;
      const attrs = resp.data.data.attributes || {};
      let inquiryUrl =
        attrs["redirect-url"] ||
        attrs["redirect_uri"] ||
        attrs["start-url"] ||
        null;

      if (!inquiryUrl) {
        inquiryUrl = await createPersonaSession(inquiryId);
      }
      // Final fallback: construct hosted link using inquiry-id directly
      if (!inquiryUrl) {
        inquiryUrl = `https://withpersona.com/verify?inquiry-id=${encodeURIComponent(inquiryId)}`;
      }

      const row = await prisma.founder_id_verification.upsert({
        where: { uid_founder_index: { uid, founder_index: founder.index } },
        update: {
          founder_name: founder.name || undefined,
          founder_email: email || undefined,
          persona_inquiry_id: inquiryId,
          verification_url: inquiryUrl,
          persona_inquiry_status: attrs.status || null,
          updated_at: new Date(),
        },
        create: {
          uid,
          founder_index: founder.index,
          founder_name: founder.name || undefined,
          founder_email: email || undefined,
          persona_inquiry_id: inquiryId,
          verification_url: inquiryUrl,
          persona_inquiry_status: attrs.status || null,
          verification_status: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      });

      // Send email if we got a URL
      if (inquiryUrl && email) {
        const htmlContent = emailTemplateService.getIdVerificationEmail(inquiryUrl);
        await transporter.sendMail({
          from: `${APP_NAME} <${process.env.SMTP_USER || NO_REPLY_EMAIL}>`,
          to: email,
          subject: "Complete your ID verification",
          text: `Verify here: ${inquiryUrl}`,
          html: htmlContent || `<p>Please complete your ID verification by clicking below:</p>
          <p><a href="${inquiryUrl}">Start Verification</a></p>`,
        });
        // Mark verification status as pending so UI can switch the button
        await prisma.founder_id_verification.update({
          where: { uid_founder_index: { uid, founder_index: founder.index } },
          data: { verification_status: 'pending', updated_at: new Date() },
        }).catch(() => {});
      }

      createdRows.push(row);
    }

    res.json({ success: true, data: createdRows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create founder verifications" });
  }
};

/**
 * 🔹 Public: Create Persona session manually
 */
exports.createPersonaSession = async (req, res) => {
  try {
    const { inquiry_id } = req.body;
    if (!inquiry_id) return res.status(400).json({ error: "Missing inquiry_id" });

    const url = await createPersonaSession(inquiry_id);
    if (!url) return res.status(502).json({ error: "Persona did not return URL" });

    res.json({ start_url: url });
  } catch (err) {
    console.error("createPersonaSession error:", err);
    res.status(500).json({ error: "Failed to create Persona session" });
  }
};

/**
 * 🔹 Fetch all verification rows
 */
exports.getFounderVerification = async (req, res) => {
  try {
    const { uid } = req.params;
    const rows = await prisma.founder_id_verification.findMany({ where: { uid } });
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch verifications" });
  }
};

/**
 * dY"1 Update verification status (webhook/worker)
 */
exports.updateFounderVerification = async (req, res) => {
  try {
    const { inquiryId, status, reason } = req.body || {};
    if (!inquiryId) return res.status(400).json({ success: false, error: 'inquiryId required' });
    const row = await prisma.founder_id_verification.update({
      where: { persona_inquiry_id: inquiryId },
      data: {
        verification_status: status || null,
        review_reason: reason || null,
        updated_at: new Date(),
      },
    });
    res.json({ success: true, data: row });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Failed to update verification' });
  }
};

/**
 * dY"1 Send email verification link for a founder
 */
exports.sendEmailVerificationLink = async (req, res) => {
  try {
    const { uid, founder_index } = req.body || {};
    if (!uid || typeof founder_index !== 'number') {
      return res.status(400).json({ success: false, error: 'uid and founder_index required' });
    }

    const row = await prisma.founder_id_verification.findUnique({
      where: { uid_founder_index: { uid, founder_index } },
    }).catch(() => null);

    let founderEmail = row?.founder_email || null;
    if (!founderEmail) {
      const s1 = await prisma.founder_step1.findFirst({ where: { uid, founder_index } }).catch(() => null);
      founderEmail = s1?.founder_email || null;
    }
    if (!founderEmail) return res.status(404).json({ success: false, error: 'Founder email not found' });

    const token = crypto.randomBytes(24).toString('hex');
    const base = process.env.BACKEND_URL || process.env.APP_ORIGIN || process.env.FRONTEND_URL || BACKEND_URL;
    const verifyUrl = `${base.replace(/\/$/,'')}/api/founder/verification/email/confirm?uid=${encodeURIComponent(uid)}&fi=${founder_index}&t=${token}`;

    await prisma.founder_id_verification.upsert({
      where: { uid_founder_index: { uid, founder_index } },
      update: { email_verify_link: token, founder_email: founderEmail, updated_at: new Date() },
      create: { uid, founder_index, founder_email: founderEmail, email_verify_link: token, verification_status: null },
    });

    if (transporter && founderEmail) {
      const plainText = `Please verify your email by visiting this link: ${verifyUrl}\n\nIf you did not request this, you can ignore this email.`;
      const htmlContent = emailTemplateService.getEmailVerificationEmail(verifyUrl);
      await transporter.sendMail({
        from: `${APP_NAME} <${process.env.SMTP_USER || process.env.EMAIL_USER || NO_REPLY_EMAIL}>`,
        to: founderEmail,
        subject: 'Verify your email',
        text: plainText,
        html: htmlContent || `<p>Please verify your email by clicking the link below:</p><p><a href="${verifyUrl}">Verify Email</a></p>`,
      });
    }

    return res.json({ success: true, message: 'Verification email sent' });
  } catch (err) {
    console.error('sendEmailVerificationLink error:', err);
    res.status(500).json({ success: false, error: 'Failed to send email verification' });
  }
};

/**
 * dY"1 Confirm email verification (called from link) with elegant UI
 */
exports.confirmEmailVerification = async (req, res) => {
  try {
    const { uid, fi, t: token } = req.query || {};
    const founder_index = fi ? parseInt(fi, 10) : NaN;
    
    // Check for missing verification information
    if (!uid || isNaN(founder_index) || !token) {
      const errorPage = pageTemplateService.getMissingVerificationInfo();
      return res.status(400).send(errorPage || '<html><body><h1>Error</h1><p>Missing required verification information.</p></body></html>');
    }
    
    // Find verification record
    const row = await prisma.founder_id_verification.findUnique({ 
      where: { uid_founder_index: { uid, founder_index } } 
    });
    
    if (!row) {
      const errorPage = pageTemplateService.getVerificationNotFound();
      return res.status(404).send(errorPage || '<html><body><h1>Error</h1><p>Verification record not found.</p></body></html>');
    }
    
    // Check if email is already verified
    if (row.email_verified) {
      const frontendUrl = process.env.FRONTEND_URL || '';
      const dashboardUrl = `${frontendUrl}/dashboard`;
      const loginUrl = `${frontendUrl}/login`;
      const alreadyVerifiedPage = pageTemplateService.getEmailAlreadyVerified(dashboardUrl, loginUrl);
      return res.status(200).send(alreadyVerifiedPage || '<html><body><h1>✅ Email already verified</h1></body></html>');
    }
    
    // Check if verification token is valid
    if (row.email_verify_link !== token) {
      const errorPage = pageTemplateService.getInvalidVerificationLink();
      return res.status(400).send(errorPage || '<html><body><h1>Error</h1><p>Invalid or expired link.</p></body></html>');
    }

    // Update verification status
    await prisma.founder_id_verification.update({
      where: { uid_founder_index: { uid, founder_index } },
      data: { email_verified: true, email_verify_link: null, updated_at: new Date() },
    });

    // Render success page
    const name = row.founder_name || "Founder";
    const frontendUrl = process.env.FRONTEND_URL || '';
    const dashboardUrl = `${frontendUrl}/dashboard`;
    const loginUrl = `${frontendUrl}/login`;
    const successPage = pageTemplateService.getEmailVerificationSuccess(name, dashboardUrl, loginUrl);

    return res.status(200).send(successPage || '<html><body><h1>✅ Email verified</h1><p>You may close this window.</p></body></html>');
  } catch (err) {
    console.error('confirmEmailVerification error:', err);
    const errorPage = pageTemplateService.getInternalServerError();
    res.status(500).send(errorPage || '<html><body><h1>Error</h1><p>Internal server error.</p></body></html>');
  }
};
