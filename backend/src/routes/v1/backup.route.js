const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const backupController = require('../../controllers/backup.controller');
const { backupValidation } = require('../../validations');

const router = express.Router();

// Backup Jobs
router
  .route('/jobs')
  .post(auth(), validate(backupValidation.createBackupJob), backupController.createBackupJob)
  .get(auth(), validate(backupValidation.getBackupJobs), backupController.getBackupJobs);

router
  .route('/jobs/:jobId')
  .get(auth(), validate(backupValidation.getBackupJob), backupController.getBackupJob)
  .patch(auth(), validate(backupValidation.updateBackupJob), backupController.updateBackupJob)
  .delete(auth(), validate(backupValidation.deleteBackupJob), backupController.deleteBackupJob);

router.post('/jobs/:jobId/run', auth(), validate(backupValidation.runBackupJob), backupController.runBackupJob);

// Backup History
router.route('/history').get(auth(), validate(backupValidation.getBackupHistory), backupController.getBackupHistory);

router
  .route('/history/:historyId')
  .get(auth(), validate(backupValidation.getBackupHistoryById), backupController.getBackupHistoryById)
  .delete(auth(), validate(backupValidation.deleteBackup), backupController.deleteBackup);

router.get(
  '/history/:historyId/download',
  auth(),
  validate(backupValidation.downloadBackup),
  backupController.downloadBackup
);

router.post(
  '/history/:historyId/restore',
  auth(),
  validate(backupValidation.restoreBackup),
  backupController.restoreBackup
);

router.post(
  '/history/:historyId/verify',
  auth(),
  validate(backupValidation.verifyBackup),
  backupController.verifyBackup
);

// Stats
router.get('/stats', auth(), backupController.getBackupStats);

// Scheduled Jobs Status
router.get('/jobs/status/scheduled', auth(), backupController.getScheduledJobsStatus);

module.exports = router;
