const { auditLogService } = require('../../../src/services');
const { auditLogModel } = require('../../../src/models');
const { generateFakeAuditLog } = require('../../utils/testHelpers');

// Mock the model
jest.mock('../../../src/models/auditLog.model');

describe('AuditLog Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('logAction', () => {
    it('should create an audit log entry successfully', async () => {
      const mockLogData = {
        userId: 1,
        action: 'LOGIN',
        resource: 'auth',
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
        status: 'success',
      };

      const mockAuditLog = generateFakeAuditLog(mockLogData);
      auditLogModel.create.mockResolvedValue(mockAuditLog);

      const result = await auditLogService.logAction(mockLogData);

      expect(auditLogModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockLogData.userId,
          action: mockLogData.action,
          resource: mockLogData.resource,
          ipAddress: mockLogData.ipAddress,
          userAgent: mockLogData.userAgent,
          status: mockLogData.status,
        })
      );
      expect(result).toEqual(mockAuditLog);
    });

    it('should handle null userId (anonymous actions)', async () => {
      const mockLogData = {
        userId: null,
        action: 'REGISTER',
        resource: 'auth',
        status: 'success',
      };

      const mockAuditLog = generateFakeAuditLog({ ...mockLogData, userId: null });
      auditLogModel.create.mockResolvedValue(mockAuditLog);

      const result = await auditLogService.logAction(mockLogData);

      expect(auditLogModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: null,
          action: mockLogData.action,
        })
      );
      expect(result).toEqual(mockAuditLog);
    });

    it('should stringify details object', async () => {
      const mockLogData = {
        userId: 1,
        action: 'DATABASE_CREATE',
        details: { method: 'POST', path: '/v1/databases' },
      };

      auditLogModel.create.mockResolvedValue(generateFakeAuditLog());

      await auditLogService.logAction(mockLogData);

      expect(auditLogModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          details: JSON.stringify(mockLogData.details),
        })
      );
    });

    it('should not throw error on failure (non-blocking)', async () => {
      const mockLogData = {
        userId: 1,
        action: 'LOGIN',
      };

      auditLogModel.create.mockRejectedValue(new Error('Database error'));

      // Should not throw
      const result = await auditLogService.logAction(mockLogData);

      expect(result).toBeNull();
    });
  });

  describe('getUserAuditLogs', () => {
    it('should return paginated audit logs for a user', async () => {
      const userId = 1;
      const mockLogs = [generateFakeAuditLog(), generateFakeAuditLog({ id: 2 })];
      const mockResult = {
        logs: mockLogs,
        pagination: {
          page: 1,
          limit: 50,
          total: 2,
          totalPages: 1,
        },
      };

      auditLogModel.findByUserId.mockResolvedValue(mockResult);

      const result = await auditLogService.getUserAuditLogs(userId);

      expect(auditLogModel.findByUserId).toHaveBeenCalledWith(userId, {});
      expect(result).toEqual(mockResult);
      expect(result.logs).toHaveLength(2);
    });

    it('should apply filters when provided', async () => {
      const userId = 1;
      const filters = {
        action: 'LOGIN',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      };

      auditLogModel.findByUserId.mockResolvedValue({
        logs: [],
        pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
      });

      await auditLogService.getUserAuditLogs(userId, filters);

      expect(auditLogModel.findByUserId).toHaveBeenCalledWith(userId, filters);
    });
  });

  describe('getAuditLogsByAction', () => {
    it('should return audit logs filtered by action', async () => {
      const action = 'BACKUP_SUCCESS';
      const mockLogs = [
        generateFakeAuditLog({ action }),
        generateFakeAuditLog({ id: 2, action }),
      ];

      auditLogModel.findByAction.mockResolvedValue(mockLogs);

      const result = await auditLogService.getAuditLogsByAction(action);

      expect(auditLogModel.findByAction).toHaveBeenCalledWith(action, {});
      expect(result).toEqual(mockLogs);
    });
  });

  describe('getResourceAuditLogs', () => {
    it('should return audit logs for a specific resource', async () => {
      const resource = 'database';
      const resourceId = 5;
      const mockLogs = [
        generateFakeAuditLog({ resource, resourceId }),
        generateFakeAuditLog({ id: 2, resource, resourceId }),
      ];

      auditLogModel.findByResource.mockResolvedValue(mockLogs);

      const result = await auditLogService.getResourceAuditLogs(resource, resourceId);

      expect(auditLogModel.findByResource).toHaveBeenCalledWith(resource, resourceId);
      expect(result).toEqual(mockLogs);
    });
  });

  describe('getAuditLogStats', () => {
    it('should return statistics for all users when userId is null', async () => {
      const mockStats = {
        totalLogs: 100,
        successCount: 90,
        failureCount: 10,
        topActions: [
          { action: 'LOGIN', count: 50 },
          { action: 'BACKUP_SUCCESS', count: 30 },
        ],
      };

      auditLogModel.getStats.mockResolvedValue(mockStats);

      const result = await auditLogService.getAuditLogStats(null);

      expect(auditLogModel.getStats).toHaveBeenCalledWith(null);
      expect(result).toEqual(mockStats);
    });

    it('should return statistics for a specific user', async () => {
      const userId = 1;
      const mockStats = {
        totalLogs: 50,
        successCount: 48,
        failureCount: 2,
        topActions: [{ action: 'LOGIN', count: 25 }],
      };

      auditLogModel.getStats.mockResolvedValue(mockStats);

      const result = await auditLogService.getAuditLogStats(userId);

      expect(auditLogModel.getStats).toHaveBeenCalledWith(userId);
      expect(result).toEqual(mockStats);
    });
  });

  describe('cleanupOldLogs', () => {
    it('should delete logs older than specified days', async () => {
      const days = 90;
      const mockResult = { count: 50 };

      auditLogModel.deleteOlderThan.mockResolvedValue(mockResult);

      const result = await auditLogService.cleanupOldLogs(days);

      expect(auditLogModel.deleteOlderThan).toHaveBeenCalledWith(days);
      expect(result).toEqual(mockResult);
    });

    it('should use default 90 days if not specified', async () => {
      const mockResult = { count: 20 };

      auditLogModel.deleteOlderThan.mockResolvedValue(mockResult);

      await auditLogService.cleanupOldLogs();

      expect(auditLogModel.deleteOlderThan).toHaveBeenCalledWith(90);
    });

    it('should throw error if cleanup fails', async () => {
      auditLogModel.deleteOlderThan.mockRejectedValue(new Error('Database error'));

      await expect(auditLogService.cleanupOldLogs(90)).rejects.toThrow(
        'Failed to cleanup audit logs'
      );
    });
  });
});
