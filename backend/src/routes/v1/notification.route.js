const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const notificationController = require('../../controllers/notification.controller');
const { notificationValidation } = require('../../validations');

const router = express.Router();

router
  .route('/')
  .get(auth(), validate(notificationValidation.getSettings), notificationController.getSettings)
  .patch(auth(), validate(notificationValidation.updateSettings), notificationController.updateSettings);

router.post('/test-email', auth(), validate(notificationValidation.testEmail), notificationController.testEmail);

module.exports = router;
