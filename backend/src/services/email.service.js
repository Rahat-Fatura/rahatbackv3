const formData = require('form-data');
const Mailgun = require('mailgun.js');
const nodemailer = require('nodemailer');
const config = require('../config/config');
const prisma = require('../utils/database');
const logger = require('../config/logger');

// Initialize Mailgun client only if credentials are available
let client = null;
if (config.email.mailgun.auth.api_key && config.email.mailgun.host) {
  const mailgun = new Mailgun(formData);
  client = mailgun.client({
    username: 'api',
    key: config.email.mailgun.auth.api_key,
    url: config.email.mailgun.host,
  });
}

/**
 * Create SMTP transporter from environment config
 * @returns {nodemailer.Transporter}
 */
const createSMTPTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

/**
 * Send backup notification email
 * @param {number} userId
 * @param {string} subject
 * @param {string} text
 * @param {string} html
 * @returns {Promise}
 */
const sendBackupNotification = async (userId, subject, text, html) => {
  try {
    const emailConfig = await prisma.notificationSettings.findUnique({
      where: { userId },
    });

    if (!emailConfig) {
      const message = 'Lütfen önce email bildirim ayarlarınızı yapın ve kaydedin';
      logger.warn(`Email notification failed for user ${userId}: No email config found`);
      return { success: false, message };
    }

    if (!emailConfig.isActive) {
      const message = 'Email bildirimleri kapalı. Lütfen ayarlardan açın.';
      logger.warn(`Email notification failed for user ${userId}: Email notifications disabled`);
      return { success: false, message };
    }

    if (!emailConfig.recipientEmail) {
      const message = 'Lütfen alıcı email adresinizi girin ve kaydedin';
      logger.warn(`Email notification failed for user ${userId}: No recipient email`);
      return { success: false, message };
    }

    logger.info(`Sending email to ${emailConfig.recipientEmail} from ${process.env.EMAIL_FROM}`);
    logger.info(`SMTP: ${process.env.SMTP_HOST}:${process.env.SMTP_PORT}`);

    const transporter = createSMTPTransporter();

    const info = await transporter.sendMail({
      from: `"Backup System" <${process.env.EMAIL_FROM}>`,
      to: emailConfig.recipientEmail,
      subject,
      text,
      html,
    });

    logger.info(`Email sent successfully: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error(`Failed to send email: ${error.message}`);
    logger.error(error.stack);
    return { success: false, message: error.message };
  }
};

/**
 * Send an email (Mailgun - legacy)
 * @param {string} to
 * @param {string} subject
 * @param {string} text
 * @returns {Promise}
 */
const sendEmail = async (to, subject, text) => {
  const msg = { from: config.email.from, to, subject, text };
  await client.messages.create(config.email.mailgun.auth.domain, msg);
};

/**
 * Send reset password email
 * @param {string} to
 * @param {string} token
 * @returns {Promise}
 */
const sendResetPasswordEmail = async (to, token) => {
  const subject = 'Şifre Sıfırlama';
  const resetPasswordUrl = `${config.app.url}/reset-password?token=${token}`;
  const text = `Sayın kullanıcı,
    Şifrenizi sıfırlamak için bu linke gidebilirsiniz: ${resetPasswordUrl}
    Eğer şifrenizi sıfırlamak istemiyorsanız bu e-postayı görmezden gelebilirsiniz.`;
  await sendEmail(to, subject, text);
};

/**
 * Send verification email
 * @param {string} to
 * @param {string} token
 * @returns {Promise}
 */
const sendVerificationEmail = async (to, token) => {
  const subject = 'Hesap Doğrulama';
  const verificationEmailUrl = `${config.app.url}/verify-email?token=${token}`;
  const text = `Sayın kullanıcı,
    Hesabınızı doğrulamak için bu linke gidebilirsiniz: ${verificationEmailUrl}
    Eğer hesabınızı doğrulamak istemiyorsanız bu e-postayı görmezden gelebilirsiniz.`;
  await sendEmail(to, subject, text);
};

module.exports = {
  sendEmail,
  sendResetPasswordEmail,
  sendVerificationEmail,
  sendBackupNotification,
  createSMTPTransporter,
};
