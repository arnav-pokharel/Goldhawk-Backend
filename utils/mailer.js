const nodemailer = require("nodemailer");
const { APP_NAME } = require("./appConfig");

const smtpHost = process.env.SMTP_HOST || process.env.EMAIL_HOST || null;
const smtpPort = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER || null;
const smtpPass = process.env.SMTP_PASS || process.env.EMAIL_PASS || null;

let transporterOptions = {};
if (smtpHost && smtpUser && smtpPass) {
  transporterOptions = {
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
    requireTLS: smtpPort !== 465,
    logger: process.env.SMTP_DEBUG === "true",
    debug: process.env.SMTP_DEBUG === "true",
  };
} else if (smtpUser && smtpPass) {
  transporterOptions = {
    service: "gmail",
    auth: { user: smtpUser, pass: smtpPass },
  };
} else {
  console.warn("[mailer] No SMTP configuration found; emails will not be sent.");
}

const transporter = nodemailer.createTransport(transporterOptions);
const isConfigured = Boolean(transporterOptions.auth && transporterOptions.auth.user && transporterOptions.auth.pass);
transporter.isConfigured = isConfigured;

function normalizeRecipient(recipient) {
  if (!recipient) return null;
  if (typeof recipient === "string") {
    const trimmed = recipient.trim();
    return trimmed.includes("@") ? trimmed : null;
  }
  if (Array.isArray(recipient)) {
    const addresses = recipient
      .map(normalizeRecipient)
      .filter(Boolean);
    return addresses.length ? addresses.join(", ") : null;
  }
  if (typeof recipient === "object") {
    const candidate =
      recipient.address ||
      recipient.email ||
      recipient.value ||
      recipient.label ||
      null;
    return candidate ? normalizeRecipient(candidate) : null;
  }
  return null;
}

const originalSendMail = transporter.sendMail.bind(transporter);

transporter.sendMail = async function patchedSendMail(mailOptions = {}) {
  if (!isConfigured) {
    throw new Error("SMTP is not configured; set SMTP_HOST/SMTP_USER/SMTP_PASS");
  }

  const to = normalizeRecipient(mailOptions.to);
  if (!to) {
    throw new Error("No recipients defined");
  }

  const fromAddress = normalizeRecipient(mailOptions.from || smtpUser);
  if (!fromAddress) {
    throw new Error("Invalid or missing 'from' address");
  }

  const finalOptions = {
    ...mailOptions,
    to,
    from: mailOptions.from || `"${APP_NAME}" <${fromAddress}>`,
  };

  try {
    const info = await originalSendMail(finalOptions);
    if (process.env.SMTP_DEBUG === "true") {
      console.log(`[mailer] Email sent to ${to}: ${info.messageId}`);
    }
    return info;
  } catch (err) {
    console.error(`[mailer] Failed to send email to ${to}: ${err.message}`);
    throw err;
  }
};

if (isConfigured) {
  transporter.verify()
    .then(() => console.log("[mailer] SMTP transporter verified"))
    .catch((err) => console.warn("[mailer] SMTP verification failed:", err.message));
}

module.exports = transporter;
