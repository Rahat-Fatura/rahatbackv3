/**
 * Global test setup and utilities
 */

// Mock environment variables for tests
process.env.NODE_ENV = 'test';
process.env.APP_URL = 'http://localhost:3000';
process.env.PORT = '3000';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.JWT_ACCESS_EXPIRATION_MINUTES = '30';
process.env.JWT_REFRESH_EXPIRATION_DAYS = '30';
process.env.JWT_RESET_PASSWORD_EXPIRATION_MINUTES = '10';
process.env.JWT_VERIFY_EMAIL_EXPIRATION_MINUTES = '10';
process.env.MAILGUN_API_KEY = 'test-mailgun-key';
process.env.MAILGUN_DOMAIN = 'test.mailgun.org';
process.env.MAILGUN_HOST = 'api.mailgun.net';
process.env.EMAIL_FROM = 'test@example.com';
process.env.BACKUP_STORAGE_PATH = '/tmp/test-backups';
process.env.AWS_CREDENTIALS_ENCRYPTION_KEY = 'a'.repeat(64); // 64 character test key

// Increase timeout for database operations
jest.setTimeout(10000);

// Mock logger to avoid console spam in tests
jest.mock('../../src/config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

// Mock Prisma client
jest.mock('../../src/utils/database', () => ({
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  database: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  backupJob: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  backupHistory: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  cloudStorage: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  notificationSettings: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  auditLog: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  $disconnect: jest.fn(),
}));

// Global test cleanup
afterAll(async () => {
  // Close database connections, etc.
  await new Promise((resolve) => setTimeout(resolve, 500));
});
