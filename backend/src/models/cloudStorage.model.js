const { PrismaClient } = require('@prisma/client');
const { awsS3Connector } = require('../utils/cloudStorage');
const crypto = require('crypto');

const prisma = new PrismaClient();

// Encryption key for Google Drive tokens (same as AWS)
const ENCRYPTION_KEY = process.env.AWS_CREDENTIALS_ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-gcm';

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
 * Decrypt S3 credentials and Google Drive tokens if present
 */
const decryptCredentials = (cloudStorage) => {
  if (!cloudStorage) return cloudStorage;

  // Decrypt S3 credentials
  if (cloudStorage.s3EncryptedCredentials) {
    try {
      const decrypted = awsS3Connector.decryptCredentials(JSON.parse(cloudStorage.s3EncryptedCredentials));
      cloudStorage.accessKeyId = decrypted.accessKeyId;
      cloudStorage.secretAccessKey = decrypted.secretAccessKey;
      cloudStorage.region = cloudStorage.s3Region;
      cloudStorage.bucket = cloudStorage.s3Bucket;
      cloudStorage.path = cloudStorage.s3Endpoint || '';
    } catch (error) {
      // If decryption fails, log and continue (might be old format)
      console.error('Failed to decrypt S3 credentials:', error.message);
    }
  }

  // Decrypt Google Drive refresh token
  if (cloudStorage.gdRefreshToken) {
    try {
      // Check if it's encrypted (JSON format with iv, authTag)
      const parsed = JSON.parse(cloudStorage.gdRefreshToken);
      if (parsed.iv && parsed.authTag && parsed.encrypted) {
        const decrypted = decryptGoogleDriveToken(parsed);
        cloudStorage.refreshToken = decrypted;
        cloudStorage.folderId = cloudStorage.gdFolderId;
      } else {
        // Plain text token (old format)
        cloudStorage.refreshToken = cloudStorage.gdRefreshToken;
        cloudStorage.folderId = cloudStorage.gdFolderId;
      }
    } catch (error) {
      // If it's not JSON, assume it's plain text (old format)
      cloudStorage.refreshToken = cloudStorage.gdRefreshToken;
      cloudStorage.folderId = cloudStorage.gdFolderId;
    }
  }

  return cloudStorage;
};

const cloudStorageModel = {
  create: async (data) => {
    return prisma.cloudStorage.create({
      data,
    });
  },

  findById: async (id) => {
    const cloudStorage = await prisma.cloudStorage.findUnique({
      where: { id },
    });
    return decryptCredentials(cloudStorage);
  },

  findByUserId: async (userId, filters = {}) => {
    const where = { userId };

    if (filters.storageType) {
      where.storageType = filters.storageType;
    }

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    const cloudStorages = await prisma.cloudStorage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return cloudStorages.map(decryptCredentials);
  },

  findDefaultByUserId: async (userId, storageType) => {
    const cloudStorage = await prisma.cloudStorage.findFirst({
      where: {
        userId,
        storageType,
        isDefault: true,
        isActive: true,
      },
    });
    return decryptCredentials(cloudStorage);
  },

  update: async (id, data) => {
    return prisma.cloudStorage.update({
      where: { id },
      data,
    });
  },

  delete: async (id) => {
    return prisma.cloudStorage.delete({
      where: { id },
    });
  },

  setAsDefault: async (id, userId, storageType) => {
    // First, unset all defaults for this user and storage type
    await prisma.cloudStorage.updateMany({
      where: {
        userId,
        storageType,
      },
      data: {
        isDefault: false,
      },
    });

    // Then set the specified one as default
    return prisma.cloudStorage.update({
      where: { id },
      data: {
        isDefault: true,
      },
    });
  },

  // Export decryptCredentials utility
  decryptCredentials,
};

module.exports = cloudStorageModel;
