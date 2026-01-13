const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const logger = require('../../config/logger');

/**
 * Create S3 client instance
 */
const createS3Client = (config) => {
  const clientConfig = {
    region: config.s3Region,
    credentials: {
      accessKeyId: config.s3AccessKeyId,
      secretAccessKey: config.s3SecretAccessKey,
    },
  };

  // Support custom endpoint for S3-compatible services (MinIO, DigitalOcean Spaces, etc.)
  if (config.s3Endpoint) {
    clientConfig.endpoint = config.s3Endpoint;
    clientConfig.forcePathStyle = true; // Required for MinIO and similar services
  }

  return new S3Client(clientConfig);
};

/**
 * Test S3 connection
 */
const testConnection = async (config) => {
  try {
    const client = createS3Client(config);

    // Try to list objects in the bucket (with max 1 item to minimize data transfer)
    const command = new ListObjectsV2Command({
      Bucket: config.s3Bucket,
      MaxKeys: 1,
    });

    await client.send(command);

    return {
      success: true,
      message: 'Connection successful',
    };
  } catch (error) {
    return {
      success: false,
      message: error.message,
    };
  }
};

/**
 * Upload backup file to S3
 */
const uploadBackup = async (config, filePath, remoteFileName) => {
  try {
    const client = createS3Client(config);

    // Read file
    const fileContent = await fs.readFile(filePath);
    const stats = await fs.stat(filePath);

    // Prepare S3 key (path in bucket)
    const s3Key = `backups/${remoteFileName}`;

    // Upload to S3
    const command = new PutObjectCommand({
      Bucket: config.s3Bucket,
      Key: s3Key,
      Body: fileContent,
      ContentType: 'application/octet-stream',
      Metadata: {
        'original-filename': path.basename(filePath),
        'upload-date': new Date().toISOString(),
      },
    });

    const startTime = Date.now();
    await client.send(command);
    const duration = Math.floor((Date.now() - startTime) / 1000);

    logger.info(`Successfully uploaded backup to S3: ${s3Key}`);

    return {
      success: true,
      s3Key,
      bucket: config.s3Bucket,
      fileSize: stats.size,
      duration,
      url: `s3://${config.s3Bucket}/${s3Key}`,
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
const downloadBackup = async (config, s3Key, localFilePath) => {
  try {
    const client = createS3Client(config);

    const command = new GetObjectCommand({
      Bucket: config.s3Bucket,
      Key: s3Key,
    });

    const startTime = Date.now();
    const response = await client.send(command);

    // Stream to file
    const writeStream = fsSync.createWriteStream(localFilePath);

    await new Promise((resolve, reject) => {
      response.Body.pipe(writeStream);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    const duration = Math.floor((Date.now() - startTime) / 1000);
    const stats = await fs.stat(localFilePath);

    logger.info(`Successfully downloaded backup from S3: ${s3Key}`);

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
const deleteBackup = async (config, s3Key) => {
  try {
    const client = createS3Client(config);

    const command = new DeleteObjectCommand({
      Bucket: config.s3Bucket,
      Key: s3Key,
    });

    await client.send(command);

    logger.info(`Successfully deleted backup from S3: ${s3Key}`);

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
const listBackups = async (config, prefix = 'backups/') => {
  try {
    const client = createS3Client(config);

    const command = new ListObjectsV2Command({
      Bucket: config.s3Bucket,
      Prefix: prefix,
    });

    const response = await client.send(command);

    const backups = (response.Contents || []).map((item) => ({
      key: item.Key,
      size: item.Size,
      lastModified: item.LastModified,
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

module.exports = {
  testConnection,
  uploadBackup,
  downloadBackup,
  deleteBackup,
  listBackups,
};
