// Mock dependencies FIRST before any imports
jest.mock('../../../src/models');
jest.mock('../../../src/utils/dbConnectors');
jest.mock('crypto');

// Import after mocks
const databaseService = require('../../../src/services/database.service');
const { databaseModel } = require('../../../src/models');
const { getConnector } = require('../../../src/utils/dbConnectors');
const crypto = require('crypto');
const ApiError = require('../../../src/utils/ApiError');
const { generateFakeDatabase } = require('../../utils/testHelpers');
const httpStatus = require('http-status');

describe('Database Service', () => {
  let mockConnector;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup crypto mocks
    const mockCipher = {
      update: jest.fn().mockReturnValue(Buffer.from('encrypted')),
      final: jest.fn().mockReturnValue(Buffer.from('data')),
    };

    const mockDecipher = {
      update: jest.fn().mockReturnValue(Buffer.from('decrypted')),
      final: jest.fn().mockReturnValue(Buffer.from('password')),
    };

    crypto.randomBytes = jest.fn().mockReturnValue(Buffer.from('1234567890abcdef'));
    crypto.createCipheriv = jest.fn().mockReturnValue(mockCipher);
    crypto.createDecipheriv = jest.fn().mockReturnValue(mockDecipher);

    // Setup database connector mock
    mockConnector = {
      testConnection: jest.fn().mockResolvedValue({ success: true, message: 'Connection successful' }),
      getDatabaseSize: jest.fn().mockResolvedValue({ size: 1024000, unit: 'bytes' }),
    };

    getConnector.mockReturnValue(mockConnector);
  });

  describe('createDatabase', () => {
    const userId = 1;
    const databaseData = {
      name: 'Test Database',
      type: 'postgresql',
      host: 'localhost',
      port: 5432,
      username: 'testuser',
      password: 'testpass',
      database: 'testdb',
    };

    it('should create database with encrypted password', async () => {
      const mockDatabase = generateFakeDatabase({
        ...databaseData,
        userId,
        password: 'encrypted:password',
      });

      databaseModel.create.mockResolvedValue(mockDatabase);

      const result = await databaseService.createDatabase(userId, databaseData);

      expect(databaseModel.create).toHaveBeenCalledWith({
        ...databaseData,
        userId,
        password: expect.any(String),
      });
      expect(result).not.toHaveProperty('password');
      expect(result.name).toBe(databaseData.name);
    });

    it('should remove password from response', async () => {
      const mockDatabase = generateFakeDatabase({ userId, password: 'encrypted:password' });
      databaseModel.create.mockResolvedValue(mockDatabase);

      const result = await databaseService.createDatabase(userId, databaseData);

      expect(result).not.toHaveProperty('password');
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('type');
    });
  });

  describe('getDatabaseById', () => {
    const userId = 1;
    const databaseId = 1;

    it('should get database by ID successfully', async () => {
      const mockDatabase = generateFakeDatabase({ id: databaseId, userId, password: 'encrypted:password' });
      databaseModel.findById.mockResolvedValue(mockDatabase);

      const result = await databaseService.getDatabaseById(databaseId, userId);

      expect(databaseModel.findById).toHaveBeenCalledWith(databaseId);
      expect(result).not.toHaveProperty('password');
      expect(result.id).toBe(databaseId);
    });

    it('should throw error if database not found', async () => {
      databaseModel.findById.mockResolvedValue(null);

      await expect(databaseService.getDatabaseById(databaseId, userId)).rejects.toThrow(ApiError);
      await expect(databaseService.getDatabaseById(databaseId, userId)).rejects.toThrow('Database not found');
    });

    it('should throw error if user does not own the database', async () => {
      const mockDatabase = generateFakeDatabase({ id: databaseId, userId: 999 });
      databaseModel.findById.mockResolvedValue(mockDatabase);

      await expect(databaseService.getDatabaseById(databaseId, userId)).rejects.toThrow(ApiError);
      await expect(databaseService.getDatabaseById(databaseId, userId)).rejects.toThrow('Access denied');
    });
  });

  describe('getUserDatabases', () => {
    const userId = 1;

    it('should get all databases for user', async () => {
      const mockDatabases = [
        generateFakeDatabase({ id: 1, userId, password: 'encrypted1' }),
        generateFakeDatabase({ id: 2, userId, password: 'encrypted2' }),
      ];

      databaseModel.findByUserId.mockResolvedValue(mockDatabases);

      const result = await databaseService.getUserDatabases(userId);

      expect(databaseModel.findByUserId).toHaveBeenCalledWith(userId, {});
      expect(result).toHaveLength(2);
      expect(result[0]).not.toHaveProperty('password');
      expect(result[1]).not.toHaveProperty('password');
    });

    it('should apply filters when provided', async () => {
      const filters = { type: 'postgresql', isActive: true };
      databaseModel.findByUserId.mockResolvedValue([]);

      await databaseService.getUserDatabases(userId, filters);

      expect(databaseModel.findByUserId).toHaveBeenCalledWith(userId, filters);
    });

    it('should return empty array if no databases found', async () => {
      databaseModel.findByUserId.mockResolvedValue([]);

      const result = await databaseService.getUserDatabases(userId);

      expect(result).toEqual([]);
    });
  });

  describe('updateDatabase', () => {
    const userId = 1;
    const databaseId = 1;
    const updateData = { name: 'Updated Database', host: 'newhost' };

    it('should update database successfully', async () => {
      const mockDatabase = generateFakeDatabase({ id: databaseId, userId });
      const updatedDatabase = { ...mockDatabase, ...updateData };

      databaseModel.findById.mockResolvedValue(mockDatabase);
      databaseModel.update.mockResolvedValue(updatedDatabase);

      const result = await databaseService.updateDatabase(databaseId, userId, updateData);

      expect(databaseModel.update).toHaveBeenCalledWith(databaseId, updateData);
      expect(result).not.toHaveProperty('password');
      expect(result.name).toBe(updateData.name);
    });

    it('should encrypt password if password is being updated', async () => {
      const mockDatabase = generateFakeDatabase({ id: databaseId, userId });
      const updateWithPassword = { ...updateData, password: 'newpassword' };

      databaseModel.findById.mockResolvedValue(mockDatabase);
      databaseModel.update.mockResolvedValue({ ...mockDatabase, ...updateWithPassword });

      await databaseService.updateDatabase(databaseId, userId, updateWithPassword);

      expect(databaseModel.update).toHaveBeenCalledWith(databaseId, {
        ...updateData,
        password: expect.any(String),
      });
    });

    it('should throw error if database not found', async () => {
      databaseModel.findById.mockResolvedValue(null);

      await expect(databaseService.updateDatabase(databaseId, userId, updateData)).rejects.toThrow(ApiError);
      await expect(databaseService.updateDatabase(databaseId, userId, updateData)).rejects.toThrow('Database not found');
    });

    it('should throw error if user does not own the database', async () => {
      const mockDatabase = generateFakeDatabase({ id: databaseId, userId: 999 });
      databaseModel.findById.mockResolvedValue(mockDatabase);

      await expect(databaseService.updateDatabase(databaseId, userId, updateData)).rejects.toThrow(ApiError);
      await expect(databaseService.updateDatabase(databaseId, userId, updateData)).rejects.toThrow('Access denied');
    });
  });

  describe('deleteDatabase', () => {
    const userId = 1;
    const databaseId = 1;

    it('should delete database successfully', async () => {
      const mockDatabase = generateFakeDatabase({ id: databaseId, userId });
      databaseModel.findById.mockResolvedValue(mockDatabase);
      databaseModel.delete.mockResolvedValue(true);

      const result = await databaseService.deleteDatabase(databaseId, userId);

      expect(databaseModel.delete).toHaveBeenCalledWith(databaseId);
      expect(result).not.toHaveProperty('password');
    });

    it('should throw error if database not found', async () => {
      databaseModel.findById.mockResolvedValue(null);

      await expect(databaseService.deleteDatabase(databaseId, userId)).rejects.toThrow(ApiError);
      await expect(databaseService.deleteDatabase(databaseId, userId)).rejects.toThrow('Database not found');
    });

    it('should throw error if user does not own the database', async () => {
      const mockDatabase = generateFakeDatabase({ id: databaseId, userId: 999 });
      databaseModel.findById.mockResolvedValue(mockDatabase);

      await expect(databaseService.deleteDatabase(databaseId, userId)).rejects.toThrow(ApiError);
      await expect(databaseService.deleteDatabase(databaseId, userId)).rejects.toThrow('Access denied');
    });
  });

  describe('testDatabaseConnection', () => {
    const userId = 1;
    const databaseId = 1;

    it('should test database connection successfully', async () => {
      const mockDatabase = generateFakeDatabase({
        id: databaseId,
        userId,
        password: '3132333435363738393061626364656637383930:656e637279707465646461746131323334',
      });

      databaseModel.findById.mockResolvedValue(mockDatabase);
      databaseModel.updateLastTested.mockResolvedValue(true);

      const result = await databaseService.testDatabaseConnection(databaseId, userId);

      expect(databaseModel.findById).toHaveBeenCalledWith(databaseId);
      expect(getConnector).toHaveBeenCalledWith(mockDatabase.type);
      expect(mockConnector.testConnection).toHaveBeenCalled();
      expect(databaseModel.updateLastTested).toHaveBeenCalledWith(databaseId);
      expect(result.success).toBe(true);
    });

    it('should throw error if database not found', async () => {
      databaseModel.findById.mockResolvedValue(null);

      await expect(databaseService.testDatabaseConnection(databaseId, userId)).rejects.toThrow(ApiError);
      await expect(databaseService.testDatabaseConnection(databaseId, userId)).rejects.toThrow('Database not found');
    });

    it('should throw error if user does not own the database', async () => {
      const mockDatabase = generateFakeDatabase({ id: databaseId, userId: 999 });
      databaseModel.findById.mockResolvedValue(mockDatabase);

      await expect(databaseService.testDatabaseConnection(databaseId, userId)).rejects.toThrow(ApiError);
      await expect(databaseService.testDatabaseConnection(databaseId, userId)).rejects.toThrow('Access denied');
    });

    it('should throw error if connection test fails', async () => {
      const mockDatabase = generateFakeDatabase({
        id: databaseId,
        userId,
        password: '3132333435363738393061626364656637383930:656e637279707465646461746131323334',
      });

      databaseModel.findById.mockResolvedValue(mockDatabase);
      mockConnector.testConnection.mockRejectedValue(new Error('Connection failed'));

      await expect(databaseService.testDatabaseConnection(databaseId, userId)).rejects.toThrow(ApiError);
      await expect(databaseService.testDatabaseConnection(databaseId, userId)).rejects.toThrow('Connection test failed');
    });

    it('should not update lastTestedAt if connection fails', async () => {
      const mockDatabase = generateFakeDatabase({
        id: databaseId,
        userId,
        password: '3132333435363738393061626364656637383930:656e637279707465646461746131323334',
      });

      databaseModel.findById.mockResolvedValue(mockDatabase);
      mockConnector.testConnection.mockResolvedValue({ success: false });

      await databaseService.testDatabaseConnection(databaseId, userId);

      expect(databaseModel.updateLastTested).not.toHaveBeenCalled();
    });
  });

  describe('testConnectionWithCredentials', () => {
    const databaseData = {
      type: 'postgresql',
      host: 'localhost',
      port: 5432,
      username: 'testuser',
      password: 'testpass',
      database: 'testdb',
    };

    it('should test connection with raw credentials successfully', async () => {
      const result = await databaseService.testConnectionWithCredentials(databaseData);

      expect(getConnector).toHaveBeenCalledWith(databaseData.type);
      expect(mockConnector.testConnection).toHaveBeenCalledWith({
        host: databaseData.host,
        port: databaseData.port,
        username: databaseData.username,
        password: databaseData.password,
        database: databaseData.database,
        connectionString: undefined,
        sslEnabled: false,
      });
      expect(result.success).toBe(true);
    });

    it('should throw error if connection test fails', async () => {
      mockConnector.testConnection.mockRejectedValue(new Error('Connection failed'));

      await expect(databaseService.testConnectionWithCredentials(databaseData)).rejects.toThrow(ApiError);
      await expect(databaseService.testConnectionWithCredentials(databaseData)).rejects.toThrow('Connection test failed');
    });

    it('should handle SSL enabled connections', async () => {
      const databaseDataWithSSL = { ...databaseData, sslEnabled: true };

      await databaseService.testConnectionWithCredentials(databaseDataWithSSL);

      expect(mockConnector.testConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          sslEnabled: true,
        })
      );
    });
  });

  describe('getDatabaseSize', () => {
    const userId = 1;
    const databaseId = 1;

    it('should get database size successfully', async () => {
      const mockDatabase = generateFakeDatabase({
        id: databaseId,
        userId,
        password: '3132333435363738393061626364656637383930:656e637279707465646461746131323334',
      });

      databaseModel.findById.mockResolvedValue(mockDatabase);

      const result = await databaseService.getDatabaseSize(databaseId, userId);

      expect(databaseModel.findById).toHaveBeenCalledWith(databaseId);
      expect(getConnector).toHaveBeenCalledWith(mockDatabase.type);
      expect(mockConnector.getDatabaseSize).toHaveBeenCalled();
      expect(result.size).toBe(1024000);
    });

    it('should throw error if database not found', async () => {
      databaseModel.findById.mockResolvedValue(null);

      await expect(databaseService.getDatabaseSize(databaseId, userId)).rejects.toThrow(ApiError);
      await expect(databaseService.getDatabaseSize(databaseId, userId)).rejects.toThrow('Database not found');
    });

    it('should throw error if user does not own the database', async () => {
      const mockDatabase = generateFakeDatabase({ id: databaseId, userId: 999 });
      databaseModel.findById.mockResolvedValue(mockDatabase);

      await expect(databaseService.getDatabaseSize(databaseId, userId)).rejects.toThrow(ApiError);
      await expect(databaseService.getDatabaseSize(databaseId, userId)).rejects.toThrow('Access denied');
    });

    it('should throw error if getDatabaseSize fails', async () => {
      const mockDatabase = generateFakeDatabase({
        id: databaseId,
        userId,
        password: '3132333435363738393061626364656637383930:656e637279707465646461746131323334',
      });

      databaseModel.findById.mockResolvedValue(mockDatabase);
      mockConnector.getDatabaseSize.mockRejectedValue(new Error('Failed to get size'));

      await expect(databaseService.getDatabaseSize(databaseId, userId)).rejects.toThrow(ApiError);
      await expect(databaseService.getDatabaseSize(databaseId, userId)).rejects.toThrow('Failed to get database size');
    });
  });

  describe('getDatabaseConfig', () => {
    const databaseId = 1;

    it('should get database config with decrypted password', async () => {
      const mockDatabase = generateFakeDatabase({
        id: databaseId,
        password: '3132333435363738393061626364656637383930:656e637279707465646461746131323334',
      });

      databaseModel.findById.mockResolvedValue(mockDatabase);

      const result = await databaseService.getDatabaseConfig(databaseId);

      expect(databaseModel.findById).toHaveBeenCalledWith(databaseId);
      expect(result).toHaveProperty('password');
      expect(result.id).toBe(databaseId);
    });

    it('should throw error if database not found', async () => {
      databaseModel.findById.mockResolvedValue(null);

      await expect(databaseService.getDatabaseConfig(databaseId)).rejects.toThrow(ApiError);
      await expect(databaseService.getDatabaseConfig(databaseId)).rejects.toThrow('Database not found');
    });
  });
});
