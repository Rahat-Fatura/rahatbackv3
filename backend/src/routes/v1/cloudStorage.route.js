const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const cloudStorageController = require('../../controllers/cloudStorage.controller');
const { cloudStorageValidation } = require('../../validations');

const router = express.Router();

// Google Drive OAuth routes (no auth required for OAuth flow)
router.get('/google-drive/auth-url', cloudStorageController.getGoogleDriveAuthUrl);
router.get('/google-drive/callback', cloudStorageController.googleDriveCallback);

// Cloud storage CRUD routes
router
  .route('/')
  .post(auth(), validate(cloudStorageValidation.createCloudStorage), cloudStorageController.createCloudStorage)
  .get(auth(), validate(cloudStorageValidation.getCloudStorages), cloudStorageController.getCloudStorages);

router
  .route('/:id')
  .get(auth(), validate(cloudStorageValidation.getCloudStorage), cloudStorageController.getCloudStorage)
  .patch(auth(), validate(cloudStorageValidation.updateCloudStorage), cloudStorageController.updateCloudStorage)
  .delete(auth(), validate(cloudStorageValidation.deleteCloudStorage), cloudStorageController.deleteCloudStorage);

// Cloud storage operations
router.post('/:id/test', auth(), validate(cloudStorageValidation.testConnection), cloudStorageController.testConnection);
router.post(
  '/:id/set-default',
  auth(),
  validate(cloudStorageValidation.setAsDefault),
  cloudStorageController.setAsDefault
);
router.get('/:id/files', auth(), validate(cloudStorageValidation.listFiles), cloudStorageController.listFiles);

module.exports = router;
