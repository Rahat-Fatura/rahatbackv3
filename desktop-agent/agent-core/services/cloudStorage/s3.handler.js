const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const logger = require('../../config/logger');

/**
 * AWS S3 Storage Handler
 */

/**
 * Upload file to S3
 * @param {Object} s3Config - S3 configuration
 * @param {string} filePath - Local file path
 * @param {string} s3Key - S3 object key (path in bucket)
 * @param {Function} progressCallback - Progress callback function
 * @returns {Promise<Object>} - Upload result
 */
const uploadFile = async (s3Config, filePath, s3Key, progressCallback = null) => {
  const { accessKeyId, secretAccessKey, region, bucket } = s3Config;

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  // Create S3 client
  const s3Client = new S3Client({
    region: region || 'us-east-1',
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  try {
    // Read file
    const fileContent = fs.readFileSync(filePath);
    const fileStats = fs.statSync(filePath);
    const fileSizeInMB = (fileStats.size / (1024 * 1024)).toFixed(2);

    logger.info(`Uploading file to S3: ${s3Key} (${fileSizeInMB} MB)`);

    // Upload to S3
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: fileContent,
      ContentType: getContentType(filePath),
    });

    // Note: AWS SDK v3 doesn't have built-in progress events for PutObjectCommand
    // For large files, consider using @aws-sdk/lib-storage Upload class
    const response = await s3Client.send(command);

    logger.info(`File uploaded to S3 successfully: ${s3Key}`);

    if (progressCallback) {
      progressCallback(100); // Mark as complete
    }

    return {
      success: true,
      bucket,
      key: s3Key,
      size: fileStats.size,
      sizeMB: fileSizeInMB,
      etag: response.ETag,
      url: `https://${bucket}.s3.${region}.amazonaws.com/${s3Key}`,
    };
  } catch (error) {
    logger.error(`S3 upload failed: ${error.message}`);
    throw error;
  }
};

/**
 * Upload file to S3 with progress tracking (for large files)
 * @param {Object} s3Config - S3 configuration
 * @param {string} filePath - Local file path
 * @param {string} s3Key - S3 object key
 * @param {Function} progressCallback - Progress callback
 * @returns {Promise<Object>} - Upload result
 */
const uploadFileWithProgress = async (s3Config, filePath, s3Key, progressCallback = null) => {
  const { Upload } = require('@aws-sdk/lib-storage');
  const { accessKeyId, secretAccessKey, region, bucket } = s3Config;

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const s3Client = new S3Client({
    region: region || 'us-east-1',
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  try {
    const fileStream = fs.createReadStream(filePath);
    const fileStats = fs.statSync(filePath);
    const fileSizeInMB = (fileStats.size / (1024 * 1024)).toFixed(2);

    logger.info(`Uploading file to S3 (with progress): ${s3Key} (${fileSizeInMB} MB)`);

    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: bucket,
        Key: s3Key,
        Body: fileStream,
        ContentType: getContentType(filePath),
      },
    });

    // Track progress
    upload.on('httpUploadProgress', (progress) => {
      const percentage = Math.round((progress.loaded / progress.total) * 100);
      logger.debug(`Upload progress: ${percentage}%`);

      if (progressCallback) {
        progressCallback(percentage);
      }
    });

    const response = await upload.done();

    logger.info(`File uploaded to S3 successfully: ${s3Key}`);

    return {
      success: true,
      bucket,
      key: s3Key,
      size: fileStats.size,
      sizeMB: fileSizeInMB,
      etag: response.ETag,
      url: `https://${bucket}.s3.${region}.amazonaws.com/${s3Key}`,
    };
  } catch (error) {
    logger.error(`S3 upload with progress failed: ${error.message}`);
    throw error;
  }
};

/**
 * Download file from S3
 * @param {Object} s3Config - S3 configuration
 * @param {string} s3Key - S3 object key
 * @param {string} downloadPath - Local download path
 * @returns {Promise<Object>} - Download result
 */
const downloadFile = async (s3Config, s3Key, downloadPath) => {
  const { accessKeyId, secretAccessKey, region, bucket } = s3Config;

  const s3Client = new S3Client({
    region: region || 'us-east-1',
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  try {
    logger.info(`Downloading file from S3: ${s3Key}`);

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: s3Key,
    });

    const response = await s3Client.send(command);

    // Ensure download directory exists
    const downloadDir = path.dirname(downloadPath);
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }

    // Write to file
    const fileStream = fs.createWriteStream(downloadPath);
    await new Promise((resolve, reject) => {
      response.Body.pipe(fileStream);
      response.Body.on('error', reject);
      fileStream.on('finish', resolve);
    });

    const stats = fs.statSync(downloadPath);
    const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);

    logger.info(`File downloaded from S3 successfully: ${s3Key} (${fileSizeInMB} MB)`);

    return {
      success: true,
      filePath: downloadPath,
      size: stats.size,
      sizeMB: fileSizeInMB,
    };
  } catch (error) {
    logger.error(`S3 download failed: ${error.message}`);
    throw error;
  }
};

/**
 * Delete file from S3
 * @param {Object} s3Config - S3 configuration
 * @param {string} s3Key - S3 object key
 * @returns {Promise<Object>} - Delete result
 */
const deleteFile = async (s3Config, s3Key) => {
  const { accessKeyId, secretAccessKey, region, bucket } = s3Config;

  const s3Client = new S3Client({
    region: region || 'us-east-1',
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  try {
    logger.info(`Deleting file from S3: ${s3Key}`);

    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: s3Key,
    });

    await s3Client.send(command);

    logger.info(`File deleted from S3 successfully: ${s3Key}`);

    return {
      success: true,
      key: s3Key,
    };
  } catch (error) {
    logger.error(`S3 delete failed: ${error.message}`);
    throw error;
  }
};

/**
 * Check if file exists in S3
 * @param {Object} s3Config - S3 configuration
 * @param {string} s3Key - S3 object key
 * @returns {Promise<boolean>} - True if exists
 */
const fileExists = async (s3Config, s3Key) => {
  const { accessKeyId, secretAccessKey, region, bucket } = s3Config;

  const s3Client = new S3Client({
    region: region || 'us-east-1',
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  try {
    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: s3Key,
    });

    await s3Client.send(command);
    return true;
  } catch (error) {
    if (error.name === 'NotFound') {
      return false;
    }
    throw error;
  }
};

/**
 * Upload a stream directly to S3 (for large backups without disk writes)
 * @param {Object} s3Config - S3 configuration
 * @param {Stream} readableStream - Readable stream to upload
 * @param {string} s3Key - S3 object key
 * @param {string} contentType - Content type
 * @param {Function} progressCallback - Progress callback (receives bytes uploaded)
 * @returns {Promise<Object>} - Upload result
 */
const uploadStream = async (s3Config, readableStream, s3Key, contentType = 'application/octet-stream', progressCallback = null) => {
  const { Upload } = require('@aws-sdk/lib-storage');
  const { accessKeyId, secretAccessKey, region, bucket } = s3Config;

  const s3Client = new S3Client({
    region: region || 'us-east-1',
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  try {
    logger.info(`Uploading stream to S3: ${s3Key}`);

    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: bucket,
        Key: s3Key,
        Body: readableStream,
        ContentType: contentType,
      },
      // Optimize for large streaming uploads
      queueSize: 4, // Number of concurrent parts (lower = less memory)
      partSize: 5 * 1024 * 1024, // 5MB parts (minimum for S3)
      leavePartsOnError: false, // Clean up on error
    });

    let totalUploaded = 0;

    // Track progress
    upload.on('httpUploadProgress', (progress) => {
      totalUploaded = progress.loaded || 0;
      const percentage = progress.total ? Math.round((progress.loaded / progress.total) * 100) : 0;

      if (progress.total) {
        logger.debug(`Stream upload progress: ${percentage}% (${(totalUploaded / (1024 * 1024)).toFixed(2)} MB)`);
      } else {
        logger.debug(`Stream upload progress: ${(totalUploaded / (1024 * 1024)).toFixed(2)} MB`);
      }

      if (progressCallback) {
        progressCallback(totalUploaded, percentage);
      }
    });

    const response = await upload.done();

    const sizeMB = (totalUploaded / (1024 * 1024)).toFixed(2);
    logger.info(`Stream uploaded to S3 successfully: ${s3Key} (${sizeMB} MB)`);

    return {
      success: true,
      bucket,
      key: s3Key,
      size: totalUploaded,
      sizeMB,
      etag: response.ETag,
      url: `https://${bucket}.s3.${region}.amazonaws.com/${s3Key}`,
    };
  } catch (error) {
    logger.error(`S3 stream upload failed: ${error.message}`);
    throw error;
  }
};

/**
 * Test S3 connection
 * @param {Object} s3Config - S3 configuration
 * @returns {Promise<Object>} - Test result
 */
const testConnection = async (s3Config) => {
  const { accessKeyId, secretAccessKey, region, bucket } = s3Config;

  const s3Client = new S3Client({
    region: region || 'us-east-1',
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  try {
    // Try to head the bucket
    const { HeadBucketCommand } = require('@aws-sdk/client-s3');
    const command = new HeadBucketCommand({
      Bucket: bucket,
    });

    await s3Client.send(command);

    logger.info(`S3 connection test successful: ${bucket}`);

    return {
      success: true,
      message: 'Connection successful',
      bucket,
    };
  } catch (error) {
    logger.error(`S3 connection test failed: ${error.message}`);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Get content type based on file extension
 * @param {string} filePath - File path
 * @returns {string} - Content type
 */
function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  const contentTypes = {
    '.sql': 'application/sql',
    '.gz': 'application/gzip',
    '.zip': 'application/zip',
    '.tar': 'application/x-tar',
    '.dump': 'application/octet-stream',
    '.bak': 'application/octet-stream',
  };

  return contentTypes[ext] || 'application/octet-stream';
}

module.exports = {
  uploadFile,
  uploadFileWithProgress,
  uploadStream,
  downloadFile,
  deleteFile,
  fileExists,
  testConnection,
};
