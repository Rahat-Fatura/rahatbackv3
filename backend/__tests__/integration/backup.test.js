const request = require('supertest');
const httpStatus = require('http-status');
const app = require('../../src/app');

jest.mock('../../src/models');
jest.mock('../../src/middlewares/auth', () => ({
  __esModule: true,
  default: () => (req, res, next) => {
    req.user = { userId: 1, role: 'user' };
    next();
  },
}));

const backupService = require('../../src/services/backup.service');

describe('Backup Routes', () => {
  let mockBackupJob;
  let mockBackupHistory;

  beforeEach(() => {
    jest.clearAllMocks();

    mockBackupJob = {
      id: 1,
      databaseId: 1,
      name: 'Daily Backup',
      scheduleType: 'daily',
      storageType: 'local',
      storagePath: '/backups',
      compression: true,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockBackupHistory = {
      id: 1,
      backupJobId: 1,
      databaseId: 1,
      fileName: 'backup_20250118.sql',
      filePath: '/backups/backup_20250118.sql',
      fileSize: 1024000,
      backupType: 'full',
      status: 'success',
      createdAt: new Date(),
    };
  });

  describe('POST /v1/backups/jobs', () => {
    it('should return 201 and successfully create backup job if data is ok', async () => {
      backupService.createBackupJob = jest.fn().mockResolvedValue(mockBackupJob);

      const res = await request(app)
        .post('/v1/backups/jobs')
        .set('Authorization', 'Bearer validToken')
        .send({
          databaseId: 1,
          name: 'Daily Backup',
          scheduleType: 'daily',
          storageType: 'local',
          storagePath: '/backups',
        })
        .expect(httpStatus.CREATED);

      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('Daily Backup');
    });

    it('should return 400 if required fields are missing', async () => {
      await request(app)
        .post('/v1/backups/jobs')
        .set('Authorization', 'Bearer validToken')
        .send({
          name: 'Daily Backup',
        })
        .expect(httpStatus.BAD_REQUEST);
    });
  });

  describe('GET /v1/backups/jobs', () => {
    it('should return 200 and list of backup jobs', async () => {
      backupService.getUserBackupJobs = jest.fn().mockResolvedValue([mockBackupJob]);

      const res = await request(app)
        .get('/v1/backups/jobs')
        .set('Authorization', 'Bearer validToken')
        .expect(httpStatus.OK);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
    });
  });

  describe('GET /v1/backups/jobs/:jobId', () => {
    it('should return 200 and backup job object', async () => {
      backupService.getBackupJobById = jest.fn().mockResolvedValue(mockBackupJob);

      const res = await request(app)
        .get('/v1/backups/jobs/1')
        .set('Authorization', 'Bearer validToken')
        .expect(httpStatus.OK);

      expect(res.body).toHaveProperty('id');
      expect(res.body.id).toBe(1);
    });

    it('should return 404 if backup job not found', async () => {
      backupService.getBackupJobById = jest.fn().mockRejectedValue(
        new (require('../../src/utils/ApiError'))(httpStatus.NOT_FOUND, 'Backup job not found')
      );

      await request(app)
        .get('/v1/backups/jobs/999')
        .set('Authorization', 'Bearer validToken')
        .expect(httpStatus.NOT_FOUND);
    });
  });

  describe('PATCH /v1/backups/jobs/:jobId', () => {
    it('should return 200 and updated backup job', async () => {
      const updatedJob = { ...mockBackupJob, name: 'Updated Backup' };
      backupService.updateBackupJob = jest.fn().mockResolvedValue(updatedJob);

      const res = await request(app)
        .patch('/v1/backups/jobs/1')
        .set('Authorization', 'Bearer validToken')
        .send({ name: 'Updated Backup' })
        .expect(httpStatus.OK);

      expect(res.body.name).toBe('Updated Backup');
    });
  });

  describe('DELETE /v1/backups/jobs/:jobId', () => {
    it('should return 204 if backup job is successfully deleted', async () => {
      backupService.deleteBackupJob = jest.fn().mockResolvedValue(mockBackupJob);

      await request(app)
        .delete('/v1/backups/jobs/1')
        .set('Authorization', 'Bearer validToken')
        .expect(httpStatus.NO_CONTENT);
    });
  });

  describe('POST /v1/backups/jobs/:jobId/execute', () => {
    it('should return 200 if backup execution starts successfully', async () => {
      backupService.executeBackup = jest.fn().mockResolvedValue(mockBackupHistory);

      const res = await request(app)
        .post('/v1/backups/jobs/1/execute')
        .set('Authorization', 'Bearer validToken')
        .expect(httpStatus.OK);

      expect(res.body).toHaveProperty('status');
    });
  });

  describe('GET /v1/backups/history', () => {
    it('should return 200 and list of backup history', async () => {
      backupService.getBackupHistory = jest.fn().mockResolvedValue({
        data: [mockBackupHistory],
        total: 1,
        page: 1,
        limit: 10,
      });

      const res = await request(app)
        .get('/v1/backups/history')
        .set('Authorization', 'Bearer validToken')
        .expect(httpStatus.OK);

      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('POST /v1/backups/history/:historyId/restore', () => {
    it('should return 200 if restore starts successfully', async () => {
      backupService.restoreBackup = jest.fn().mockResolvedValue({
        success: true,
        message: 'Restore started',
      });

      const res = await request(app)
        .post('/v1/backups/history/1/restore')
        .set('Authorization', 'Bearer validToken')
        .expect(httpStatus.OK);

      expect(res.body).toHaveProperty('success');
    });
  });

  describe('POST /v1/backups/history/:historyId/verify', () => {
    it('should return 200 and verification result', async () => {
      backupService.verifyBackup = jest.fn().mockResolvedValue({
        overallStatus: 'PASSED',
        checks: [
          { check: 'file_existence', passed: true },
          { check: 'file_size', passed: true },
        ],
      });

      const res = await request(app)
        .post('/v1/backups/history/1/verify')
        .set('Authorization', 'Bearer validToken')
        .send({ level: 'BASIC' })
        .expect(httpStatus.OK);

      expect(res.body).toHaveProperty('overallStatus');
    });
  });

  describe('DELETE /v1/backups/history/:historyId', () => {
    it('should return 204 if backup is successfully deleted', async () => {
      backupService.deleteBackup = jest.fn().mockResolvedValue();

      await request(app)
        .delete('/v1/backups/history/1')
        .set('Authorization', 'Bearer validToken')
        .expect(httpStatus.NO_CONTENT);
    });
  });

  describe('GET /v1/backups/stats', () => {
    it('should return 200 and backup statistics', async () => {
      backupService.getBackupStats = jest.fn().mockResolvedValue({
        totalBackups: 10,
        successfulBackups: 8,
        failedBackups: 2,
        totalSize: 10240000,
      });

      const res = await request(app)
        .get('/v1/backups/stats')
        .set('Authorization', 'Bearer validToken')
        .expect(httpStatus.OK);

      expect(res.body).toHaveProperty('totalBackups');
      expect(res.body.totalBackups).toBe(10);
    });
  });
});
