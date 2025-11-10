const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");
const transporter = require("../../utils/mailer");
const emailTemplateService = require("../../utils/emailTemplateService");
const pageTemplateService = require("../../utils/pageTemplateService");
const { APP_NAME, NO_REPLY_EMAIL, BACKEND_URL } = require("../../utils/appConfig");

const prisma = new PrismaClient();

// Send email verification link for a founder (generates token and emails link)
exports.send = async (req, res) => {
  try {
    const { uid, founder_index } = req.body || {};
    if (!uid || typeof founder_index !== "number") {
      return res.status(400).json({ success: false, error: "uid and founder_index required" });
    }

    // Find email from verification row or fallback to step1
    const vrow = await prisma.founder_id_verification.findUnique({
      where: { uid_founder_index: { uid, founder_index } },
    }).catch(() => null);
    let founderEmail = vrow?.founder_email || null;
    let founderName = vrow?.founder_name || null;
    if (!founderEmail || !founderName) {
      const s1 = await prisma.founder_step1.findFirst({ where: { uid, founder_index } }).catch(() => null);
      founderEmail = founderEmail || s1?.founder_email || null;
      founderName = founderName || s1?.founder_full_name || "Founder";
    }
    if (!founderEmail) return res.status(404).json({ success: false, error: "Founder email not found" });

    // Generate token and link
    const token = crypto.randomBytes(24).toString("hex");
    const base = process.env.BACKEND_URL || process.env.APP_ORIGIN || process.env.FRONTEND_URL || BACKEND_URL;
    const verifyUrl = `${base.replace(/\/$/, "")}/api/founder/email-verification/confirm?uid=${encodeURIComponent(uid)}&fi=${founder_index}&t=${token}`;

    // Persist token and email
    await prisma.founder_id_verification.upsert({
      where: { uid_founder_index: { uid, founder_index } },
      update: { email_verify_link: token, founder_email: founderEmail, updated_at: new Date() },
      create: { uid, founder_index, founder_email: founderEmail, email_verify_link: token, verification_status: null },
    });

    // Send mail
    let mailStatus = "skipped";
    let mailError = null;
    if (transporter) {
      try {
        const plain = `Please verify your email by visiting this link: ${verifyUrl}\n\nIf you did not request this, you can ignore this email.`;
        const htmlContent = emailTemplateService.getEmailVerificationEmail(verifyUrl);
        const senderEmail = process.env.SMTP_FROM || process.env.SMTP_USER || process.env.EMAIL_USER || NO_REPLY_EMAIL;
        const fromAddr = `${process.env.SMTP_FROM || ""}`.trim() || `${APP_NAME} <${senderEmail}>`;
        const info = await transporter.sendMail({ 
          from: fromAddr, 
          to: founderEmail, 
          subject: "Verify your email", 
          text: plain, 
          html: htmlContent || `<p>Please verify your email by clicking the link below:</p><p><a href="${verifyUrl}">Verify Email</a></p>` 
        });
        mailStatus = "sent";
        console.info("Email verification sent", { uid, founder_index, to: founderEmail, messageId: info?.messageId });
      } catch (e) {
        mailStatus = "failed";
        mailError = e?.message || String(e);
        console.error("Email verification send failed", mailError);
      }
    }

    return res.json({ success: true, mailStatus, verifyUrl, mailError });
  } catch (err) {
    console.error("emailVerification.send error", err);
    res.status(500).json({ success: false, error: "Failed to send email verification" });
  }
};

// Confirm email verification (renders a beautiful HTML page and marks email_verified=true)
exports.confirm = async (req, res) => {
  try {
    const { uid, fi, t } = req.query || {};
    const founder_index = fi ? parseInt(fi, 10) : NaN;
    
    // Check for missing verification information
    if (!uid || isNaN(founder_index) || !t) {
      const errorPage = pageTemplateService.getMissingVerificationInfo();
      return res.status(400).send(errorPage || "<html><body><h1>Error</h1><p>Missing verification information.</p></body></html>");
    }
    
    // Find verification record
    const row = await prisma.founder_id_verification.findUnique({ 
      where: { uid_founder_index: { uid, founder_index } } 
    });
    
    if (!row) {
      const errorPage = pageTemplateService.getVerificationNotFound();
      return res.status(404).send(errorPage || "<html><body><h1>Error</h1><p>Verification record not found.</p></body></html>");
    }
    
    // Check if email is already verified
    if (row.email_verified) {
      const frontendUrl = process.env.FRONTEND_URL || '';
      const dashboardUrl = `${frontendUrl}/dashboard`;
      const loginUrl = `${frontendUrl}/login`;
      const alreadyVerifiedPage = pageTemplateService.getEmailAlreadyVerified(dashboardUrl, loginUrl);
      return res.status(200).send(alreadyVerifiedPage || "<html><body><h1>✅ Email already verified</h1></body></html>");
    }
    
    // Check if verification token is valid
    if (row.email_verify_link !== t) {
      const errorPage = pageTemplateService.getInvalidVerificationLink();
      return res.status(400).send(errorPage || "<html><body><h1>Error</h1><p>Invalid or expired link.</p></body></html>");
    }

    // Update verification status
    await prisma.founder_id_verification.update({ 
      where: { uid_founder_index: { uid, founder_index } }, 
      data: { email_verified: true, email_verify_link: null, updated_at: new Date() } 
    });

    // Render success page
    const name = row.founder_name || "Founder";
    const frontendUrl = process.env.FRONTEND_URL || '';
    const dashboardUrl = `${frontendUrl}/dashboard`;
    const loginUrl = `${frontendUrl}/login`;
    const successPage = pageTemplateService.getEmailVerificationSuccess(name, dashboardUrl, loginUrl);
    
    return res.status(200).send(successPage || `<!doctype html><html><head><meta charset="utf-8"><title>Email Verified</title><style>body{font-family:Inter,Arial,Helvetica,sans-serif;background:#f7fafc;margin:0;padding:36px} .card{max-width:680px;margin:48px auto;background:#fff;padding:32px;border-radius:10px;box-shadow:0 10px 30px rgba(2,6,23,0.08);text-align:center} h1{color:#065f46;margin:0 0 6px} p{color:#0f172a;margin:8px 0 0;font-size:16px} .button{display:inline-block;margin-top:20px;padding:10px 18px;background:#0369a1;color:#fff;border-radius:8px;text-decoration:none}</style></head><body><div class="card"><h1>✅ Email verified</h1><p>Thanks, ${name}. Your email has been successfully verified.</p></div></body></html>`);
  } catch (err) {
    console.error("emailVerification.confirm error", err);
    const errorPage = pageTemplateService.getInternalServerError();
    res.status(500).send(errorPage || "<html><body><h1>Error</h1><p>Internal server error.</p></body></html>");
  }
};

// Optional: resend alias (reuses send)
exports.resend = exports.send;
