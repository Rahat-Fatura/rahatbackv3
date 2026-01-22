const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const logger = require('../config/logger');
const config = require('../config/config');

// Database connectors
const postgresqlConnector = require('./dbConnectors/postgresql.connector');
const mysqlConnector = require('./dbConnectors/mysql');
const mongodbConnector = require('./dbConnectors/mongodb');
const mssqlConnector = require('./dbConnectors/mssql');

// Cloud storage handlers
const s3Handler = require('./cloudStorage/s3.handler');
const gdriveHandler = require('./cloudStorage/gdrive.handler');

// Encryption utilities
const { encryptFile, createEncryptionStream } = require('../utils/encryption');

/**
 * Execute backup job
 * @param {Object} jobData - Backup job data from backend
 * @param {Object} wsClient - WebSocket client instance
 */
async function executeBackupJob(jobData, wsClient) {
  const { id: jobId, database, storageType, storage, compression, isEncrypted, encryptionPasswordHash } = jobData;

  logger.info(`Starting backup job ${jobId} for database ${database.name} (${database.type})`);
  logger.info(`🔐 Encryption settings - isEncrypted: ${isEncrypted}, hasPasswordHash: ${!!encryptionPasswordHash}`);

  // Track this job as active (for incomplete job detection on reconnect)
  wsClient.addActiveJob(jobId, database.name);

  const startTime = Date.now();
  let backupFilePath = null;
  let compressedFilePath = null;
  let encryptedFilePath = null;
  let finalFilePath = null;

  try {
    // Send backup started event
    wsClient.sendBackupStarted(jobId, {
      databaseName: database.name,
      databaseType: database.type,
      storageType,
      timestamp: new Date(),
    });

    // Check if we should use streaming (for PostgreSQL with S3/compression)
    const shouldUseStreaming =
      (database.type.toLowerCase() === 'postgresql' || database.type.toLowerCase() === 'postgres') &&
      storageType === 's3' &&
      compression;

    if (shouldUseStreaming) {
      logger.info(`Using streaming backup for ${database.name} (no disk writes)`);

      // Use streaming backup - no disk writes!
      const uploadResult = await executeStreamingBackup(database, jobId, storage, wsClient, isEncrypted, encryptionPasswordHash);

      // Calculate duration
      const duration = Date.now() - startTime;

      // Send backup completed event
      wsClient.sendBackupCompleted(jobId, {
        success: true,
        fileName: uploadResult.fileName,
        fileSize: uploadResult.size,
        fileSizeMB: uploadResult.sizeMB,
        storageType,
        storageUrl: uploadResult.url,
        storageKey: uploadResult.key, // S3 key for verification
        isEncrypted: isEncrypted,
        duration,
        timestamp: new Date(),
      });

      // Remove from active jobs
      wsClient.removeActiveJob(jobId);

      logger.info(`Streaming backup job ${jobId} completed successfully in ${duration}ms`);
      return;
    }

    // Traditional backup flow (write to disk first)
    logger.info(`Using traditional backup for ${database.name} (writes to disk)`);

    // Step 1: Create database backup
    wsClient.sendBackupProgress(jobId, {
      progress: 10,
      currentStep: 'Creating database dump',
    });

    backupFilePath = await createDatabaseBackup(database, jobId);

    wsClient.sendBackupProgress(jobId, {
      progress: 50,
      currentStep: 'Database dump created',
    });

    // Step 2: Compress if enabled
    if (compression) {
      wsClient.sendBackupProgress(jobId, {
        progress: 60,
        currentStep: 'Compressing backup',
      });

      compressedFilePath = await compressFile(backupFilePath);
      finalFilePath = compressedFilePath;

      wsClient.sendBackupProgress(jobId, {
        progress: 70,
        currentStep: 'Compression complete',
      });
    } else {
      finalFilePath = backupFilePath;
    }

    // Step 3: Encrypt if enabled
    if (isEncrypted) {
      if (!encryptionPasswordHash) {
        throw new Error('Encryption enabled but password hash not provided');
      }

      wsClient.sendBackupProgress(jobId, {
        progress: 75,
        currentStep: 'Encrypting backup',
      });

      encryptedFilePath = `${finalFilePath}.enc`;

      logger.info(`Encrypting backup file: ${finalFilePath}`);

      await encryptFile(finalFilePath, encryptedFilePath, encryptionPasswordHash, (progress) => {
        // Update progress during encryption (75-80%)
        const encryptProgress = 75 + (progress / 100) * 5;
        wsClient.sendBackupProgress(jobId, {
          progress: Math.floor(encryptProgress),
          currentStep: `Encrypting backup (${progress}%)`,
        });
      });

      finalFilePath = encryptedFilePath;

      wsClient.sendBackupProgress(jobId, {
        progress: 80,
        currentStep: 'Encryption complete',
      });

      logger.info(`Backup encrypted successfully: ${encryptedFilePath}`);
    }

    // Step 4: Upload to storage
    let uploadResult = null;

    if (storageType === 's3') {
      wsClient.sendBackupProgress(jobId, {
        progress: 80,
        currentStep: 'Uploading to S3',
      });

      uploadResult = await uploadToS3(finalFilePath, database, storage, (progress) => {
        wsClient.sendBackupProgress(jobId, {
          progress: 80 + (progress / 100) * 15, // 80-95%
          currentStep: `Uploading to S3 (${progress}%)`,
        });
      });

      wsClient.sendBackupProgress(jobId, {
        progress: 95,
        currentStep: 'Upload complete',
      });
    } else if (storageType === 'google_drive') {
      wsClient.sendBackupProgress(jobId, {
        progress: 80,
        currentStep: 'Uploading to Google Drive',
      });

      uploadResult = await uploadToGoogleDrive(finalFilePath, database, storage, (progress) => {
        wsClient.sendBackupProgress(jobId, {
          progress: 80 + (progress / 100) * 15, // 80-95%
          currentStep: `Uploading to Google Drive (${progress}%)`,
        });
      });

      wsClient.sendBackupProgress(jobId, {
        progress: 95,
        currentStep: 'Upload complete',
      });
    } else if (storageType === 'local') {
      wsClient.sendBackupProgress(jobId, {
        progress: 90,
        currentStep: 'Saving to local storage',
      });

      // File is already saved locally, just report it
      const stats = fs.statSync(finalFilePath);
      uploadResult = {
        success: true,
        filePath: finalFilePath,
        size: stats.size,
        sizeMB: (stats.size / (1024 * 1024)).toFixed(2),
        storageType: 'local',
      };
    } else {
      throw new Error(`Unsupported storage type: ${storageType}`);
    }

    // Step 5: Cleanup temporary files
    wsClient.sendBackupProgress(jobId, {
      progress: 98,
      currentStep: 'Cleaning up',
    });

    await cleanupTempFiles(backupFilePath, compressedFilePath, encryptedFilePath, storageType);

    // Calculate duration
    const duration = Date.now() - startTime;

    // Send backup completed event
    wsClient.sendBackupCompleted(jobId, {
      success: true,
      fileName: path.basename(finalFilePath),
      // For Google Drive: use fileId (e.g., "1RWHEmP6eGgGusLg7_EQXS5oTIL6MK3D5")
      // For S3: use key (e.g., "database/backup.gz")
      storageKey: uploadResult.fileId || uploadResult.storageKey || uploadResult.key,
      fileSize: uploadResult.size,
      fileSizeMB: uploadResult.sizeMB,
      storageType,
      storageUrl: uploadResult.url || uploadResult.filePath,
      isEncrypted: isEncrypted,
      duration,
      timestamp: new Date(),
    });

    // Remove from active jobs
    wsClient.removeActiveJob(jobId);

    logger.info(`Backup job ${jobId} completed successfully in ${duration}ms`);
  } catch (error) {
    logger.error(`Backup job ${jobId} failed:`, error);

    // Remove from active jobs
    wsClient.removeActiveJob(jobId);

    // Cleanup on error
    try {
      await cleanupTempFiles(backupFilePath, compressedFilePath, encryptedFilePath, 'local');
    } catch (cleanupError) {
      logger.error('Cleanup failed:', cleanupError);
    }

    wsClient.sendBackupFailed(jobId, error.message);
    throw error;
  }
}

/**
 * Execute streaming backup (PostgreSQL -> gzip -> encrypt -> S3, no disk writes)
 * @param {Object} database - Database configuration
 * @param {number} jobId - Job ID
 * @param {Object} storage - Storage configuration
 * @param {Object} wsClient - WebSocket client
 * @param {boolean} isEncrypted - Whether to encrypt the backup
 * @param {string} encryptionPasswordHash - Encryption password hash
 * @returns {Promise<Object>} - Upload result
 */
async function executeStreamingBackup(database, jobId, storage, wsClient, isEncrypted = false, encryptionPasswordHash = null) {
  const { host, port, username, password, name, type, database: dbName } = database;
  const { accessKeyId, secretAccessKey, region, bucket, path: s3Path } = storage;

  // Database configuration (use actual database name, fallback to connection name)
  const dbConfig = {
    host,
    port,
    username,
    password,
    database: dbName || name,
  };

  wsClient.sendBackupProgress(jobId, {
    progress: 10,
    currentStep: 'Starting streaming backup (no disk writes)',
  });

  // Step 1: Create backup stream from pg_dump
  logger.info(`Creating streaming backup for ${name}`);
  const backupStreamData = await postgresqlConnector.createBackupStream(dbConfig, {
    format: 'plain',
  });

  wsClient.sendBackupProgress(jobId, {
    progress: 20,
    currentStep: 'Database stream created, compressing and uploading...',
  });

  // Step 2: Pipe through gzip compression with backpressure control
  const gzipStream = zlib.createGzip({
    level: 6, // Balanced compression
    chunkSize: 64 * 1024, // 64KB chunks
    memLevel: 8, // Memory usage level (1-9, lower = less memory)
    finishFlush: zlib.constants.Z_FINISH, // Ensure proper finalization
  });

  // Pipe pg_dump output through gzip with backpressure
  backupStreamData.stream.pipe(gzipStream, {
    end: true, // End gzip when pg_dump ends
    highWaterMark: 64 * 1024, // 64KB buffer
  });

  // Reference to current pipeline stream (will be updated if encryption is added)
  let pipelineStream = gzipStream;

  // Add error handling for gzip stream
  gzipStream.on('error', (err) => {
    logger.error(`Gzip stream error: ${err.message}`);
    backupStreamData.pgDumpProcess.kill();
    throw err;
  });

  // Step 3: Encrypt if enabled (streaming encryption)
  let encryptionData = null;
  if (isEncrypted) {
    if (!encryptionPasswordHash) {
      throw new Error('Encryption enabled but password hash not provided');
    }

    wsClient.sendBackupProgress(jobId, {
      progress: 25,
      currentStep: 'Encrypting backup stream...',
    });

    logger.info(`Encrypting streaming backup with AES-256-GCM`);

    // Create encryption stream
    encryptionData = createEncryptionStream(encryptionPasswordHash);
    const { cipher, salt, iv } = encryptionData;

    // Create a PassThrough stream to handle metadata writing
    const { PassThrough } = require('stream');
    const encryptedStream = new PassThrough();

    // Write salt and IV to the encrypted stream first
    encryptedStream.write(salt);
    encryptedStream.write(iv);

    // CRITICAL FIX: Pipe gzip output through cipher FIRST
    pipelineStream.pipe(cipher);

    // CRITICAL FIX: Use 'finish' event instead of 'end' event
    // 'finish' event fires when all data has been WRITTEN to the transform stream (cipher)
    // This is when we can safely get the auth tag
    // 'end' event fires when reading is done, which may never happen in some scenarios
    cipher.on('finish', () => {
      try {
        // Get auth tag after cipher finishes processing all data
        const authTag = encryptionData.getAuthTag();
        logger.info(`✅ Auth tag generated (${authTag.length} bytes), appending to encrypted stream`);

        // Append auth tag and close the encrypted stream
        encryptedStream.write(authTag);
        encryptedStream.end();

        logger.info(`✅ Encryption stream finalized successfully`);
      } catch (error) {
        logger.error(`❌ Failed to append auth tag: ${error.message}`);
        encryptedStream.destroy(error);
      }
    });

    // CRITICAL FIX: Pipe cipher output to encrypted stream with end: false
    // We need end: false because we manually append auth tag after cipher finishes
    cipher.pipe(encryptedStream, { end: false });

    // Handle errors in the encryption pipeline
    cipher.on('error', (err) => {
      logger.error(`Cipher stream error: ${err.message}`);
      encryptedStream.destroy(err);
    });

    pipelineStream.on('error', (err) => {
      logger.error(`Gzip stream error before encryption: ${err.message}`);
      cipher.destroy(err);
    });

    // Update pipeline stream to be the encrypted stream
    pipelineStream = encryptedStream;

    logger.info(`Streaming backup will be encrypted before upload`);
  }

  // Step 4: Generate filename and S3 key
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const baseFilename = `${name}_${timestamp}.sql.gz`;
  const filename = isEncrypted ? `${baseFilename}.enc` : baseFilename;
  const s3Key = s3Path ? `${s3Path}/${name}/${filename}` : `${name}/${filename}`;

  // S3 configuration
  const s3Config = {
    accessKeyId,
    secretAccessKey,
    region,
    bucket,
  };

  const streamingMode = isEncrypted ? 'Streaming encrypted backup to S3' : 'Streaming backup directly to S3';
  logger.info(`${streamingMode}: ${s3Key}`);

  // Handle pg_dump stream errors (gzip error handling already added above)
  backupStreamData.stream.on('error', (err) => {
    logger.error(`pg_dump stream error: ${err.message}`);
    gzipStream.destroy(err);
  });

  // Step 5: Upload stream directly to S3
  const contentType = isEncrypted ? 'application/octet-stream' : 'application/gzip';
  let lastProgress = isEncrypted ? 30 : 20;
  const uploadResult = await s3Handler.uploadStream(
    s3Config,
    pipelineStream,
    s3Key,
    contentType,
    (bytesUploaded, percentage) => {
      // Update progress (30-95% for encrypted, 20-95% for non-encrypted)
      const startProgress = isEncrypted ? 30 : 20;
      const progress = startProgress + Math.floor((bytesUploaded / (1024 * 1024)) * 0.65); // Incremental based on MB
      if (progress > lastProgress && progress <= 95) {
        lastProgress = progress;
        const sizeMB = (bytesUploaded / (1024 * 1024)).toFixed(2);
        const statusMsg = isEncrypted
          ? `Uploading encrypted backup to S3: ${sizeMB} MB`
          : `Streaming to S3: ${sizeMB} MB uploaded`;
        wsClient.sendBackupProgress(jobId, {
          progress,
          currentStep: statusMsg,
        });
      }
    }
  );

  wsClient.sendBackupProgress(jobId, {
    progress: 98,
    currentStep: 'Upload complete',
  });

  logger.info(`Streaming backup completed: ${uploadResult.sizeMB} MB uploaded to S3`);

  return {
    fileName: filename,
    key: s3Key, // S3 key for verification
    size: uploadResult.size,
    sizeMB: uploadResult.sizeMB,
    url: uploadResult.url,
  };
}

/**
 * Create database backup based on database type
 * @param {Object} database - Database configuration
 * @param {number} jobId - Job ID
 * @returns {Promise<string>} - Backup file path
 */
async function createDatabaseBackup(database, jobId) {
  const { type, host, port, username, password, name, database: dbName } = database;

  // Create backup directory
  const backupDir = path.join(config.backupStoragePath, `job_${jobId}`);
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // Generate backup filename (use connection name for file naming)
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const filename = `${name}_${timestamp}.sql`;
  const outputPath = path.join(backupDir, filename);

  // Database configuration (use actual database name, fallback to connection name)
  const dbConfig = {
    host,
    port,
    username,
    password,
    database: dbName || name,
  };

  // Execute backup based on database type
  let result;

  switch (type.toLowerCase()) {
    case 'postgresql':
    case 'postgres':
      logger.info(`Creating PostgreSQL backup for ${name}`);
      result = await postgresqlConnector.createBackup(dbConfig, outputPath, {
        format: 'plain',
        compression: false, // We'll compress separately
      });
      break;

    case 'mysql':
    case 'mariadb':
      logger.info(`Creating MySQL backup for ${name}`);
      result = await mysqlConnector.createBackup(dbConfig, outputPath);
      break;

    case 'mongodb':
    case 'mongo':
      logger.info(`Creating MongoDB backup for ${name}`);
      result = await mongodbConnector.createBackup(dbConfig, outputPath);
      break;

    case 'mssql':
    case 'sqlserver':
      logger.info(`Creating MSSQL backup for ${name}`);
      result = await mssqlConnector.createBackup(dbConfig, outputPath);
      break;

    default:
      throw new Error(`Unsupported database type: ${type}`);
  }

  logger.info(`Database backup created: ${result.filePath} (${result.fileSizeMB} MB)`);
  return result.filePath;
}

/**
 * Compress file using gzip
 * @param {string} filePath - File to compress
 * @returns {Promise<string>} - Compressed file path
 */
async function compressFile(filePath) {
  const compressedPath = `${filePath}.gz`;

  logger.info(`Compressing file: ${filePath}`);

  const source = fs.createReadStream(filePath);
  const destination = fs.createWriteStream(compressedPath);
  const gzip = zlib.createGzip();

  await pipeline(source, gzip, destination);

  const stats = fs.statSync(compressedPath);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

  logger.info(`File compressed: ${compressedPath} (${sizeMB} MB)`);

  return compressedPath;
}

/**
 * Upload backup to S3
 * @param {string} filePath - File to upload
 * @param {Object} database - Database info
 * @param {Object} storage - Storage configuration
 * @param {Function} progressCallback - Progress callback
 * @returns {Promise<Object>} - Upload result
 */
async function uploadToS3(filePath, database, storage, progressCallback) {
  const { accessKeyId, secretAccessKey, region, bucket, path: s3Path } = storage;

  // Validate credentials
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(`S3 credentials missing: accessKeyId=${!!accessKeyId}, secretAccessKey=${!!secretAccessKey}`);
  }

  // Generate S3 key
  const filename = path.basename(filePath);
  const s3Key = s3Path ? `${s3Path}/${database.name}/${filename}` : `${database.name}/${filename}`;

  const s3Config = {
    accessKeyId,
    secretAccessKey,
    region,
    bucket,
  };

  logger.info(`Uploading to S3: ${s3Key}`);
  logger.debug(`S3 Config: region=${region}, bucket=${bucket}, hasAccessKey=${!!accessKeyId}, hasSecretKey=${!!secretAccessKey}`);

  // Use progress version for large files
  const stats = fs.statSync(filePath);
  const fileSizeInMB = stats.size / (1024 * 1024);

  let result;

  if (fileSizeInMB > 5) {
    // Use multipart upload for files > 5MB
    result = await s3Handler.uploadFileWithProgress(s3Config, filePath, s3Key, progressCallback);
  } else {
    result = await s3Handler.uploadFile(s3Config, filePath, s3Key, progressCallback);
  }

  // Add S3 key to result for verification
  result.storageKey = s3Key;
  return result;
}

/**
 * Upload backup to Google Drive
 * @param {string} filePath - File to upload
 * @param {Object} database - Database info
 * @param {Object} storage - Storage configuration
 * @param {Function} progressCallback - Progress callback
 * @returns {Promise<Object>} - Upload result
 */
async function uploadToGoogleDrive(filePath, database, storage, progressCallback) {
  const { refreshToken, folderId, googleClientId, googleClientSecret, googleRedirectUri } = storage;

  // Validate credentials
  if (!refreshToken) {
    throw new Error('Google Drive refresh token missing');
  }

  // Generate Google Drive file key (path structure)
  const filename = path.basename(filePath);
  const gdriveKey = `${database.name}/${filename}`;

  const gdriveConfig = {
    refreshToken,
    folderId,
    // Use credentials from backend (sent with job data) or fallback to agent's .env
    clientId: googleClientId || process.env.GOOGLE_CLIENT_ID,
    clientSecret: googleClientSecret || process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: googleRedirectUri || process.env.GOOGLE_REDIRECT_URI,
  };

  logger.info(`Uploading to Google Drive: ${gdriveKey}`);
  logger.debug(`Google Drive Config: hasRefreshToken=${!!refreshToken}, folderId=${folderId || 'root'}, hasClientId=${!!gdriveConfig.clientId}`);

  // Use progress version for large files
  const stats = fs.statSync(filePath);
  const fileSizeInMB = stats.size / (1024 * 1024);

  let result;

  if (fileSizeInMB > 5) {
    // Use progress tracking for files > 5MB
    result = await gdriveHandler.uploadFileWithProgress(gdriveConfig, filePath, gdriveKey, progressCallback);
  } else {
    result = await gdriveHandler.uploadFile(gdriveConfig, filePath, gdriveKey, progressCallback);
  }

  return result;
}

/**
 * Cleanup temporary files
 * @param {string} backupFilePath - Backup file path
 * @param {string} compressedFilePath - Compressed file path
 * @param {string} encryptedFilePath - Encrypted file path
 * @param {string} storageType - Storage type
 */
async function cleanupTempFiles(backupFilePath, compressedFilePath, encryptedFilePath, storageType) {
  try {
    // If stored remotely, delete all local files
    if (storageType !== 'local') {
      if (backupFilePath && fs.existsSync(backupFilePath)) {
        fs.unlinkSync(backupFilePath);
        logger.debug(`Deleted temp file: ${backupFilePath}`);
      }

      if (compressedFilePath && fs.existsSync(compressedFilePath)) {
        fs.unlinkSync(compressedFilePath);
        logger.debug(`Deleted temp file: ${compressedFilePath}`);
      }

      if (encryptedFilePath && fs.existsSync(encryptedFilePath)) {
        fs.unlinkSync(encryptedFilePath);
        logger.debug(`Deleted temp file: ${encryptedFilePath}`);
      }

      // Remove empty job directory
      if (backupFilePath) {
        const jobDir = path.dirname(backupFilePath);
        if (fs.existsSync(jobDir) && fs.readdirSync(jobDir).length === 0) {
          fs.rmdirSync(jobDir);
          logger.debug(`Deleted empty directory: ${jobDir}`);
        }
      }
    } else {
      // For local storage, only delete intermediate files
      if (backupFilePath && fs.existsSync(backupFilePath) && (compressedFilePath || encryptedFilePath)) {
        fs.unlinkSync(backupFilePath);
        logger.debug(`Deleted uncompressed file: ${backupFilePath}`);
      }
      if (compressedFilePath && fs.existsSync(compressedFilePath) && encryptedFilePath) {
        fs.unlinkSync(compressedFilePath);
        logger.debug(`Deleted unencrypted file: ${compressedFilePath}`);
      }
    }
  } catch (error) {
    logger.error('Cleanup error:', error);
  }
}

module.exports = {
  executeBackupJob,
};
