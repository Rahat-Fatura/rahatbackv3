const httpStatus = require('http-status');
const { cloudStorageModel } = require('../models');
const { getCloudStorageConnector, awsS3Connector, googleDriveConnector } = require('../utils/cloudStorage');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const crypto = require('crypto');

// Encryption key for Google Drive tokens (same as AWS)
const ENCRYPTION_KEY = process.env.AWS_CREDENTIALS_ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-gcm';

/**
 * Encrypt Google Drive refresh token
 */
const encryptGoogleDriveToken = (refreshToken) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex'), iv);

  let encrypted = cipher.update(refreshToken, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return {
    encrypted: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
};

/**
 * Decrypt Google Drive refresh token
 */
const decryptGoogleDriveToken = (encryptedData) => {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex'),
    Buffer.from(encryptedData.iv, 'hex')
  );

  decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));

  let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
};

/**
 * Create cloud storage configuration
 */
const createCloudStorage = async (userId, storageData) => {
  // If this is set as default, unset other defaults
  if (storageData.isDefault) {
    await cloudStorageModel.setAsDefault(null, userId, storageData.storageType);
  }

  // Encrypt AWS S3 credentials if provided
  if (storageData.storageType === 's3' && storageData.s3AccessKeyId && storageData.s3SecretAccessKey) {
    // Trim credentials to remove any whitespace/newline characters
    const accessKeyId = storageData.s3AccessKeyId.trim();
    const secretAccessKey = storageData.s3SecretAccessKey.trim();

    logger.info(`Encrypting AWS credentials - AccessKey: ${accessKeyId.substring(0, 8)}... (len: ${accessKeyId.length}), SecretKey length: ${secretAccessKey.length}`);

    const encrypted = awsS3Connector.encryptCredentials(
      accessKeyId,
      secretAccessKey
    );

    storageData.s3EncryptedCredentials = JSON.stringify(encrypted);
    // Clear plain text credentials
    delete storageData.s3AccessKeyId;
    delete storageData.s3SecretAccessKey;
  }

  // Encrypt Google Drive refresh token if provided
  if (storageData.storageType === 'google_drive' && storageData.gdRefreshToken) {
    const refreshToken = storageData.gdRefreshToken.trim();

    logger.info(`Encrypting Google Drive refresh token (length: ${refreshToken.length})`);

    const encrypted = encryptGoogleDriveToken(refreshToken);
    storageData.gdRefreshToken = JSON.stringify(encrypted);
  }

  const cloudStorage = await cloudStorageModel.create({
    ...storageData,
    userId,
  });

  return cloudStorage;
};

/**
 * Get cloud storage by ID
 */
const getCloudStorageById = async (id, userId) => {
  const cloudStorage = await cloudStorageModel.findById(id);
  if (!cloudStorage) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Cloud storage configuration not found');
  }
  if (cloudStorage.userId !== userId) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied');
  }
  return cloudStorage;
};

/**
 * Get all cloud storage configurations for a user
 */
const getUserCloudStorages = async (userId, filters = {}) => {
  return await cloudStorageModel.findByUserId(userId, filters);
};

/**
 * Update cloud storage configuration
 */
const updateCloudStorage = async (id, userId, updateData) => {
  const cloudStorage = await getCloudStorageById(id, userId);

  // If setting as default, unset other defaults
  if (updateData.isDefault && !cloudStorage.isDefault) {
    await cloudStorageModel.setAsDefault(id, userId, cloudStorage.storageType);
  }

  // Encrypt AWS S3 credentials if provided
  if (updateData.storageType === 's3' && updateData.s3AccessKeyId && updateData.s3SecretAccessKey) {
    // Trim credentials to remove any whitespace/newline characters
    const accessKeyId = updateData.s3AccessKeyId.trim();
    const secretAccessKey = updateData.s3SecretAccessKey.trim();

    logger.info(`Encrypting AWS credentials - AccessKey: ${accessKeyId.substring(0, 8)}... (len: ${accessKeyId.length}), SecretKey length: ${secretAccessKey.length}`);

    const encrypted = awsS3Connector.encryptCredentials(
      accessKeyId,
      secretAccessKey
    );

    updateData.s3EncryptedCredentials = JSON.stringify(encrypted);
    // Clear plain text credentials
    delete updateData.s3AccessKeyId;
    delete updateData.s3SecretAccessKey;
  }

  // Encrypt Google Drive refresh token if provided
  if (updateData.storageType === 'google_drive' && updateData.gdRefreshToken) {
    const refreshToken = updateData.gdRefreshToken.trim();

    logger.info(`Encrypting Google Drive refresh token (length: ${refreshToken.length})`);

    const encrypted = encryptGoogleDriveToken(refreshToken);
    updateData.gdRefreshToken = JSON.stringify(encrypted);
  }

  return await cloudStorageModel.update(id, updateData);
};

/**
 * Delete cloud storage configuration
 */
const deleteCloudStorage = async (id, userId) => {
  await getCloudStorageById(id, userId);
  return await cloudStorageModel.delete(id);
};

/**
 * Test cloud storage connection
 */
const testConnection = async (id, userId) => {
  const cloudStorage = await getCloudStorageById(id, userId);
  const connector = getCloudStorageConnector(cloudStorage.storageType);

  try {
    const result = await connector.testConnection(cloudStorage);
    return result;
  } catch (error) {
    logger.error(`Cloud storage test failed: ${error.message}`);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Connection test failed: ${error.message}`);
  }
};

/**
 * Set cloud storage as default
 */
const setAsDefault = async (id, userId) => {
  const cloudStorage = await getCloudStorageById(id, userId);
  return await cloudStorageModel.setAsDefault(id, userId, cloudStorage.storageType);
};

/**
 * Get default cloud storage for a user and storage type
 */
const getDefaultCloudStorage = async (userId, storageType) => {
  return await cloudStorageModel.findDefaultByUserId(userId, storageType);
};

/**
 * List files in cloud storage
 */
const listFiles = async (id, userId) => {
  const cloudStorage = await getCloudStorageById(id, userId);
  const connector = getCloudStorageConnector(cloudStorage.storageType);

  try {
    const result = await connector.listBackups(cloudStorage);
    return result;
  } catch (error) {
    logger.error(`Failed to list cloud storage files: ${error.message}`);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Failed to list files: ${error.message}`);
  }
};

module.exports = {
  createCloudStorage,
  getCloudStorageById,
  getUserCloudStorages,
  updateCloudStorage,
  deleteCloudStorage,
  testConnection,
  setAsDefault,
  getDefaultCloudStorage,
  listFiles,
};
