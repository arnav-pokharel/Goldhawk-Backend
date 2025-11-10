const fs = require('fs');
const path = require('path');
const { brandTemplateDefaults } = require('./appConfig');

/**
 * Email template service for loading and rendering HTML email templates
 */
class EmailTemplateService {
  constructor() {
    this.templatesDir = path.join(__dirname, '../templates/emails');
  }

  /**
   * Load and render an email template with dynamic data
   * @param {string} templateName - Name of the template file (without .html extension)
   * @param {Object} data - Data to replace in template placeholders
   * @returns {string} Rendered HTML content
   */
  renderTemplate(templateName, data = {}) {
    try {
      const templatePath = path.join(this.templatesDir, `${templateName}.html`);
      
      if (!fs.existsSync(templatePath)) {
        console.warn(`Email template not found: ${templateName}, falling back to plain text`);
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
      console.error(`Error rendering email template ${templateName}:`, error);
      return null;
    }
  }

  /**
   * Get OTP verification email HTML
   * @param {string} otpCode - The OTP code to display
   * @returns {string} HTML content
   */
  getOtpVerificationEmail(otpCode) {
    return this.renderTemplate('otp-verification', {
      OTP_CODE: otpCode
    });
  }

  /**
   * Get email verification email HTML
   * @param {string} verificationUrl - The verification URL
   * @returns {string} HTML content
   */
  getEmailVerificationEmail(verificationUrl) {
    return this.renderTemplate('email-verification', {
      VERIFICATION_URL: verificationUrl
    });
  }

  /**
   * Get ID verification email HTML
   * @param {string} verificationUrl - The ID verification URL
   * @returns {string} HTML content
   */
  getIdVerificationEmail(verificationUrl) {
    return this.renderTemplate('id-verification', {
      VERIFICATION_URL: verificationUrl
    });
  }

  /**
   * Get board consent SAFE email HTML
   * @param {string} directorName - Name of the director
   * @param {string} companyName - Name of the company
   * @param {string} signatureUrl - The signature URL
   * @returns {string} HTML content
   */
  getBoardConsentSafeEmail(directorName, companyName, signatureUrl) {
    return this.renderTemplate('board-consent-safe', {
      DIRECTOR_NAME: directorName,
      COMPANY_NAME: companyName,
      SIGNATURE_URL: signatureUrl
    });
  }

  /**
   * Get board consent notes email HTML
   * @param {string} directorName - Name of the director
   * @param {string} companyName - Name of the company
   * @param {string} signatureUrl - The signature URL
   * @returns {string} HTML content
   */
  getBoardConsentNotesEmail(directorName, companyName, signatureUrl) {
    return this.renderTemplate('board-consent-notes', {
      DIRECTOR_NAME: directorName,
      COMPANY_NAME: companyName,
      SIGNATURE_URL: signatureUrl
    });
  }
}

module.exports = new EmailTemplateService();
