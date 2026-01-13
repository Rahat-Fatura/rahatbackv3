// Mock dependencies FIRST before any imports
jest.mock('node-cron');
jest.mock('cron-parser');
jest.mock('../../../src/models');
jest.mock('../../../src/services/backup.service');
jest.mock('../../../src/utils/advancedSchedule');
jest.mock('../../../src/config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

// Import after mocks
const scheduleService = require('../../../src/services/schedule.service');
const cron = require('node-cron');
const cronParser = require('cron-parser');
const { backupJobModel } = require('../../../src/models');
const backupService = require('../../../src/services/backup.service');
const advancedSchedule = require('../../../src/utils/advancedSchedule');
const { generateFakeBackupJob } = require('../../utils/testHelpers');

describe('Schedule Service', () => {
  let mockCronTask;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup cron mock
    mockCronTask = {
      stop: jest.fn(),
      start: jest.fn(),
    };

    cron.schedule.mockReturnValue(mockCronTask);
    cron.validate.mockReturnValue(true);

    // Setup cron-parser mock
    const mockInterval = {
      next: jest.fn().mockReturnValue({
        toDate: jest.fn().mockReturnValue(new Date('2025-01-15T12:00:00.000Z')),
      }),
    };

    cronParser.parseExpression.mockReturnValue(mockInterval);

    // Setup advancedSchedule mock
    advancedSchedule.getNextRunTime.mockReturnValue(new Date('2025-01-15T12:00:00.000Z'));
    advancedSchedule.validateScheduleConfig.mockReturnValue({ valid: true });
  });

  describe('getCronExpression', () => {
    it('should return hourly cron expression', () => {
      const result = scheduleService.getCronExpression('hourly');
      expect(result).toBe('0 * * * *');
    });

    it('should return daily cron expression', () => {
      const result = scheduleService.getCronExpression('daily');
      expect(result).toBe('0 2 * * *');
    });

    it('should return weekly cron expression', () => {
      const result = scheduleService.getCronExpression('weekly');
      expect(result).toBe('0 2 * * 0');
    });

    it('should return monthly cron expression', () => {
      const result = scheduleService.getCronExpression('monthly');
      expect(result).toBe('0 2 1 * *');
    });

    it('should return custom cron expression', () => {
      const customCron = '*/15 * * * *';
      const result = scheduleService.getCronExpression('custom', customCron);
      expect(result).toBe(customCron);
    });

    it('should return daily as default for unknown schedule type', () => {
      const result = scheduleService.getCronExpression('unknown');
      expect(result).toBe('0 2 * * *');
    });
  });

  describe('getNextRunTime', () => {
    it('should calculate next run time for daily schedule', () => {
      const result = scheduleService.getNextRunTime('daily');

      expect(cronParser.parseExpression).toHaveBeenCalledWith('0 2 * * *', { tz: 'Europe/Istanbul' });
      expect(result).toEqual(new Date('2025-01-15T12:00:00.000Z'));
    });

    it('should calculate next run time for custom cron', () => {
      const customCron = '*/30 * * * *';
      const result = scheduleService.getNextRunTime('custom', customCron);

      expect(cronParser.parseExpression).toHaveBeenCalledWith(customCron, { tz: 'Europe/Istanbul' });
      expect(result).toEqual(new Date('2025-01-15T12:00:00.000Z'));
    });

    it('should calculate next run time for advanced schedule', () => {
      const config = { type: 'interval', interval: 60 };
      const result = scheduleService.getNextRunTime('advanced', null, config);

      expect(advancedSchedule.getNextRunTime).toHaveBeenCalledWith(config, expect.any(Date));
      expect(result).toEqual(new Date('2025-01-15T12:00:00.000Z'));
    });

    it('should handle advanced schedule with JSON string config', () => {
      const config = JSON.stringify({ type: 'interval', interval: 60 });
      scheduleService.getNextRunTime('advanced', null, config);

      expect(advancedSchedule.getNextRunTime).toHaveBeenCalled();
    });

    it('should use lastRunAt for advanced schedule if provided', () => {
      const config = { type: 'interval', interval: 60 };
      const lastRunAt = new Date('2025-01-14T12:00:00.000Z');

      scheduleService.getNextRunTime('advanced', null, config, lastRunAt);

      expect(advancedSchedule.getNextRunTime).toHaveBeenCalledWith(config, lastRunAt);
    });

    it('should return null if cron expression is not provided for custom schedule', () => {
      const result = scheduleService.getNextRunTime('custom', null);
      expect(result).toBeNull();
    });

    it('should return null and log error on exception', () => {
      cronParser.parseExpression.mockImplementation(() => {
        throw new Error('Invalid cron expression');
      });

      const result = scheduleService.getNextRunTime('daily');
      expect(result).toBeNull();
    });
  });

  describe('validateCronExpression', () => {
    it('should validate correct cron expression', () => {
      cron.validate.mockReturnValue(true);
      const result = scheduleService.validateCronExpression('0 2 * * *');
      expect(cron.validate).toHaveBeenCalledWith('0 2 * * *');
      expect(result).toBe(true);
    });

    it('should invalidate incorrect cron expression', () => {
      cron.validate.mockReturnValue(false);
      const result = scheduleService.validateCronExpression('invalid');
      expect(result).toBe(false);
    });
  });

  describe('startScheduledJob', () => {
    it('should not schedule manual jobs', async () => {
      const manualJob = generateFakeBackupJob({ id: 1, scheduleType: 'manual' });

      await scheduleService.startScheduledJob(manualJob);

      expect(cron.schedule).not.toHaveBeenCalled();
    });

    it('should schedule daily backup job successfully', async () => {
      const dailyJob = generateFakeBackupJob({ id: 1, scheduleType: 'daily' });
      backupJobModel.update.mockResolvedValue(dailyJob);

      await scheduleService.startScheduledJob(dailyJob);

      expect(cron.validate).toHaveBeenCalledWith('0 2 * * *');
      expect(cron.schedule).toHaveBeenCalledWith(
        '0 2 * * *',
        expect.any(Function),
        expect.objectContaining({
          scheduled: true,
          timezone: 'Europe/Istanbul',
        })
      );
      expect(backupJobModel.update).toHaveBeenCalledWith(
        dailyJob.id,
        expect.objectContaining({
          nextRunAt: expect.any(Date),
        })
      );
    });

    it('should not schedule job with invalid cron expression', async () => {
      const invalidJob = generateFakeBackupJob({ id: 1, scheduleType: 'custom', cronExpression: 'invalid' });
      cron.validate.mockReturnValue(false);

      await scheduleService.startScheduledJob(invalidJob);

      expect(cron.schedule).not.toHaveBeenCalled();
    });

    it('should schedule advanced schedule job successfully', async () => {
      const advancedConfig = { type: 'interval', interval: 60 };
      const advancedJob = generateFakeBackupJob({
        id: 1,
        scheduleType: 'advanced',
        advancedScheduleConfig: JSON.stringify(advancedConfig),
      });

      backupJobModel.update.mockResolvedValue(advancedJob);

      await scheduleService.startScheduledJob(advancedJob);

      expect(advancedSchedule.validateScheduleConfig).toHaveBeenCalledWith(advancedConfig);
      expect(cron.schedule).toHaveBeenCalledWith('* * * * *', expect.any(Function), expect.any(Object));
      expect(backupJobModel.update).toHaveBeenCalled();
    });

    it('should not schedule advanced job if config is missing', async () => {
      const advancedJob = generateFakeBackupJob({
        id: 1,
        scheduleType: 'advanced',
        advancedScheduleConfig: null,
      });

      await scheduleService.startScheduledJob(advancedJob);

      expect(cron.schedule).not.toHaveBeenCalled();
    });

    it('should not schedule advanced job if config is invalid', async () => {
      const advancedConfig = { type: 'invalid' };
      const advancedJob = generateFakeBackupJob({
        id: 1,
        scheduleType: 'advanced',
        advancedScheduleConfig: JSON.stringify(advancedConfig),
      });

      advancedSchedule.validateScheduleConfig.mockReturnValue({ valid: false, error: 'Invalid config' });

      await scheduleService.startScheduledJob(advancedJob);

      expect(cron.schedule).not.toHaveBeenCalled();
    });

    it('should handle error when scheduling advanced job', async () => {
      const advancedJob = generateFakeBackupJob({
        id: 1,
        scheduleType: 'advanced',
        advancedScheduleConfig: 'invalid-json',
      });

      await scheduleService.startScheduledJob(advancedJob);

      expect(cron.schedule).not.toHaveBeenCalled();
    });

    it('should execute cron callback for daily job', async () => {
      const dailyJob = generateFakeBackupJob({ id: 1, scheduleType: 'daily' });
      backupJobModel.update.mockResolvedValue(dailyJob);

      await scheduleService.startScheduledJob(dailyJob);

      // Get the cron callback function
      const cronCallback = cron.schedule.mock.calls[0][1];

      // Execute the callback
      await cronCallback();

      expect(backupService.executeBackup).toHaveBeenCalledWith(dailyJob.id);
    });

    it('should handle errors in cron callback execution', async () => {
      const dailyJob = generateFakeBackupJob({ id: 1, scheduleType: 'daily' });
      backupJobModel.update.mockResolvedValue(dailyJob);
      backupService.executeBackup.mockRejectedValue(new Error('Backup failed'));

      await scheduleService.startScheduledJob(dailyJob);

      // Get the cron callback function
      const cronCallback = cron.schedule.mock.calls[0][1];

      // Execute the callback - should not throw
      await expect(cronCallback()).resolves.not.toThrow();
    });
  });

  describe('stopScheduledJob', () => {
    it('should stop scheduled job successfully', async () => {
      // Start a job first to populate activeCronJobs
      const backupJob = generateFakeBackupJob({ id: 1, scheduleType: 'daily' });
      backupJobModel.update.mockResolvedValue(backupJob);

      await scheduleService.startScheduledJob(backupJob);
      scheduleService.stopScheduledJob(1);

      expect(mockCronTask.stop).toHaveBeenCalled();
    });

    it('should handle stopping non-existent job gracefully', () => {
      expect(() => scheduleService.stopScheduledJob(999)).not.toThrow();
    });
  });

  describe('stopAllScheduledJobs', () => {
    it('should stop all scheduled jobs', async () => {
      const job1 = generateFakeBackupJob({ id: 1, scheduleType: 'daily' });
      const job2 = generateFakeBackupJob({ id: 2, scheduleType: 'weekly' });

      backupJobModel.update.mockResolvedValue({});

      await scheduleService.startScheduledJob(job1);
      await scheduleService.startScheduledJob(job2);

      scheduleService.stopAllScheduledJobs();

      expect(mockCronTask.stop).toHaveBeenCalled();
    });
  });

  describe('getScheduledJobsStatus', () => {
    it('should return status of all scheduled jobs', async () => {
      const job1 = generateFakeBackupJob({ id: 1, scheduleType: 'daily' });
      backupJobModel.update.mockResolvedValue({});

      await scheduleService.startScheduledJob(job1);

      const status = scheduleService.getScheduledJobsStatus();

      expect(Array.isArray(status)).toBe(true);
      expect(status.length).toBeGreaterThan(0);
      expect(status[0]).toHaveProperty('jobId');
      expect(status[0]).toHaveProperty('isRunning');
    });

    it('should return empty array if no jobs scheduled', () => {
      scheduleService.stopAllScheduledJobs();
      const status = scheduleService.getScheduledJobsStatus();
      expect(status).toEqual([]);
    });
  });

  describe('restartScheduledJob', () => {
    it('should restart active scheduled job', async () => {
      const backupJob = generateFakeBackupJob({ id: 1, scheduleType: 'daily', isActive: true });
      backupJobModel.findById.mockResolvedValue(backupJob);
      backupJobModel.update.mockResolvedValue(backupJob);

      await scheduleService.restartScheduledJob(1);

      expect(backupJobModel.findById).toHaveBeenCalledWith(1);
      expect(cron.schedule).toHaveBeenCalled();
    });

    it('should not schedule inactive job', async () => {
      const backupJob = generateFakeBackupJob({ id: 1, isActive: false });
      backupJobModel.findById.mockResolvedValue(backupJob);

      await scheduleService.restartScheduledJob(1);

      expect(backupJobModel.findById).toHaveBeenCalledWith(1);
    });

    it('should handle non-existent job gracefully', async () => {
      backupJobModel.findById.mockResolvedValue(null);

      await expect(scheduleService.restartScheduledJob(999)).resolves.not.toThrow();
    });
  });

  describe('initializeScheduledJobs', () => {
    it('should initialize all active jobs', async () => {
      const jobs = [
        generateFakeBackupJob({ id: 1, scheduleType: 'daily', isActive: true }),
        generateFakeBackupJob({ id: 2, scheduleType: 'weekly', isActive: true }),
      ];

      backupJobModel.findActiveJobs.mockResolvedValue(jobs);
      backupJobModel.update.mockResolvedValue({});

      await scheduleService.initializeScheduledJobs();

      expect(backupJobModel.findActiveJobs).toHaveBeenCalled();
      expect(cron.schedule).toHaveBeenCalledTimes(2);
    });

    it('should handle initialization errors gracefully', async () => {
      backupJobModel.findActiveJobs.mockRejectedValue(new Error('Database error'));

      await expect(scheduleService.initializeScheduledJobs()).resolves.not.toThrow();
    });
  });
});
