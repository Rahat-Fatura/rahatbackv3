/**
 * Test helper utilities
 */

/**
 * Generate a fake user object for testing
 */
const generateFakeUser = (overrides = {}) => {
  return {
    id: 1,
    name: 'Test User',
    email: 'test@example.com',
    role: 'user',
    isEmailVerified: false,
    status: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
};

/**
 * Generate a fake database config for testing
 */
const generateFakeDatabase = (overrides = {}) => {
  return {
    id: 1,
    userId: 1,
    name: 'Test Database',
    type: 'postgresql',
    host: 'localhost',
    port: 5432,
    username: 'testuser',
    password: 'testpass',
    database: 'testdb',
    sslEnabled: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
};

/**
 * Generate a fake backup job for testing
 */
const generateFakeBackupJob = (overrides = {}) => {
  return {
    id: 1,
    databaseId: 1,
    name: 'Test Backup Job',
    scheduleType: 'daily',
    cronExpression: null,
    storageType: 'local',
    storagePath: '/backups',
    cloudStorageId: null,
    retentionDays: 30,
    compression: true,
    isActive: true,
    lastRunAt: null,
    nextRunAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
};

/**
 * Generate a fake audit log entry for testing
 */
const generateFakeAuditLog = (overrides = {}) => {
  return {
    id: 1,
    userId: 1,
    action: 'LOGIN',
    resource: 'auth',
    resourceId: null,
    details: JSON.stringify({ method: 'POST', path: '/v1/auth/login' }),
    ipAddress: '127.0.0.1',
    userAgent: 'Mozilla/5.0',
    status: 'success',
    errorMessage: null,
    createdAt: new Date(),
    ...overrides,
  };
};

/**
 * Generate a fake cloud storage config for testing
 */
const generateFakeCloudStorage = (overrides = {}) => {
  return {
    id: 1,
    userId: 1,
    name: 'Test S3 Storage',
    storageType: 's3',
    isActive: true,
    isDefault: false,
    s3Region: 'us-east-1',
    s3Bucket: 'test-bucket',
    s3AccessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    s3SecretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    s3Endpoint: null,
    gdRefreshToken: null,
    gdFolderId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
};

/**
 * Create a mock request object
 */
const mockRequest = (data = {}) => {
  return {
    body: {},
    params: {},
    query: {},
    headers: {},
    user: null,
    path: '/',
    method: 'GET',
    ...data,
  };
};

/**
 * Create a mock response object
 */
const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  res.on = jest.fn().mockReturnValue(res);
  res.statusCode = 200;
  return res;
};

/**
 * Create a mock next function
 */
const mockNext = () => jest.fn();

/**
 * Generate a fake backup history entry for testing
 */
const generateFakeBackupHistory = (overrides = {}) => {
  return {
    id: 1,
    backupJobId: 1,
    databaseId: 1,
    fileName: 'test_backup_20250117_120000.sql',
    filePath: '/backups/test_backup_20250117_120000.sql',
    fileSize: 1024000,
    backupType: 'full',
    status: 'success',
    startedAt: new Date(),
    completedAt: new Date(),
    duration: 5000,
    errorMessage: null,
    compression: true,
    isEncrypted: false,
    storageLocation: 'local',
    cloudStorageId: null,
    verificationStatus: null,
    verificationLevel: null,
    verifiedAt: null,
    checksum: 'a1b2c3d4e5f6',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
};

/**
 * Mock file system operations
 */
const mockFS = () => {
  return {
    promises: {
      access: jest.fn().mockResolvedValue(undefined),
      stat: jest.fn().mockResolvedValue({ size: 1024000 }),
      readFile: jest.fn().mockResolvedValue(Buffer.from('test data')),
      writeFile: jest.fn().mockResolvedValue(undefined),
      unlink: jest.fn().mockResolvedValue(undefined),
      mkdir: jest.fn().mockResolvedValue(undefined),
      readdir: jest.fn().mockResolvedValue([]),
    },
    existsSync: jest.fn().mockReturnValue(true),
    createReadStream: jest.fn(),
    createWriteStream: jest.fn(),
  };
};

/**
 * Mock database connector
 */
const mockDatabaseConnector = () => {
  return {
    testConnection: jest.fn().mockResolvedValue(true),
    createBackup: jest.fn().mockResolvedValue({
      success: true,
      filePath: '/backups/test_backup.sql',
      fileName: 'test_backup.sql',
      fileSize: 1024000,
    }),
    restoreBackup: jest.fn().mockResolvedValue({ success: true }),
    createIncrementalBackup: jest.fn().mockResolvedValue({
      success: true,
      filePath: '/backups/test_incremental.sql',
      fileName: 'test_incremental.sql',
      fileSize: 512000,
    }),
    createDifferentialBackup: jest.fn().mockResolvedValue({
      success: true,
      filePath: '/backups/test_differential.sql',
      fileName: 'test_differential.sql',
      fileSize: 768000,
    }),
  };
};

/**
 * Mock cloud storage connector
 */
const mockCloudStorageConnector = () => {
  return {
    uploadFile: jest.fn().mockResolvedValue({ url: 'https://s3.example.com/backup.sql' }),
    uploadBackup: jest.fn().mockResolvedValue({ success: true, url: 'https://s3.example.com/backup.sql', fileId: 'backup-123' }),
    downloadFile: jest.fn().mockResolvedValue(Buffer.from('backup data')),
    downloadBackup: jest.fn().mockResolvedValue({ success: true }),
    deleteFile: jest.fn().mockResolvedValue(true),
    testConnection: jest.fn().mockResolvedValue(true),
  };
};

module.exports = {
  generateFakeUser,
  generateFakeDatabase,
  generateFakeBackupJob,
  generateFakeAuditLog,
  generateFakeCloudStorage,
  generateFakeBackupHistory,
  mockRequest,
  mockResponse,
  mockNext,
  mockFS,
  mockDatabaseConnector,
  mockCloudStorageConnector,
};
