const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { databaseService } = require('../services');

const createDatabase = catchAsync(async (req, res) => {
  const database = await databaseService.createDatabase(req.user.id, req.body);
  res.status(httpStatus.CREATED).send(database);
});

const getDatabases = catchAsync(async (req, res) => {
  const filters = {
    type: req.query.type,
    isActive: req.query.isActive,
  };
  const databases = await databaseService.getUserDatabases(req.user.id, filters);
  res.send(databases);
});

const getDatabase = catchAsync(async (req, res) => {
  const database = await databaseService.getDatabaseById(parseInt(req.params.databaseId), req.user.id);
  res.send(database);
});

const updateDatabase = catchAsync(async (req, res) => {
  const database = await databaseService.updateDatabase(parseInt(req.params.databaseId), req.user.id, req.body);
  res.send(database);
});

const deleteDatabase = catchAsync(async (req, res) => {
  await databaseService.deleteDatabase(parseInt(req.params.databaseId), req.user.id);
  res.status(httpStatus.NO_CONTENT).send();
});

const testConnection = catchAsync(async (req, res) => {
  const result = await databaseService.testDatabaseConnection(parseInt(req.params.databaseId), req.user.id);
  res.send(result);
});

const testConnectionWithCredentials = catchAsync(async (req, res) => {
  const result = await databaseService.testConnectionWithCredentials(req.body, req.user.id);
  res.send(result);
});

const getDatabaseSize = catchAsync(async (req, res) => {
  const result = await databaseService.getDatabaseSize(parseInt(req.params.databaseId), req.user.id);
  res.send(result);
});

module.exports = {
  createDatabase,
  getDatabases,
  getDatabase,
  updateDatabase,
  deleteDatabase,
  testConnection,
  testConnectionWithCredentials,
  getDatabaseSize,
};
