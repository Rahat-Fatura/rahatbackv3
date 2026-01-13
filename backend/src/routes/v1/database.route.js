const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const databaseController = require('../../controllers/database.controller');
const { databaseValidation } = require('../../validations');

const router = express.Router();

router
  .route('/')
  .post(auth(), validate(databaseValidation.createDatabase), databaseController.createDatabase)
  .get(auth(), validate(databaseValidation.getDatabases), databaseController.getDatabases);

router.post(
  '/test-connection',
  auth(),
  validate(databaseValidation.testConnectionWithCredentials),
  databaseController.testConnectionWithCredentials
);

router
  .route('/:databaseId')
  .get(auth(), validate(databaseValidation.getDatabase), databaseController.getDatabase)
  .patch(auth(), validate(databaseValidation.updateDatabase), databaseController.updateDatabase)
  .delete(auth(), validate(databaseValidation.deleteDatabase), databaseController.deleteDatabase);

router.post('/:databaseId/test', auth(), validate(databaseValidation.testConnection), databaseController.testConnection);
router.get('/:databaseId/size', auth(), validate(databaseValidation.getDatabaseSize), databaseController.getDatabaseSize);

module.exports = router;
