const httpStatus = require('http-status');
const { databaseModel } = require('../models');
const { getConnector } = require('../utils/dbConnectors');
const ApiError = require('../utils/ApiError');
const crypto = require('crypto');

// Encryption key - should be in environment variables
const ENCRYPTION_KEY = process.env.DB_ENCRYPTION_KEY || 'your-32-character-secret-key!!';
const ALGORITHM = 'aes-256-cbc';

/**
 * Encrypt database password
 */
const encryptPassword = (password) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)), iv);
  let encrypted = cipher.update(password);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
};

/**
 * Decrypt database password
 */
const decryptPassword = (encryptedPassword) => {
  const parts = encryptedPassword.split(':');
  const iv = Buffer.from(parts.shift(), 'hex');
  const encrypted = Buffer.from(parts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)), iv);
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
};

/**
 * Create a new database connection
 */
const createDatabase = async (userId, databaseData) => {
  // Encrypt password before storing
  const encryptedPassword = encryptPassword(databaseData.password);

  // Auto-assign to user's active agent
  // Agent MUST be online (real WebSocket connection) to add a database
  let agentId = databaseData.agentId;

  if (!agentId) {
    const { agentModel } = require('../models');
    const { websocketService } = require('./index');

    // Get user's agents from DB
    const userAgents = await agentModel.findByUserId(userId, { isActive: true });

    // Find one that's actually connected via WebSocket
    const onlineAgent = userAgents.find((agent) => websocketService.isAgentOnline(agent.agentId));

    if (onlineAgent) {
      agentId = onlineAgent.id;
      console.log(`Auto-assigned database to agent: ${onlineAgent.deviceName} (ID: ${agentId})`);
    } else {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Aktif bir agent bulunamadı. Lütfen önce desktop agent uygulamasını başlatın.'
      );
    }
  }

  const database = await databaseModel.create({
    ...databaseData,
    userId,
    agentId, // Auto-assigned or provided
    password: encryptedPassword,
  });

  // Remove password from response
  const { password, ...databaseWithoutPassword } = database;
  return databaseWithoutPassword;
};

/**
 * Get database by ID
 */
const getDatabaseById = async (id, userId) => {
  const database = await databaseModel.findById(id);
  if (!database) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Database not found');
  }
  if (database.userId !== userId) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied');
  }

  // Remove password from response
  const { password, ...databaseWithoutPassword } = database;
  return databaseWithoutPassword;
};

/**
 * Get all databases for a user
 */
const getUserDatabases = async (userId, filters = {}) => {
  const databases = await databaseModel.findByUserId(userId, filters);

  // Remove passwords from all databases
  return databases.map(({ password, ...db }) => db);
};

/**
 * Update database
 */
const updateDatabase = async (id, userId, updateData) => {
  const database = await getDatabaseById(id, userId);

  // Encrypt password if it's being updated
  if (updateData.password) {
    updateData.password = encryptPassword(updateData.password);
  }

  const updatedDatabase = await databaseModel.update(id, updateData);

  // Remove password from response
  const { password, ...databaseWithoutPassword } = updatedDatabase;
  return databaseWithoutPassword;
};

/**
 * Delete database
 */
const deleteDatabase = async (id, userId) => {
  const database = await getDatabaseById(id, userId);
  await databaseModel.delete(id);
  return database;
};

/**
 * Test database connection
 * IMPORTANT: This sends test request to Agent, not backend!
 */
const testDatabaseConnection = async (id, userId) => {
  const database = await databaseModel.findById(id);
  if (!database) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Database not found');
  }
  if (database.userId !== userId) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied');
  }

  try {
    // Decrypt password for connection test
    const decryptedPassword = decryptPassword(database.password);

    const config = {
      type: database.type,
      host: database.host,
      port: database.port,
      username: database.username,
      password: decryptedPassword,
      database: database.database,
      connectionString: database.connectionString,
      sslEnabled: database.sslEnabled,
    };

    // Find user's online agent
    const { agentModel } = require('../models');
    const { websocketService } = require('./index');

    const onlineAgent = await agentModel.findFirstOnlineByUserId(userId);

    let result;

    if (!onlineAgent) {
      // No agent online - fallback to backend test (for cloud mode)
      const connector = getConnector(database.type);
      result = await connector.testConnection(config);
    } else {
      // Send test request to agent
      result = await websocketService.sendDatabaseTestToAgent(onlineAgent.agentId, config);
    }

    if (result.success) {
      // Update lastTestedAt timestamp
      await databaseModel.updateLastTested(id);
    }

    return result;
  } catch (error) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Connection test failed: ${error.message}`);
  }
};

/**
 * Test database connection with raw credentials (before saving)
 * IMPORTANT: This sends test request to Agent, not backend!
 */
const testConnectionWithCredentials = async (databaseData, userId) => {
  try {
    const config = {
      type: databaseData.type,
      host: databaseData.host,
      port: databaseData.port,
      username: databaseData.username,
      password: databaseData.password,
      database: databaseData.database,
      connectionString: databaseData.connectionString,
      sslEnabled: databaseData.sslEnabled || false,
    };

    // Find user's online agent
    const { agentModel } = require('../models');
    const { websocketService } = require('./index');

    const onlineAgent = await agentModel.findFirstOnlineByUserId(userId);

    if (!onlineAgent) {
      // No agent online - fallback to backend test (for cloud mode)
      const connector = getConnector(databaseData.type);
      const result = await connector.testConnection(config);
      return result;
    }

    // Send test request to agent
    const result = await websocketService.sendDatabaseTestToAgent(onlineAgent.agentId, config);

    return result;
  } catch (error) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Connection test failed: ${error.message}`);
  }
};

/**
 * Get database size
 */
const getDatabaseSize = async (id, userId) => {
  const database = await databaseModel.findById(id);
  if (!database) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Database not found');
  }
  if (database.userId !== userId) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied');
  }

  try {
    const decryptedPassword = decryptPassword(database.password);

    const config = {
      host: database.host,
      port: database.port,
      username: database.username,
      password: decryptedPassword,
      database: database.database,
      connectionString: database.connectionString,
      sslEnabled: database.sslEnabled,
    };

    const connector = getConnector(database.type);
    const result = await connector.getDatabaseSize(config);

    return result;
  } catch (error) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Failed to get database size: ${error.message}`);
  }
};

/**
 * Get database config with decrypted password (internal use only)
 */
const getDatabaseConfig = async (databaseId) => {
  const database = await databaseModel.findById(databaseId);
  if (!database) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Database not found');
  }

  return {
    ...database,
    password: decryptPassword(database.password),
  };
};

module.exports = {
  createDatabase,
  getDatabaseById,
  getUserDatabases,
  updateDatabase,
  deleteDatabase,
  testDatabaseConnection,
  testConnectionWithCredentials,
  getDatabaseSize,
  getDatabaseConfig,
};
