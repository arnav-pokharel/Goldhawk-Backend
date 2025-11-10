const transporter = require("./mailer");
const emailTemplateService = require("./emailTemplateService");
const { APP_NAME, NO_REPLY_EMAIL } = require("./appConfig");

function resolveFromAddress() {
  return (
    process.env.EMAIL_FROM ||
    process.env.SMTP_FROM ||
    process.env.SMTP_USER ||
    NO_REPLY_EMAIL
  );
}

async function sendOTPEmail(to, otp) {
  if (!to || !otp) throw new Error("to and otp are required");
  const from = `"${APP_NAME}" <${resolveFromAddress()}>`;
  const subject = `Your ${APP_NAME} OTP Code`;
  const htmlContent = emailTemplateService.getOtpVerificationEmail(otp);
  const text = `Your OTP is: ${otp}\n\nIt expires in 10 minutes.`;
  const html = htmlContent || `<p>Your OTP is: <b>${otp}</b></p><p>It expires in 10 minutes.</p>`;
  await transporter.sendMail({ from, to, subject, text, html });
}
// Send partner invitation email
const sendPartnerInvitationEmail = async (email, name, invitationUrl, role) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: email,
    subject: `Invitation to Join as ${role} - ${APP_NAME}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">You're Invited to Join ${APP_NAME}</h2>
        <p>Hello ${name},</p>
        <p>You have been invited to join as a <strong>${role}</strong> on ${APP_NAME}.</p>
        <p>Click the link below to set up your password and get started:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${invitationUrl}" 
             style="background-color: #000; color: white; padding: 12px 24px; 
                    text-decoration: none; border-radius: 5px; display: inline-block;">
            Set Up Your Account
          </a>
        </div>
        <p>This invitation link will expire in 7 days.</p>
        <p>If you didn't expect this invitation, please ignore this email.</p>
        <br>
        <p>Best regards,<br>The ${APP_NAME} Team</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Partner invitation email sent to: ${email}`);
    return true;
  } catch (error) {
    console.error('Error sending partner invitation email:', error);
    throw error;
  }
};

module.exports = { sendOTPEmail, sendPartnerInvitationEmail };
