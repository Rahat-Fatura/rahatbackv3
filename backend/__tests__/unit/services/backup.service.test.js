// Mock Prisma Client FIRST before any imports
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    database: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    backupJob: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    backupHistory: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $disconnect: jest.fn(),
  })),
}));

// Mock all dependencies
jest.mock('../../../src/models/backupJob.model');
jest.mock('../../../src/models/backupHistory.model');
jest.mock('../../../src/models/database.model');
jest.mock('../../../src/models/cloudStorage.model');
jest.mock('../../../src/utils/dbConnectors');
jest.mock('../../../src/utils/cloudStorage');
jest.mock('../../../src/services/email.service');
jest.mock('../../../src/services/database.service');
jest.mock('../../../src/utils/encryption');
jest.mock('../../../src/utils/database', () => ({
  backupHistory: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

// Import after mocks
const { backupService } = require('../../../src/services');
const { backupJobModel, backupHistoryModel, databaseModel, cloudStorageModel } = require('../../../src/models');
const {
  generateFakeBackupJob,
  generateFakeBackupHistory,
  generateFakeDatabase,
  generateFakeCloudStorage,
  mockDatabaseConnector,
  mockCloudStorageConnector,
} = require('../../utils/testHelpers');
const ApiError = require('../../../src/utils/ApiError');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { getConnector } = require('../../../src/utils/dbConnectors');
const { getCloudStorageConnector } = require('../../../src/utils/cloudStorage');
const { sendBackupNotification } = require('../../../src/services/email.service');
const databaseService = require('../../../src/services/database.service');
const { encryptFile, decryptFile, hashPassword } = require('../../../src/utils/encryption');
const prisma = require('../../../src/utils/database');

// Spy on fs methods
const fsSpy = {
  access: jest.spyOn(fs, 'access'),
  stat: jest.spyOn(fs, 'stat'),
  readFile: jest.spyOn(fs, 'readFile'),
  writeFile: jest.spyOn(fs, 'writeFile'),
  unlink: jest.spyOn(fs, 'unlink'),
  mkdir: jest.spyOn(fs, 'mkdir'),
  readdir: jest.spyOn(fs, 'readdir'),
  existsSync: jest.spyOn(fsSync, 'existsSync'),
  createReadStream: jest.spyOn(fsSync, 'createReadStream'),
};

describe('Backup Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset fs mocks to default values
    fsSpy.access.mockResolvedValue(undefined);
    fsSpy.stat.mockResolvedValue({ size: 1024000 });
    fsSpy.readFile.mockResolvedValue(Buffer.from('test data'));
    fsSpy.writeFile.mockResolvedValue(undefined);
    fsSpy.unlink.mockResolvedValue(undefined);
    fsSpy.mkdir.mockResolvedValue(undefined);
    fsSpy.readdir.mockResolvedValue([]);
    fsSpy.existsSync.mockReturnValue(true);

    // Mock createReadStream for checksum verification
    const { EventEmitter } = require('events');
    const mockStream = new EventEmitter();
    mockStream.on = jest.fn((event, handler) => {
      if (event === 'data') {
        setTimeout(() => handler(Buffer.from('test data')), 0);
      } else if (event === 'end') {
        setTimeout(() => handler(), 10);
      }
      return mockStream;
    });
    fsSpy.createReadStream.mockReturnValue(mockStream);
  });

  describe('createBackupJob', () => {
    it('should create a backup job successfully', async () => {
      const userId = 1;
      const jobData = {
        name: 'Daily Backup',
        databaseId: 1,
        scheduleType: 'daily',
        storageType: 'local',
        retentionDays: 30,
        compression: true,
      };

      const mockDatabase = generateFakeDatabase({ userId: 1 });
      const mockBackupJob = generateFakeBackupJob(jobData);

      databaseModel.findById.mockResolvedValue(mockDatabase);
      backupJobModel.create.mockResolvedValue(mockBackupJob);

      const result = await backupService.createBackupJob(userId, jobData);

      expect(databaseModel.findById).toHaveBeenCalledWith(jobData.databaseId);
      expect(backupJobModel.create).toHaveBeenCalledWith(jobData);
      expect(result).toEqual(mockBackupJob);
    });

    it('should throw error if database not found', async () => {
      const userId = 1;
      const jobData = {
        databaseId: 999,
        name: 'Test Job',
      };

      databaseModel.findById.mockResolvedValue(null);

      await expect(backupService.createBackupJob(userId, jobData)).rejects.toThrow(ApiError);
    });

    it('should throw error if cloud storage not found when using cloud', async () => {
      const userId = 1;
      const jobData = {
        databaseId: 1,
        name: 'Test Job',
        storageType: 'cloud',
        cloudStorageId: 999,
      };

      const mockDatabase = generateFakeDatabase({ userId: 1 });
      databaseModel.findById.mockResolvedValue(mockDatabase);
      cloudStorageModel.findById.mockResolvedValue(null);

      await expect(backupService.createBackupJob(userId, jobData)).rejects.toThrow();
    });

    it('should create backup job with encryption enabled', async () => {
      const userId = 1;
      const jobData = {
        name: 'Encrypted Backup',
        databaseId: 1,
        scheduleType: 'daily',
        isEncrypted: true,
        encryptionPasswordHash: 'hashed_password',
      };

      const mockDatabase = generateFakeDatabase({ userId: 1 });
      const mockBackupJob = generateFakeBackupJob({ ...jobData, isEncrypted: true });

      databaseModel.findById.mockResolvedValue(mockDatabase);
      backupJobModel.create.mockResolvedValue(mockBackupJob);

      const result = await backupService.createBackupJob(userId, jobData);

      expect(backupJobModel.create).toHaveBeenCalledWith(jobData);
      expect(result.isEncrypted).toBe(true);
    });
  });

  describe('getBackupJobById', () => {
    it('should return backup job if found', async () => {
      const userId = 1;
      const jobId = 1;
      const mockBackupJob = {
        ...generateFakeBackupJob(),
        database: generateFakeDatabase({ userId: 1 }),
      };

      backupJobModel.findById.mockResolvedValue(mockBackupJob);

      const result = await backupService.getBackupJobById(jobId, userId);

      expect(backupJobModel.findById).toHaveBeenCalledWith(jobId);
      expect(result).toEqual(mockBackupJob);
    });

    it('should throw error if backup job not found', async () => {
      const userId = 1;
      const jobId = 999;

      backupJobModel.findById.mockResolvedValue(null);

      await expect(backupService.getBackupJobById(jobId, userId)).rejects.toThrow(ApiError);
    });
  });

  describe('getUserBackupJobs', () => {
    it('should return all backup jobs for user', async () => {
      const userId = 1;
      const mockJobs = [generateFakeBackupJob(), generateFakeBackupJob({ id: 2 })];

      backupJobModel.findByUserId.mockResolvedValue(mockJobs);

      const result = await backupService.getUserBackupJobs(userId);

      expect(backupJobModel.findByUserId).toHaveBeenCalledWith(userId, {});
      expect(result).toEqual(mockJobs);
      expect(result).toHaveLength(2);
    });

    it('should apply filters when provided', async () => {
      const userId = 1;
      const filters = { isActive: true, scheduleType: 'daily' };

      backupJobModel.findByUserId.mockResolvedValue([]);

      await backupService.getUserBackupJobs(userId, filters);

      expect(backupJobModel.findByUserId).toHaveBeenCalledWith(userId, filters);
    });
  });

  describe('updateBackupJob', () => {
    it('should update backup job successfully', async () => {
      const userId = 1;
      const jobId = 1;
      const updateData = { name: 'Updated Job', retentionDays: 60 };
      const mockExistingJob = {
        ...generateFakeBackupJob(),
        database: generateFakeDatabase({ userId: 1 }),
      };
      const mockUpdatedJob = { ...mockExistingJob, ...updateData };

      backupJobModel.findById.mockResolvedValue(mockExistingJob);
      backupJobModel.update.mockResolvedValue(mockUpdatedJob);

      const result = await backupService.updateBackupJob(jobId, userId, updateData);

      expect(backupJobModel.findById).toHaveBeenCalledWith(jobId);
      expect(backupJobModel.update).toHaveBeenCalledWith(jobId, updateData);
      expect(result.name).toBe(updateData.name);
    });

    it('should throw error if job not found', async () => {
      const userId = 1;
      const jobId = 999;

      backupJobModel.update.mockResolvedValue(null);

      await expect(backupService.updateBackupJob(jobId, userId, {})).rejects.toThrow(ApiError);
    });
  });

  describe('deleteBackupJob', () => {
    it('should delete backup job successfully', async () => {
      const userId = 1;
      const jobId = 1;
      const mockBackupJob = {
        ...generateFakeBackupJob(),
        database: generateFakeDatabase({ userId: 1 }),
      };

      backupJobModel.findById.mockResolvedValue(mockBackupJob);
      backupJobModel.delete.mockResolvedValue({ id: jobId });

      const result = await backupService.deleteBackupJob(jobId, userId);

      expect(backupJobModel.findById).toHaveBeenCalledWith(jobId);
      expect(backupJobModel.delete).toHaveBeenCalledWith(jobId);
      expect(result).toEqual({ id: jobId });
    });
  });

  describe('executeBackup', () => {
    it('should execute full backup successfully', async () => {
      const backupJobId = 1;
      const mockBackupJob = generateFakeBackupJob({ id: backupJobId, backupType: 'full', databaseId: 1, compression: false });
      const mockDatabase = generateFakeDatabase();
      const mockConnector = mockDatabaseConnector();
      const mockBackupHistory = generateFakeBackupHistory();

      backupJobModel.findById.mockResolvedValue(mockBackupJob);
      backupJobModel.update.mockResolvedValue(mockBackupJob);
      databaseService.getDatabaseConfig = jest.fn().mockResolvedValue(mockDatabase);
      getConnector.mockReturnValue(mockConnector);
      backupHistoryModel.create.mockResolvedValue(mockBackupHistory);
      backupHistoryModel.update.mockResolvedValue({ ...mockBackupHistory, status: 'success' });
      backupHistoryModel.findByJobId = jest.fn().mockResolvedValue([]);
      fsSpy.mkdir.mockResolvedValue(undefined);
      fsSpy.stat.mockResolvedValue({ size: 1024000 });
      fsSpy.existsSync.mockReturnValue(true);

      const result = await backupService.executeBackup(backupJobId);

      expect(backupJobModel.findById).toHaveBeenCalledWith(backupJobId);
      expect(databaseService.getDatabaseConfig).toHaveBeenCalledWith(mockBackupJob.databaseId);
      expect(backupHistoryModel.create).toHaveBeenCalled();
      expect(backupHistoryModel.update).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should execute incremental backup successfully', async () => {
      const backupJobId = 1;
      const mockBackupJob = generateFakeBackupJob({ id: backupJobId, backupType: 'incremental', databaseId: 1, compression: false });
      const mockDatabase = generateFakeDatabase();
      const mockConnector = mockDatabaseConnector();
      const mockBackupHistory = generateFakeBackupHistory();

      backupJobModel.findById.mockResolvedValue(mockBackupJob);
      databaseService.getDatabaseConfig = jest.fn().mockResolvedValue(mockDatabase);
      getConnector.mockReturnValue(mockConnector);
      backupHistoryModel.create.mockResolvedValue(mockBackupHistory);
      backupHistoryModel.update.mockResolvedValue({ ...mockBackupHistory, status: 'success' });
      backupHistoryModel.findOne = jest.fn().mockResolvedValue(generateFakeBackupHistory({ completedAt: new Date() }));
      backupHistoryModel.findByJobId = jest.fn().mockResolvedValue([]);
      fsSpy.mkdir.mockResolvedValue(undefined);
      fsSpy.stat.mockResolvedValue({ size: 512000 });
      fsSpy.existsSync.mockReturnValue(true);

      const result = await backupService.executeBackup(backupJobId);

      expect(backupHistoryModel.create).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should execute differential backup successfully', async () => {
      const backupJobId = 1;
      const mockBackupJob = generateFakeBackupJob({ id: backupJobId, backupType: 'differential', databaseId: 1, compression: false });
      const mockDatabase = generateFakeDatabase();
      const mockConnector = mockDatabaseConnector();
      const mockFullBackup = generateFakeBackupHistory({ backupType: 'full', completedAt: new Date() });
      const mockBackupHistory = generateFakeBackupHistory();

      // Mock prisma.backupHistory.findFirst for getLastFullBackupForDatabase
      prisma.backupHistory.findFirst.mockResolvedValue(mockFullBackup);

      backupJobModel.findById.mockResolvedValue(mockBackupJob);
      databaseService.getDatabaseConfig = jest.fn().mockResolvedValue(mockDatabase);
      getConnector.mockReturnValue(mockConnector);
      backupHistoryModel.create.mockResolvedValue(mockBackupHistory);
      backupHistoryModel.update.mockResolvedValue({ ...mockBackupHistory, status: 'success' });
      backupHistoryModel.findByJobId = jest.fn().mockResolvedValue([]);
      backupJobModel.update.mockResolvedValue(mockBackupJob);
      fsSpy.mkdir.mockResolvedValue(undefined);
      fsSpy.stat.mockResolvedValue({ size: 256000 });
      fsSpy.existsSync.mockReturnValue(true);

      const result = await backupService.executeBackup(backupJobId);

      expect(backupHistoryModel.create).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should upload to cloud storage when configured', async () => {
      const backupJobId = 1;
      const mockCloudStorage = generateFakeCloudStorage();
      const mockBackupJob = generateFakeBackupJob({
        id: backupJobId,
        storageType: 's3',
        cloudStorageId: 1,
        databaseId: 1,
        compression: false,
      });
      const mockDatabase = generateFakeDatabase();
      const mockConnector = mockDatabaseConnector();
      const mockCloudConnector = mockCloudStorageConnector();
      const mockBackupHistory = generateFakeBackupHistory();

      backupJobModel.findById.mockResolvedValue(mockBackupJob);
      backupJobModel.update.mockResolvedValue(mockBackupJob);
      databaseService.getDatabaseConfig = jest.fn().mockResolvedValue(mockDatabase);
      cloudStorageModel.findById.mockResolvedValue(mockCloudStorage);
      getConnector.mockReturnValue(mockConnector);
      getCloudStorageConnector.mockReturnValue(mockCloudConnector);
      backupHistoryModel.create.mockResolvedValue(mockBackupHistory);
      backupHistoryModel.update.mockResolvedValue({ ...mockBackupHistory, status: 'success', storageLocation: 'cloud' });
      backupHistoryModel.findByJobId = jest.fn().mockResolvedValue([]);
      fsSpy.mkdir.mockResolvedValue(undefined);
      fsSpy.stat.mockResolvedValue({ size: 1024000 });
      fsSpy.existsSync.mockReturnValue(true);

      const result = await backupService.executeBackup(backupJobId);

      expect(backupHistoryModel.create).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should encrypt backup when encryption is enabled', async () => {
      const backupJobId = 1;
      const mockBackupJob = generateFakeBackupJob({
        id: backupJobId,
        isEncrypted: true,
        encryptionPasswordHash: 'hashed_password',
        databaseId: 1,
        compression: false,
      });
      const mockDatabase = generateFakeDatabase();
      const mockConnector = mockDatabaseConnector();
      const mockBackupHistory = generateFakeBackupHistory();

      backupJobModel.findById.mockResolvedValue(mockBackupJob);
      backupJobModel.update.mockResolvedValue(mockBackupJob);
      databaseService.getDatabaseConfig = jest.fn().mockResolvedValue(mockDatabase);
      getConnector.mockReturnValue(mockConnector);

      // Mock encryption - encryptFile doesn't return anything, it just creates the file
      encryptFile.mockImplementation(() => Promise.resolve());

      backupHistoryModel.create.mockResolvedValue(mockBackupHistory);
      backupHistoryModel.update.mockResolvedValue({ ...mockBackupHistory, status: 'success', isEncrypted: true });
      backupHistoryModel.findByJobId = jest.fn().mockResolvedValue([]);

      // Mock ALL fs operations in order
      fsSpy.mkdir.mockResolvedValue(undefined);
      fsSpy.unlink.mockResolvedValue(undefined); // For deleting unencrypted file
      fsSpy.stat
        .mockResolvedValueOnce({ size: 1024000 }) // First call for unencrypted file
        .mockResolvedValueOnce({ size: 1024000 }); // Second call for encrypted file
      fsSpy.existsSync.mockReturnValue(true);

      const result = await backupService.executeBackup(backupJobId);

      expect(backupHistoryModel.create).toHaveBeenCalled();
      expect(encryptFile).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should handle backup failure and create failed history entry', async () => {
      const backupJobId = 1;
      const mockBackupJob = generateFakeBackupJob({ id: backupJobId, databaseId: 1 });
      const mockDatabase = generateFakeDatabase();
      const mockConnector = mockDatabaseConnector();
      const mockHistory = generateFakeBackupHistory();

      backupJobModel.findById.mockResolvedValue(mockBackupJob);
      databaseService.getDatabaseConfig = jest.fn().mockResolvedValue(mockDatabase);
      getConnector.mockReturnValue(mockConnector);
      mockConnector.createBackup.mockRejectedValue(new Error('Database connection failed'));
      backupHistoryModel.create.mockResolvedValue(mockHistory);
      backupHistoryModel.updateStatus = jest.fn().mockResolvedValue({
        ...mockHistory,
        status: 'failed',
        errorMessage: 'Backup failed: Database connection failed',
      });
      fsSpy.mkdir.mockResolvedValue(undefined);

      await expect(backupService.executeBackup(backupJobId)).rejects.toThrow('Backup failed');

      expect(backupHistoryModel.updateStatus).toHaveBeenCalledWith(mockHistory.id, 'failed', 'Database connection failed');
    });

    it('should throw error if backup job not found', async () => {
      backupJobModel.findById.mockResolvedValue(null);

      await expect(backupService.executeBackup(999)).rejects.toThrow('Backup job not found');
    });

    it('should prevent concurrent backup execution for same job', async () => {
      const backupJobId = 1;
      const mockBackupJob = generateFakeBackupJob({ id: backupJobId, databaseId: 1 });
      const mockDatabase = generateFakeDatabase();

      backupJobModel.findById.mockResolvedValue(mockBackupJob);
      databaseService.getDatabaseConfig = jest.fn().mockResolvedValue(mockDatabase);
      backupHistoryModel.create.mockResolvedValue(generateFakeBackupHistory());

      // Mock to make backup hang (never resolves)
      const mockConnector = mockDatabaseConnector();
      mockConnector.createBackup.mockImplementation(() => new Promise(() => {}));
      getConnector.mockReturnValue(mockConnector);
      fsSpy.mkdir.mockResolvedValue(undefined);

      // Start first backup (doesn't complete)
      const firstBackup = backupService.executeBackup(backupJobId);

      // Wait a bit for the first backup to register as running
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Try to start second backup while first is running
      await expect(backupService.executeBackup(backupJobId)).rejects.toThrow(
        'Backup is already running for this job'
      );
    });
  });

  describe('restoreBackup', () => {
    it('should restore backup successfully', async () => {
      const userId = 1;
      const historyId = 1;
      const mockDatabase = generateFakeDatabase({ userId: 1 });
      const mockBackupHistory = {
        ...generateFakeBackupHistory({ status: 'success', databaseId: 1, backupJobId: null }),
        database: mockDatabase,
      };
      const mockConnector = mockDatabaseConnector();

      backupHistoryModel.findById.mockResolvedValue(mockBackupHistory);
      backupJobModel.findById.mockResolvedValue(null);
      databaseService.getDatabaseConfig = jest.fn().mockResolvedValue(mockDatabase);
      getConnector.mockReturnValue(mockConnector);

      // Mock fs operations
      fsSpy.access.mockResolvedValue(undefined); // File exists check
      fsSpy.existsSync.mockReturnValue(true);

      const result = await backupService.restoreBackup(historyId, userId);

      expect(backupHistoryModel.findById).toHaveBeenCalledWith(historyId);
      expect(fsSpy.access).toHaveBeenCalled();
      expect(mockConnector.restoreBackup).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should decrypt backup before restore if encrypted', async () => {
      const userId = 1;
      const historyId = 1;
      const mockDatabase = generateFakeDatabase({ userId: 1 });
      const mockBackupHistory = {
        ...generateFakeBackupHistory({ isEncrypted: true, status: 'success', databaseId: 1, backupJobId: 1 }),
        database: mockDatabase,
      };
      const mockBackupJob = generateFakeBackupJob({ id: 1, encryptionPasswordHash: 'hashed', cloudStorageId: null });
      const mockConnector = mockDatabaseConnector();

      backupHistoryModel.findById.mockResolvedValue(mockBackupHistory);
      backupJobModel.findById.mockResolvedValue(mockBackupJob);
      databaseService.getDatabaseConfig = jest.fn().mockResolvedValue(mockDatabase);
      getConnector.mockReturnValue(mockConnector);

      // Mock decryption - decryptFile creates decrypted file, returns nothing
      decryptFile.mockImplementation(() => Promise.resolve());

      // Mock fs operations
      fsSpy.access.mockResolvedValue(undefined); // File exists check
      fsSpy.unlink.mockResolvedValue(undefined); // For cleaning up encrypted file after restore
      fsSpy.existsSync.mockReturnValue(true);

      const result = await backupService.restoreBackup(historyId, userId);

      expect(decryptFile).toHaveBeenCalled();
      expect(mockConnector.restoreBackup).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should throw error if backup file not found', async () => {
      const userId = 1;
      const historyId = 1;
      const mockDatabase = generateFakeDatabase({ userId: 1 });
      const mockBackupHistory = {
        ...generateFakeBackupHistory({ status: 'success', databaseId: 1 }),
        database: mockDatabase,
      };

      backupHistoryModel.findById.mockResolvedValue(mockBackupHistory);
      databaseService.getDatabaseConfig = jest.fn().mockResolvedValue(mockDatabase);
      fsSpy.access.mockRejectedValue(new Error('File not found'));

      await expect(backupService.restoreBackup(historyId, userId)).rejects.toThrow(
        'Backup file not found'
      );
    });

    it('should throw error if backup history not found', async () => {
      backupHistoryModel.findById.mockResolvedValue(null);

      await expect(backupService.restoreBackup(999, 1)).rejects.toThrow('Backup not found');
    });
  });

  describe('verifyBackup', () => {
    it('should verify backup with BASIC level successfully', async () => {
      const historyId = 1;
      const mockBackupHistory = generateFakeBackupHistory({ fileSize: 1024000 });

      backupJobModel.findById.mockResolvedValue(null);
      backupHistoryModel.findById.mockResolvedValue(mockBackupHistory);
      backupHistoryModel.update.mockResolvedValue({
        ...mockBackupHistory,
        verificationStatus: 'PASSED',
        verificationMethod: 'BASIC',
      });
      fsSpy.access.mockResolvedValue(undefined);
      fsSpy.stat.mockResolvedValue({ size: 1024000 });
      fsSpy.readFile.mockResolvedValue(Buffer.from('test data'));

      const result = await backupService.verifyBackup(historyId, 'BASIC');

      expect(backupHistoryModel.findById).toHaveBeenCalledWith(historyId);
      expect(result.overallStatus).toBe('PASSED');
    });

    it('should fail verification if file does not exist', async () => {
      const historyId = 1;
      const mockBackupHistory = generateFakeBackupHistory();

      backupJobModel.findById.mockResolvedValue(null);
      backupHistoryModel.findById.mockResolvedValue(mockBackupHistory);
      backupHistoryModel.update.mockResolvedValue({
        ...mockBackupHistory,
        verificationStatus: 'FAILED',
      });
      fsSpy.access.mockRejectedValue(new Error('File not found'));

      await expect(backupService.verifyBackup(historyId, 'BASIC')).rejects.toThrow('Verification failed');

      expect(backupHistoryModel.update).toHaveBeenCalledWith(historyId, expect.objectContaining({
        verificationStatus: 'FAILED'
      }));
    });

    it('should fail verification if file size mismatch', async () => {
      const historyId = 1;
      const mockBackupHistory = generateFakeBackupHistory({ fileSize: 1024000 });

      backupJobModel.findById.mockResolvedValue(null);
      backupHistoryModel.findById.mockResolvedValue(mockBackupHistory);
      backupHistoryModel.update.mockResolvedValue({
        ...mockBackupHistory,
        verificationStatus: 'PASSED',
      });
      fsSpy.access.mockResolvedValue(undefined);
      fsSpy.stat.mockResolvedValue({ size: 500000 }); // Different size
      fsSpy.readFile.mockResolvedValue(Buffer.from('test data'));

      const result = await backupService.verifyBackup(historyId, 'BASIC');

      expect(result.overallStatus).toBe('FAILED');
    });

    it('should throw error if backup history not found', async () => {
      backupHistoryModel.findById.mockResolvedValue(null);

      await expect(backupService.verifyBackup(999, 'BASIC')).rejects.toThrow('Backup not found');
    });
  });

  describe('getBackupHistory', () => {
    it('should return backup history for user', async () => {
      const userId = 1;
      const mockHistory = [
        generateFakeBackupHistory(),
        generateFakeBackupHistory({ id: 2, status: 'failed' }),
      ];

      backupHistoryModel.findByUserId.mockResolvedValue(mockHistory);

      const result = await backupService.getBackupHistory(userId);

      expect(backupHistoryModel.findByUserId).toHaveBeenCalledWith(userId, {});
      expect(result).toEqual(mockHistory);
      expect(result).toHaveLength(2);
    });

    it('should apply filters when provided', async () => {
      const userId = 1;
      const filters = { status: 'success', backupType: 'full' };

      backupHistoryModel.findByUserId.mockResolvedValue([]);

      await backupService.getBackupHistory(userId, filters);

      expect(backupHistoryModel.findByUserId).toHaveBeenCalledWith(userId, filters);
    });
  });

  describe('deleteBackup', () => {
    it('should delete backup and its file successfully', async () => {
      const userId = 1;
      const backupId = 1;
      const mockDatabase = generateFakeDatabase({ userId: 1 });
      const mockBackupHistory = {
        ...generateFakeBackupHistory({ backupJobId: null }),
        database: mockDatabase,
      };

      backupHistoryModel.findById.mockResolvedValue(mockBackupHistory);
      backupJobModel.findById.mockResolvedValue(null); // No backup job
      backupHistoryModel.delete.mockResolvedValue(mockBackupHistory);
      fsSpy.unlink.mockResolvedValue(undefined);

      const result = await backupService.deleteBackup(backupId, userId);

      expect(backupHistoryModel.findById).toHaveBeenCalledWith(backupId);
      expect(fsSpy.unlink).toHaveBeenCalledWith(mockBackupHistory.filePath);
      expect(backupHistoryModel.delete).toHaveBeenCalledWith(backupId);
      expect(result).toEqual(mockBackupHistory);
    });

    it('should delete from cloud storage if applicable', async () => {
      const userId = 1;
      const backupId = 1;
      const mockDatabase = generateFakeDatabase({ userId: 1 });
      const mockBackupHistory = {
        ...generateFakeBackupHistory({ backupJobId: 1 }),
        database: mockDatabase,
      };
      const mockBackupJob = generateFakeBackupJob({ cloudStorageId: 1, storageType: 's3' });
      const mockCloudStorage = generateFakeCloudStorage();
      const mockCloudConnector = mockCloudStorageConnector();

      backupHistoryModel.findById.mockResolvedValue(mockBackupHistory);
      backupJobModel.findById.mockResolvedValue(mockBackupJob);
      cloudStorageModel.findById.mockResolvedValue(mockCloudStorage);
      getCloudStorageConnector.mockReturnValue(mockCloudConnector);
      mockCloudConnector.deleteBackup = jest.fn().mockResolvedValue({ success: true });
      backupHistoryModel.delete.mockResolvedValue(mockBackupHistory);

      await backupService.deleteBackup(backupId, userId);

      expect(getCloudStorageConnector).toHaveBeenCalledWith(mockCloudStorage.storageType);
      expect(mockCloudConnector.deleteBackup).toHaveBeenCalled();
    });

    it('should not fail if local file does not exist', async () => {
      const userId = 1;
      const backupId = 1;
      const mockDatabase = generateFakeDatabase({ userId: 1 });
      const mockBackupHistory = {
        ...generateFakeBackupHistory(),
        database: mockDatabase,
      };

      backupHistoryModel.findById.mockResolvedValue(mockBackupHistory);
      backupHistoryModel.delete.mockResolvedValue(mockBackupHistory);
      fsSpy.unlink.mockRejectedValue(new Error('File not found'));

      const result = await backupService.deleteBackup(backupId, userId);

      expect(result).toEqual(mockBackupHistory);
    });

    it('should throw error if backup not found', async () => {
      backupHistoryModel.findById.mockResolvedValue(null);

      await expect(backupService.deleteBackup(999, 1)).rejects.toThrow('Backup not found');
    });
  });

  describe('getBackupStats', () => {
    it('should return backup statistics for user', async () => {
      const userId = 1;
      const mockStats = {
        totalBackups: 100,
        successfulBackups: 95,
        failedBackups: 5,
        totalSize: 1024000000,
        lastBackup: new Date(),
      };

      backupHistoryModel.getStats.mockResolvedValue(mockStats);

      const result = await backupService.getBackupStats(userId);

      expect(backupHistoryModel.getStats).toHaveBeenCalledWith(userId);
      expect(result).toEqual(mockStats);
    });
  });

  describe('getLastFullBackupForDatabase', () => {
    it('should return last full backup for database', async () => {
      const databaseId = 1;
      const mockFullBackup = generateFakeBackupHistory({ backupType: 'full' });

      // Mock prisma.backupHistory.findFirst
      prisma.backupHistory.findFirst.mockResolvedValue(mockFullBackup);

      const result = await backupService.getLastFullBackupForDatabase(databaseId);

      expect(prisma.backupHistory.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          databaseId: 1,
          backupType: 'full',
          status: 'success',
        }),
      }));
      expect(result).toEqual(mockFullBackup);
      expect(result.backupType).toBe('full');
    });

    it('should return null if no full backup found', async () => {
      const databaseId = 1;

      // Mock prisma.backupHistory.findFirst to return null
      prisma.backupHistory.findFirst.mockResolvedValue(null);

      const result = await backupService.getLastFullBackupForDatabase(databaseId);

      expect(result).toBeNull();
    });
  });
});
