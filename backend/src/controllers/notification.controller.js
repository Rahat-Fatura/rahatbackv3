const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const prisma = require('../utils/database');
const { sendBackupNotification } = require('../services/email.service');

/**
 * Get notification settings
 */
const getSettings = catchAsync(async (req, res) => {
  const userId = req.user.id;

  let settings = await prisma.notificationSettings.findUnique({
    where: { userId },
  });

  // Create default settings if not exists
  if (!settings) {
    settings = await prisma.notificationSettings.create({
      data: {
        userId,
        emailEnabled: true,
        notifyOnSuccess: true,
        notifyOnFailure: true,
      },
    });
  }

  res.status(httpStatus.OK).send(settings);
});

/**
 * Update notification settings
 */
const updateSettings = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const logger = require('../config/logger');

  logger.info(`Updating notification settings for user ${userId}: ${JSON.stringify(req.body)}`);

  const settings = await prisma.notificationSettings.upsert({
    where: { userId },
    update: req.body,
    create: {
      userId,
      ...req.body,
    },
  });

  logger.info(`Notification settings saved: ${JSON.stringify(settings)}`);
  res.status(httpStatus.OK).send(settings);
});

/**
 * Test email configuration
 */
const testEmail = catchAsync(async (req, res) => {
  const userId = req.user.id;

  const result = await sendBackupNotification(
    userId,
    '🧪 Test Email - Backup System',
    'This is a test email from your backup notification system.',
    `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #4CAF50;">🧪 Test Email</h2>
      <p>This is a test email from your backup notification system.</p>
      <p>If you received this email, your SMTP configuration is working correctly!</p>
      <hr style="border: 1px solid #eee; margin: 20px 0;">
      <p style="color: #666; font-size: 12px;">Backup System - Automated Email</p>
    </div>
    `
  );

  if (result.success) {
    res.status(httpStatus.OK).send({ message: 'Test email sent successfully', messageId: result.messageId });
  } else {
    res.status(httpStatus.BAD_REQUEST).send({ message: 'Failed to send test email', error: result.message });
  }
});

module.exports = {
  getSettings,
  updateSettings,
  testEmail,
};
