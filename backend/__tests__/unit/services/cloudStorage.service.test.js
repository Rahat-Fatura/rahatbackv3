// Mock dependencies FIRST before any imports
jest.mock('../../../src/models');
jest.mock('../../../src/utils/cloudStorage');
jest.mock('../../../src/config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

// Import after mocks
const cloudStorageService = require('../../../src/services/cloudStorage.service');
const { cloudStorageModel } = require('../../../src/models');
const { getCloudStorageConnector, awsS3Connector } = require('../../../src/utils/cloudStorage');
const ApiError = require('../../../src/utils/ApiError');
const { generateFakeCloudStorage } = require('../../utils/testHelpers');
const httpStatus = require('http-status');

describe('Cloud Storage Service', () => {
  let mockConnector;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup cloud storage connector mock
    mockConnector = {
      testConnection: jest.fn().mockResolvedValue({ success: true, message: 'Connection successful' }),
      listBackups: jest.fn().mockResolvedValue([
        { name: 'backup1.sql', size: 1024000, lastModified: new Date() },
        { name: 'backup2.sql', size: 2048000, lastModified: new Date() },
      ]),
    };

    getCloudStorageConnector.mockReturnValue(mockConnector);

    // Setup AWS S3 connector mock
    awsS3Connector.encryptCredentials = jest.fn().mockReturnValue({
      iv: 'encryptediv',
      encryptedData: 'encrypteddata',
    });
  });

  describe('createCloudStorage', () => {
    const userId = 1;
    const storageData = {
      name: 'Test S3 Storage',
      storageType: 's3',
      s3Region: 'us-east-1',
      s3Bucket: 'test-bucket',
      s3AccessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      s3SecretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      isDefault: false,
    };

    it('should create cloud storage with encrypted AWS credentials', async () => {
      const mockCloudStorage = generateFakeCloudStorage({ userId });
      cloudStorageModel.create.mockResolvedValue(mockCloudStorage);

      const result = await cloudStorageService.createCloudStorage(userId, { ...storageData });

      expect(awsS3Connector.encryptCredentials).toHaveBeenCalledWith(
        storageData.s3AccessKeyId,
        storageData.s3SecretAccessKey
      );
      expect(cloudStorageModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          name: storageData.name,
          storageType: storageData.storageType,
          s3EncryptedCredentials: expect.any(String),
        })
      );
      expect(result).toEqual(mockCloudStorage);
    });

    it('should trim AWS credentials before encryption', async () => {
      const storageDataWithSpaces = {
        ...storageData,
        s3AccessKeyId: '  AKIAIOSFODNN7EXAMPLE  \n',
        s3SecretAccessKey: '  wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY  \n',
      };

      cloudStorageModel.create.mockResolvedValue(generateFakeCloudStorage());

      await cloudStorageService.createCloudStorage(userId, { ...storageDataWithSpaces });

      expect(awsS3Connector.encryptCredentials).toHaveBeenCalledWith(
        'AKIAIOSFODNN7EXAMPLE',
        'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
      );
    });

    it('should set as default and unset other defaults', async () => {
      const storageDataWithDefault = { ...storageData, isDefault: true };
      cloudStorageModel.create.mockResolvedValue(generateFakeCloudStorage({ isDefault: true }));
      cloudStorageModel.setAsDefault.mockResolvedValue(true);

      await cloudStorageService.createCloudStorage(userId, { ...storageDataWithDefault });

      expect(cloudStorageModel.setAsDefault).toHaveBeenCalledWith(null, userId, storageData.storageType);
    });

    it('should not encrypt credentials if not S3 storage type', async () => {
      const gdStorageData = {
        name: 'Test Google Drive',
        storageType: 'google_drive',
        gdRefreshToken: 'test-refresh-token',
        gdFolderId: 'folder-123',
      };

      cloudStorageModel.create.mockResolvedValue(generateFakeCloudStorage({ storageType: 'google_drive' }));

      await cloudStorageService.createCloudStorage(userId, gdStorageData);

      expect(awsS3Connector.encryptCredentials).not.toHaveBeenCalled();
      expect(cloudStorageModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          name: gdStorageData.name,
          storageType: 'google_drive',
        })
      );
    });
  });

  describe('getCloudStorageById', () => {
    const userId = 1;
    const storageId = 1;

    it('should get cloud storage by ID successfully', async () => {
      const mockCloudStorage = generateFakeCloudStorage({ id: storageId, userId });
      cloudStorageModel.findById.mockResolvedValue(mockCloudStorage);

      const result = await cloudStorageService.getCloudStorageById(storageId, userId);

      expect(cloudStorageModel.findById).toHaveBeenCalledWith(storageId);
      expect(result).toEqual(mockCloudStorage);
    });

    it('should throw error if cloud storage not found', async () => {
      cloudStorageModel.findById.mockResolvedValue(null);

      await expect(cloudStorageService.getCloudStorageById(storageId, userId)).rejects.toThrow(ApiError);
      await expect(cloudStorageService.getCloudStorageById(storageId, userId)).rejects.toThrow(
        'Cloud storage configuration not found'
      );
    });

    it('should throw error if user does not own the cloud storage', async () => {
      const mockCloudStorage = generateFakeCloudStorage({ id: storageId, userId: 999 });
      cloudStorageModel.findById.mockResolvedValue(mockCloudStorage);

      await expect(cloudStorageService.getCloudStorageById(storageId, userId)).rejects.toThrow(ApiError);
      await expect(cloudStorageService.getCloudStorageById(storageId, userId)).rejects.toThrow('Access denied');
    });
  });

  describe('getUserCloudStorages', () => {
    const userId = 1;

    it('should get all cloud storages for user', async () => {
      const mockCloudStorages = [
        generateFakeCloudStorage({ id: 1, userId, storageType: 's3' }),
        generateFakeCloudStorage({ id: 2, userId, storageType: 'google_drive' }),
      ];

      cloudStorageModel.findByUserId.mockResolvedValue(mockCloudStorages);

      const result = await cloudStorageService.getUserCloudStorages(userId);

      expect(cloudStorageModel.findByUserId).toHaveBeenCalledWith(userId, {});
      expect(result).toEqual(mockCloudStorages);
    });

    it('should apply filters when provided', async () => {
      const filters = { storageType: 's3', isActive: true };
      cloudStorageModel.findByUserId.mockResolvedValue([]);

      await cloudStorageService.getUserCloudStorages(userId, filters);

      expect(cloudStorageModel.findByUserId).toHaveBeenCalledWith(userId, filters);
    });

    it('should return empty array if no cloud storages found', async () => {
      cloudStorageModel.findByUserId.mockResolvedValue([]);

      const result = await cloudStorageService.getUserCloudStorages(userId);

      expect(result).toEqual([]);
    });
  });

  describe('updateCloudStorage', () => {
    const userId = 1;
    const storageId = 1;
    const updateData = { name: 'Updated Storage', s3Region: 'us-west-1' };

    it('should update cloud storage successfully', async () => {
      const mockCloudStorage = generateFakeCloudStorage({ id: storageId, userId });
      const updatedCloudStorage = { ...mockCloudStorage, ...updateData };

      cloudStorageModel.findById.mockResolvedValue(mockCloudStorage);
      cloudStorageModel.update.mockResolvedValue(updatedCloudStorage);

      const result = await cloudStorageService.updateCloudStorage(storageId, userId, updateData);

      expect(cloudStorageModel.update).toHaveBeenCalledWith(storageId, updateData);
      expect(result).toEqual(updatedCloudStorage);
    });

    it('should encrypt AWS credentials if provided in update', async () => {
      const mockCloudStorage = generateFakeCloudStorage({ id: storageId, userId, storageType: 's3' });
      const updateWithCredentials = {
        ...updateData,
        storageType: 's3',
        s3AccessKeyId: 'NEWAKIAIOSFODNN7EXAMPLE',
        s3SecretAccessKey: 'newwJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      };

      cloudStorageModel.findById.mockResolvedValue(mockCloudStorage);
      cloudStorageModel.update.mockResolvedValue(mockCloudStorage);

      await cloudStorageService.updateCloudStorage(storageId, userId, { ...updateWithCredentials });

      expect(awsS3Connector.encryptCredentials).toHaveBeenCalled();
      expect(cloudStorageModel.update).toHaveBeenCalledWith(
        storageId,
        expect.objectContaining({
          s3EncryptedCredentials: expect.any(String),
        })
      );
    });

    it('should set as default if isDefault is true', async () => {
      const mockCloudStorage = generateFakeCloudStorage({ id: storageId, userId, isDefault: false });
      const updateWithDefault = { isDefault: true };

      cloudStorageModel.findById.mockResolvedValue(mockCloudStorage);
      cloudStorageModel.setAsDefault.mockResolvedValue(true);
      cloudStorageModel.update.mockResolvedValue({ ...mockCloudStorage, isDefault: true });

      await cloudStorageService.updateCloudStorage(storageId, userId, updateWithDefault);

      expect(cloudStorageModel.setAsDefault).toHaveBeenCalledWith(storageId, userId, mockCloudStorage.storageType);
    });

    it('should throw error if cloud storage not found', async () => {
      cloudStorageModel.findById.mockResolvedValue(null);

      await expect(cloudStorageService.updateCloudStorage(storageId, userId, updateData)).rejects.toThrow(ApiError);
    });
  });

  describe('deleteCloudStorage', () => {
    const userId = 1;
    const storageId = 1;

    it('should delete cloud storage successfully', async () => {
      const mockCloudStorage = generateFakeCloudStorage({ id: storageId, userId });
      cloudStorageModel.findById.mockResolvedValue(mockCloudStorage);
      cloudStorageModel.delete.mockResolvedValue(mockCloudStorage);

      const result = await cloudStorageService.deleteCloudStorage(storageId, userId);

      expect(cloudStorageModel.delete).toHaveBeenCalledWith(storageId);
      expect(result).toEqual(mockCloudStorage);
    });

    it('should throw error if cloud storage not found', async () => {
      cloudStorageModel.findById.mockResolvedValue(null);

      await expect(cloudStorageService.deleteCloudStorage(storageId, userId)).rejects.toThrow(ApiError);
    });
  });

  describe('testConnection', () => {
    const userId = 1;
    const storageId = 1;

    it('should test cloud storage connection successfully', async () => {
      const mockCloudStorage = generateFakeCloudStorage({ id: storageId, userId });
      cloudStorageModel.findById.mockResolvedValue(mockCloudStorage);

      const result = await cloudStorageService.testConnection(storageId, userId);

      expect(getCloudStorageConnector).toHaveBeenCalledWith(mockCloudStorage.storageType);
      expect(mockConnector.testConnection).toHaveBeenCalledWith(mockCloudStorage);
      expect(result.success).toBe(true);
    });

    it('should throw error if connection test fails', async () => {
      const mockCloudStorage = generateFakeCloudStorage({ id: storageId, userId });
      cloudStorageModel.findById.mockResolvedValue(mockCloudStorage);
      mockConnector.testConnection.mockRejectedValue(new Error('Connection failed'));

      await expect(cloudStorageService.testConnection(storageId, userId)).rejects.toThrow(ApiError);
      await expect(cloudStorageService.testConnection(storageId, userId)).rejects.toThrow('Connection test failed');
    });

    it('should throw error if cloud storage not found', async () => {
      cloudStorageModel.findById.mockResolvedValue(null);

      await expect(cloudStorageService.testConnection(storageId, userId)).rejects.toThrow(ApiError);
    });
  });

  describe('setAsDefault', () => {
    const userId = 1;
    const storageId = 1;

    it('should set cloud storage as default successfully', async () => {
      const mockCloudStorage = generateFakeCloudStorage({ id: storageId, userId });
      cloudStorageModel.findById.mockResolvedValue(mockCloudStorage);
      cloudStorageModel.setAsDefault.mockResolvedValue(true);

      const result = await cloudStorageService.setAsDefault(storageId, userId);

      expect(cloudStorageModel.setAsDefault).toHaveBeenCalledWith(storageId, userId, mockCloudStorage.storageType);
      expect(result).toBe(true);
    });

    it('should throw error if cloud storage not found', async () => {
      cloudStorageModel.findById.mockResolvedValue(null);

      await expect(cloudStorageService.setAsDefault(storageId, userId)).rejects.toThrow(ApiError);
    });
  });

  describe('getDefaultCloudStorage', () => {
    const userId = 1;
    const storageType = 's3';

    it('should get default cloud storage for user and type', async () => {
      const mockCloudStorage = generateFakeCloudStorage({ userId, storageType, isDefault: true });
      cloudStorageModel.findDefaultByUserId.mockResolvedValue(mockCloudStorage);

      const result = await cloudStorageService.getDefaultCloudStorage(userId, storageType);

      expect(cloudStorageModel.findDefaultByUserId).toHaveBeenCalledWith(userId, storageType);
      expect(result).toEqual(mockCloudStorage);
    });

    it('should return null if no default found', async () => {
      cloudStorageModel.findDefaultByUserId.mockResolvedValue(null);

      const result = await cloudStorageService.getDefaultCloudStorage(userId, storageType);

      expect(result).toBeNull();
    });
  });

  describe('listFiles', () => {
    const userId = 1;
    const storageId = 1;

    it('should list files in cloud storage successfully', async () => {
      const mockCloudStorage = generateFakeCloudStorage({ id: storageId, userId });
      cloudStorageModel.findById.mockResolvedValue(mockCloudStorage);

      const result = await cloudStorageService.listFiles(storageId, userId);

      expect(getCloudStorageConnector).toHaveBeenCalledWith(mockCloudStorage.storageType);
      expect(mockConnector.listBackups).toHaveBeenCalledWith(mockCloudStorage);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('name');
    });

    it('should throw error if listing files fails', async () => {
      const mockCloudStorage = generateFakeCloudStorage({ id: storageId, userId });
      cloudStorageModel.findById.mockResolvedValue(mockCloudStorage);
      mockConnector.listBackups.mockRejectedValue(new Error('Failed to list files'));

      await expect(cloudStorageService.listFiles(storageId, userId)).rejects.toThrow(ApiError);
      await expect(cloudStorageService.listFiles(storageId, userId)).rejects.toThrow('Failed to list files');
    });

    it('should throw error if cloud storage not found', async () => {
      cloudStorageModel.findById.mockResolvedValue(null);

      await expect(cloudStorageService.listFiles(storageId, userId)).rejects.toThrow(ApiError);
    });
  });
});
