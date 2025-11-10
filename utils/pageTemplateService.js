const fs = require('fs');
const path = require('path');
const { brandTemplateDefaults, APP_NAME } = require('./appConfig');

/**
 * Page template service for loading and rendering HTML page templates
 */
class PageTemplateService {
  constructor() {
    this.templatesDir = path.join(__dirname, '../templates/pages');
  }

  /**
   * Load and render a page template with dynamic data
   * @param {string} templateName - Name of the template file (without .html extension)
   * @param {Object} data - Data to replace in template placeholders
   * @returns {string} Rendered HTML content
   */
  renderTemplate(templateName, data = {}) {
    try {
      const templatePath = path.join(this.templatesDir, `${templateName}.html`);
      
      if (!fs.existsSync(templatePath)) {
        console.warn(`Page template not found: ${templateName}`);
        return null;
      }

      let template = fs.readFileSync(templatePath, 'utf8');

      const templateData = { ...brandTemplateDefaults, ...data };

      // Replace all placeholders with data values
      Object.keys(templateData).forEach(key => {
        const placeholder = `{{${key}}}`;
        const value = templateData[key] || '';
        template = template.replace(new RegExp(placeholder, 'g'), value);
      });

      return template;
    } catch (error) {
      console.error(`Error rendering page template ${templateName}:`, error);
      return null;
    }
  }

  /**
   * Get email verification success page
   * @param {string} founderName - Name of the founder
   * @param {string} dashboardUrl - URL to dashboard
   * @param {string} loginUrl - URL to login page
   * @returns {string} HTML content
   */
  getEmailVerificationSuccess(founderName, dashboardUrl = '#', loginUrl = '#') {
    return this.renderTemplate('email-verification-success', {
      FOUNDER_NAME: founderName,
      DASHBOARD_URL: dashboardUrl,
      LOGIN_URL: loginUrl
    });
  }

  /**
   * Get email already verified page
   * @param {string} dashboardUrl - URL to dashboard
   * @param {string} loginUrl - URL to login page
   * @returns {string} HTML content
   */
  getEmailAlreadyVerified(dashboardUrl = '#', loginUrl = '#') {
    return this.renderTemplate('email-already-verified', {
      DASHBOARD_URL: dashboardUrl,
      LOGIN_URL: loginUrl
    });
  }

  /**
   * Get email verification error page
   * @param {string} errorTitle - Error title
   * @param {string} errorMessage - Error message
   * @param {string} helpText - Help text
   * @param {string} primaryActionUrl - URL for primary action
   * @param {string} primaryActionText - Text for primary action
   * @returns {string} HTML content
   */
  getEmailVerificationError(errorTitle, errorMessage, helpText, primaryActionUrl = '#', primaryActionText = 'Try Again') {
    return this.renderTemplate('email-verification-error', {
      ERROR_TITLE: errorTitle,
      ERROR_MESSAGE: errorMessage,
      HELP_TEXT: helpText,
      PRIMARY_ACTION_URL: primaryActionUrl,
      PRIMARY_ACTION_TEXT: primaryActionText
    });
  }

  /**
   * Get missing verification info error page
   * @returns {string} HTML content
   */
  getMissingVerificationInfo() {
    return this.getEmailVerificationError(
      'Missing Verification Information',
      'The verification link appears to be incomplete or corrupted.',
      'Please check your email for the correct verification link, or request a new verification email if this continues to happen.',
      '/', 
      'Go to Homepage'
    );
  }

  /**
   * Get verification not found error page
   * @returns {string} HTML content
   */
  getVerificationNotFound() {
    return this.getEmailVerificationError(
      'Verification Record Not Found',
      'We could not find a verification record for this request.',
      'This might happen if the verification link is very old or has already been used. Please try creating a new account or contact support if you need assistance.',
      '/',
      'Go to Homepage'
    );
  }

  /**
   * Get invalid verification link error page
   * @returns {string} HTML content
   */
  getInvalidVerificationLink() {
    return this.getEmailVerificationError(
      'Invalid or Expired Link',
      'This verification link is no longer valid or has expired.',
      'Verification links expire for security reasons. Please request a new verification email from your account settings or during the signup process.',
      '/',
      'Go to Homepage'
    );
  }

  /**
   * Get internal server error page
   * @returns {string} HTML content
   */
  getInternalServerError() {
    return this.getEmailVerificationError(
      'Something Went Wrong',
      'We encountered an unexpected error while processing your verification.',
      'This is temporary and our team has been notified. Please try again in a few minutes, or contact support if the issue persists.',
      '/',
      'Go to Homepage'
    );
  }

  /**
   * Get verification callback page
   * @param {Object} data - Template data
   * @returns {string} HTML content
   */
  getVerificationCallbackTemplate(data) {
    const template = this.renderTemplate('verification-callback', data);
    
    if (!template) {
      // Fallback to simple HTML if template fails
      const safe = (v) => (v ? String(v).replace(/</g, '&lt;').replace(/>/g, '&gt;') : '');
      return `<!doctype html>
        <html>
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>Verification Complete</title>
            <style>
              body{font-family:Inter,system-ui,Arial,Helvetica,sans-serif;background:#f7fafc;margin:0;padding:40px;}
              .card{max-width:680px;margin:48px auto;background:#fff;padding:32px;border-radius:10px;box-shadow:0 10px 30px rgba(2,6,23,0.08);text-align:center}
              h1{color:#065f46;margin-top:0}
              p{color:#0f172a;margin:8px 0 0;font-size:16px}
            </style>
          </head>
          <body>
            <div class="card">
              <h1>✅ Verification Submitted</h1>
              <p>Inquiry ID: ${safe(data.INQUIRY_ID)}</p>
              <p>Status: ${safe(data.STATUS)}</p>
              <p>You may now return to the ${APP_NAME} app.</p>
            </div>
          </body>
        </html>`;
    }
    
    return template;
  }
}

module.exports = new PageTemplateService();
