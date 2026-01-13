const { S3Client, ListBucketsCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadBucketCommand } = require('@aws-sdk/client-s3');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const logger = require('../../config/logger');
const crypto = require('crypto');

// Encryption for storing credentials securely
// CRITICAL: This key must be set in environment variables and remain constant
// If this key changes, all encrypted credentials will become unreadable
if (!process.env.AWS_CREDENTIALS_ENCRYPTION_KEY) {
  throw new Error(
    'CRITICAL SECURITY ERROR: AWS_CREDENTIALS_ENCRYPTION_KEY environment variable is required!\n' +
    'This key is used to encrypt/decrypt AWS credentials in the database.\n' +
    'Generate a secure key using: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n' +
    'Add it to your .env file: AWS_CREDENTIALS_ENCRYPTION_KEY=your-64-character-hex-key\n' +
    'WARNING: Never change this key after initial setup, or all stored credentials will be lost!'
  );
}

// Validate key format (must be 64 hex characters = 32 bytes)
if (!/^[0-9a-fA-F]{64}$/.test(process.env.AWS_CREDENTIALS_ENCRYPTION_KEY)) {
  throw new Error(
    'INVALID AWS_CREDENTIALS_ENCRYPTION_KEY: Must be exactly 64 hexadecimal characters.\n' +
    'Generate a valid key using: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n' +
    'Current key length: ' + (process.env.AWS_CREDENTIALS_ENCRYPTION_KEY?.length || 0)
  );
}

const ENCRYPTION_KEY = process.env.AWS_CREDENTIALS_ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-gcm';

/**
 * Validate S3 endpoint URL format
 */
const validateS3Endpoint = (endpoint) => {
  if (!endpoint) return { valid: true }; // Endpoint is optional

  try {
    const url = new URL(endpoint);

    // Must be HTTP or HTTPS
    if (!['http:', 'https:'].includes(url.protocol)) {
      return {
        valid: false,
        error: 'S3 endpoint must use HTTP or HTTPS protocol'
      };
    }

    // Must have a hostname
    if (!url.hostname) {
      return {
        valid: false,
        error: 'S3 endpoint must include a valid hostname'
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `Invalid S3 endpoint URL format: ${error.message}`
    };
  }
};

/**
 * Encrypt AWS credentials
 */
const encryptCredentials = (accessKeyId, secretAccessKey) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex'), iv);

  const data = JSON.stringify({ accessKeyId, secretAccessKey });
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return {
    encrypted: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
};

/**
 * Decrypt AWS credentials
 */
const decryptCredentials = (encryptedData) => {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex'),
    Buffer.from(encryptedData.iv, 'hex')
  );

  decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));

  let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return JSON.parse(decrypted);
};

/**
 * Create S3 client
 */
const createS3Client = (config) => {
  // Validate endpoint if provided
  if (config.s3Endpoint) {
    const validation = validateS3Endpoint(config.s3Endpoint);
    if (!validation.valid) {
      throw new Error(validation.error);
    }
  }

  let credentials;

  // If encrypted credentials exist, decrypt them
  if (config.s3EncryptedCredentials) {
    try {
      const decrypted = decryptCredentials(JSON.parse(config.s3EncryptedCredentials));
      logger.info(`Decrypted credentials - AccessKey: ${decrypted.accessKeyId?.substring(0, 8)}... (len: ${decrypted.accessKeyId?.length}), SecretKey length: ${decrypted.secretAccessKey?.length}`);
      credentials = {
        accessKeyId: decrypted.accessKeyId,
        secretAccessKey: decrypted.secretAccessKey,
      };
    } catch (error) {
      logger.error('Failed to decrypt S3 credentials:', error.message);
      throw new Error('Failed to decrypt credentials: ' + error.message);
    }
  } else {
    // Fallback to plain credentials (backward compatibility)
    credentials = {
      accessKeyId: config.s3AccessKeyId,
      secretAccessKey: config.s3SecretAccessKey,
    };
  }

  const clientConfig = {
    region: config.s3Region,
    credentials,
  };

  // Custom endpoint for S3-compatible services (MinIO, DigitalOcean Spaces, etc.)
  if (config.s3Endpoint) {
    clientConfig.endpoint = config.s3Endpoint;
    clientConfig.forcePathStyle = true; // Required for MinIO and some S3-compatible services
  }

  return new S3Client(clientConfig);
};

/**
 * Test S3 connection by listing buckets or checking bucket access
 */
const testConnection = async (config) => {
  try {
    const client = createS3Client(config);

    // Try to check if the specified bucket exists
    if (config.s3Bucket) {
      const command = new HeadBucketCommand({ Bucket: config.s3Bucket });
      await client.send(command);

      return {
        success: true,
        message: `Successfully connected to bucket: ${config.s3Bucket}`,
        bucket: config.s3Bucket,
        region: config.s3Region,
      };
    } else {
      // If no bucket specified, list available buckets
      const command = new ListBucketsCommand({});
      const response = await client.send(command);

      return {
        success: true,
        message: 'Connection successful',
        bucketsCount: response.Buckets?.length || 0,
      };
    }
  } catch (error) {
    logger.error(`S3 connection test failed: ${error.message}`);
    return {
      success: false,
      message: error.message,
    };
  }
};

/**
 * List available buckets (for initial setup)
 */
const listBuckets = async (accessKeyId, secretAccessKey, region = 'us-east-1', endpoint = null) => {
  try {
    // Validate endpoint if provided
    if (endpoint) {
      const validation = validateS3Endpoint(endpoint);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
        };
      }
    }

    const clientConfig = {
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    };

    if (endpoint) {
      clientConfig.endpoint = endpoint;
      clientConfig.forcePathStyle = true;
    }

    const client = new S3Client(clientConfig);
    const command = new ListBucketsCommand({});
    const response = await client.send(command);

    return {
      success: true,
      buckets: response.Buckets?.map(b => ({
        name: b.Name,
        creationDate: b.CreationDate,
      })) || [],
    };
  } catch (error) {
    logger.error(`Failed to list S3 buckets: ${error.message}`);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Upload backup file to S3
 */
const uploadBackup = async (config, filePath, remoteFileName) => {
  try {
    const client = createS3Client(config);
    const stats = await fs.stat(filePath);
    const fileStream = fsSync.createReadStream(filePath);

    const startTime = Date.now();

    const command = new PutObjectCommand({
      Bucket: config.s3Bucket,
      Key: remoteFileName,
      Body: fileStream,
      ContentType: 'application/octet-stream',
    });

    const response = await client.send(command);
    const duration = Math.floor((Date.now() - startTime) / 1000);

    logger.info(`Successfully uploaded backup to S3: ${remoteFileName}`);

    return {
      success: true,
      fileName: remoteFileName,
      s3Key: remoteFileName, // S3 key for download/delete operations
      fileSize: stats.size,
      duration,
      etag: response.ETag,
    };
  } catch (error) {
    logger.error(`Failed to upload backup to S3: ${error.message}`);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Download backup file from S3
 */
const downloadBackup = async (config, remoteFileName, localFilePath) => {
  try {
    const client = createS3Client(config);
    const startTime = Date.now();

    const command = new GetObjectCommand({
      Bucket: config.s3Bucket,
      Key: remoteFileName,
    });

    const response = await client.send(command);
    const writeStream = fsSync.createWriteStream(localFilePath);

    await new Promise((resolve, reject) => {
      response.Body.pipe(writeStream)
        .on('finish', () => {
          logger.info(`Successfully downloaded backup from S3: ${remoteFileName}`);
          resolve();
        })
        .on('error', (err) => {
          logger.error(`Error downloading backup from S3: ${err.message}`);
          reject(err);
        });
    });

    const duration = Math.floor((Date.now() - startTime) / 1000);
    const stats = await fs.stat(localFilePath);

    return {
      success: true,
      filePath: localFilePath,
      fileSize: stats.size,
      duration,
    };
  } catch (error) {
    logger.error(`Failed to download backup from S3: ${error.message}`);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Delete backup file from S3
 */
const deleteBackup = async (config, remoteFileName) => {
  try {
    const client = createS3Client(config);

    const command = new DeleteObjectCommand({
      Bucket: config.s3Bucket,
      Key: remoteFileName,
    });

    await client.send(command);
    logger.info(`Successfully deleted backup from S3: ${remoteFileName}`);

    return {
      success: true,
      message: 'Backup deleted successfully',
    };
  } catch (error) {
    logger.error(`Failed to delete backup from S3: ${error.message}`);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * List backups in S3 bucket
 */
const listBackups = async (config) => {
  try {
    const client = createS3Client(config);

    const command = new ListObjectsV2Command({
      Bucket: config.s3Bucket,
      MaxKeys: 1000,
    });

    const response = await client.send(command);

    const backups = (response.Contents || []).map((obj) => ({
      key: obj.Key,
      name: path.basename(obj.Key),
      size: obj.Size,
      lastModified: obj.LastModified,
      etag: obj.ETag,
    }));

    return {
      success: true,
      backups,
      count: backups.length,
    };
  } catch (error) {
    logger.error(`Failed to list backups from S3: ${error.message}`);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Verify AWS credentials and return encrypted credentials data
 * This is called during the OAuth-like flow
 */
const verifyAndEncryptCredentials = async (accessKeyId, secretAccessKey, region, endpoint = null) => {
  try {
    // First, test the credentials
    const testResult = await listBuckets(accessKeyId, secretAccessKey, region, endpoint);

    if (!testResult.success) {
      return {
        success: false,
        error: testResult.error,
      };
    }

    // Encrypt the credentials
    const encrypted = encryptCredentials(accessKeyId, secretAccessKey);

    return {
      success: true,
      encryptedCredentials: JSON.stringify(encrypted),
      buckets: testResult.buckets,
    };
  } catch (error) {
    logger.error(`Failed to verify and encrypt AWS credentials: ${error.message}`);
    return {
      success: false,
      error: error.message,
    };
  }
};

module.exports = {
  testConnection,
  uploadBackup,
  downloadBackup,
  deleteBackup,
  listBackups,
  listBuckets,
  verifyAndEncryptCredentials,
  encryptCredentials,
  decryptCredentials,
};
