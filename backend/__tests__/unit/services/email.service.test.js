// Mock dependencies FIRST before any imports
jest.mock('nodemailer');
jest.mock('mailgun.js');
jest.mock('../../../src/utils/database', () => ({
  notificationSettings: {
    findUnique: jest.fn(),
  },
}));
jest.mock('../../../src/config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

// Import after mocks
const emailService = require('../../../src/services/email.service');
const nodemailer = require('nodemailer');
const Mailgun = require('mailgun.js');
const prisma = require('../../../src/utils/database');

describe('Email Service', () => {
  let mockTransporter;
  let mockMailgunClient;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup nodemailer mock
    mockTransporter = {
      sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' }),
    };

    nodemailer.createTransport = jest.fn().mockReturnValue(mockTransporter);

    // Setup Mailgun mock
    mockMailgunClient = {
      messages: {
        create: jest.fn().mockResolvedValue({ id: 'mailgun-message-id' }),
      },
    };

    Mailgun.mockImplementation(() => ({
      client: jest.fn().mockReturnValue(mockMailgunClient),
    }));
  });

  describe('createSMTPTransporter', () => {
    it('should create SMTP transporter with environment config', () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_PORT = '587';
      process.env.SMTP_USER = 'user@example.com';
      process.env.SMTP_PASS = 'password';

      const transporter = emailService.createSMTPTransporter();

      expect(nodemailer.createTransport).toHaveBeenCalledWith({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: {
          user: 'user@example.com',
          pass: 'password',
        },
      });
      expect(transporter).toBeDefined();
    });

    it('should use default port if not provided', () => {
      delete process.env.SMTP_PORT;

      emailService.createSMTPTransporter();

      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 587,
        })
      );
    });
  });

  describe('sendBackupNotification', () => {
    const userId = 1;
    const subject = 'Backup Notification';
    const text = 'Backup completed successfully';
    const html = '<p>Backup completed successfully</p>';

    it('should send backup notification successfully', async () => {
      const mockEmailConfig = {
        userId,
        isActive: true,
        recipientEmail: 'user@example.com',
      };

      prisma.notificationSettings.findUnique.mockResolvedValue(mockEmailConfig);

      const result = await emailService.sendBackupNotification(userId, subject, text, html);

      expect(prisma.notificationSettings.findUnique).toHaveBeenCalledWith({
        where: { userId },
      });
      expect(mockTransporter.sendMail).toHaveBeenCalledWith({
        from: expect.stringContaining('Backup System'),
        to: 'user@example.com',
        subject,
        text,
        html,
      });
      expect(result.success).toBe(true);
      expect(result.messageId).toBe('test-message-id');
    });

    it('should fail if no email config found', async () => {
      prisma.notificationSettings.findUnique.mockResolvedValue(null);

      const result = await emailService.sendBackupNotification(userId, subject, text, html);

      expect(result.success).toBe(false);
      expect(result.message).toContain('email bildirim ayarlarınızı yapın');
    });

    it('should fail if email notifications are disabled', async () => {
      const mockEmailConfig = {
        userId,
        isActive: false,
        recipientEmail: 'user@example.com',
      };

      prisma.notificationSettings.findUnique.mockResolvedValue(mockEmailConfig);

      const result = await emailService.sendBackupNotification(userId, subject, text, html);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Email bildirimleri kapalı');
    });

    it('should fail if no recipient email', async () => {
      const mockEmailConfig = {
        userId,
        isActive: true,
        recipientEmail: null,
      };

      prisma.notificationSettings.findUnique.mockResolvedValue(mockEmailConfig);

      const result = await emailService.sendBackupNotification(userId, subject, text, html);

      expect(result.success).toBe(false);
      expect(result.message).toContain('alıcı email adresinizi girin');
    });

    it('should handle SMTP errors gracefully', async () => {
      const mockEmailConfig = {
        userId,
        isActive: true,
        recipientEmail: 'user@example.com',
      };

      prisma.notificationSettings.findUnique.mockResolvedValue(mockEmailConfig);
      mockTransporter.sendMail.mockRejectedValue(new Error('SMTP connection failed'));

      const result = await emailService.sendBackupNotification(userId, subject, text, html);

      expect(result.success).toBe(false);
      expect(result.message).toBe('SMTP connection failed');
    });
  });

  describe('sendEmail (Mailgun)', () => {
    it('should send email via Mailgun successfully', async () => {
      await emailService.sendEmail('to@example.com', 'Test Subject', 'Test message');

      expect(mockMailgunClient.messages.create).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          to: 'to@example.com',
          subject: 'Test Subject',
          text: 'Test message',
        })
      );
    });

    it('should throw error if Mailgun fails', async () => {
      mockMailgunClient.messages.create.mockRejectedValue(new Error('Mailgun error'));

      await expect(emailService.sendEmail('to@example.com', 'Subject', 'Text')).rejects.toThrow('Mailgun error');
    });
  });

  describe('sendResetPasswordEmail', () => {
    it('should send reset password email with correct content', async () => {
      await emailService.sendResetPasswordEmail('user@example.com', 'reset-token-123');

      expect(mockMailgunClient.messages.create).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Şifre Sıfırlama',
          text: expect.stringContaining('reset-token-123'),
        })
      );
    });

    it('should include reset URL in email text', async () => {
      await emailService.sendResetPasswordEmail('user@example.com', 'token123');

      const callArgs = mockMailgunClient.messages.create.mock.calls[0][1];
      expect(callArgs.text).toContain('reset-password?token=token123');
    });
  });

  describe('sendVerificationEmail', () => {
    it('should send verification email with correct content', async () => {
      await emailService.sendVerificationEmail('user@example.com', 'verify-token-123');

      expect(mockMailgunClient.messages.create).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Hesap Doğrulama',
          text: expect.stringContaining('verify-token-123'),
        })
      );
    });

    it('should include verification URL in email text', async () => {
      await emailService.sendVerificationEmail('user@example.com', 'token456');

      const callArgs = mockMailgunClient.messages.create.mock.calls[0][1];
      expect(callArgs.text).toContain('verify-email?token=token456');
    });
  });
});
