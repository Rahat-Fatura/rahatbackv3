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
const { decryptFile: decryptFileUtil } = require('../utils/encryption');

/**
 * Execute restore job
 * @param {Object} restoreData - Restore job data from backend
 * @param {Object} wsClient - WebSocket client instance
 */
async function executeRestoreJob(restoreData, wsClient) {
  const {
    historyId,
    database,
    backup,
    storageType,
    storage,
    isEncrypted,
    encryptionPasswordHash,
  } = restoreData;

  logger.info(`Starting restore job ${historyId} for database ${database.name} (${database.type})`);
  logger.info(`Storage type: ${storageType}, backup.filePath: ${backup.filePath}, backup.storageKey: ${backup.storageKey}`);

  const startTime = Date.now();
  let downloadedFilePath = null;
  let decryptedFilePath = null;
  let decompressedFilePath = null;
  let finalFilePath = null;

  try {
    // Send restore started event
    wsClient.sendRestoreStarted(historyId, {
      databaseName: database.name,
      databaseType: database.type,
      backupFileName: backup.fileName,
      timestamp: new Date(),
    });

    // Step 1: Download from cloud storage (if needed)
    if (storageType === 's3' || storageType === 'google_drive') {
      wsClient.sendRestoreProgress(historyId, {
        progress: 10,
        currentStep: `Downloading from ${storageType === 's3' ? 'S3' : 'Google Drive'}`,
      });

      downloadedFilePath = await downloadFromCloud(
        storageType,
        storage,
        backup.storageKey || backup.filePath, // Use storageKey if available (S3 key), fallback to filePath
        backup.fileName,
        (progress) => {
          wsClient.sendRestoreProgress(historyId, {
            progress: 10 + (progress / 100) * 30, // 10-40%
            currentStep: `Downloading backup (${progress}%)`,
          });
        }
      );

      finalFilePath = downloadedFilePath;

      wsClient.sendRestoreProgress(historyId, {
        progress: 40,
        currentStep: 'Download complete',
      });
    } else if (storageType === 'local') {
      // Local file - use directly
      finalFilePath = backup.filePath;
      wsClient.sendRestoreProgress(historyId, {
        progress: 40,
        currentStep: 'Using local backup file',
      });
    } else {
      throw new Error(`Unsupported storage type: ${storageType}`);
    }

    // Step 2: Decrypt if encrypted
    if (isEncrypted) {
      if (!encryptionPasswordHash) {
        throw new Error('Encryption enabled but password hash not provided');
      }

      wsClient.sendRestoreProgress(historyId, {
        progress: 45,
        currentStep: 'Decrypting backup',
      });

      decryptedFilePath = finalFilePath.replace('.enc', '');

      logger.info(`Decrypting backup file: ${finalFilePath}`);

      await decryptFileUtil(finalFilePath, decryptedFilePath, encryptionPasswordHash, (progress) => {
        // Update progress during decryption (45-55%)
        const decryptProgress = 45 + (progress / 100) * 10;
        wsClient.sendRestoreProgress(historyId, {
          progress: Math.floor(decryptProgress),
          currentStep: `Decrypting backup (${progress}%)`,
        });
      });

      finalFilePath = decryptedFilePath;

      wsClient.sendRestoreProgress(historyId, {
        progress: 55,
        currentStep: 'Decryption complete',
      });

      logger.info(`Backup decrypted successfully: ${decryptedFilePath}`);
    }

    // Step 3: Decompress if compressed
    if (backup.fileName.replace('.enc', '').endsWith('.gz')) {
      wsClient.sendRestoreProgress(historyId, {
        progress: 60,
        currentStep: 'Decompressing backup',
      });

      decompressedFilePath = await decompressFile(finalFilePath, (progress) => {
        // Update progress during decompression (60-70%)
        const decompressProgress = 60 + (progress / 100) * 10;
        wsClient.sendRestoreProgress(historyId, {
          progress: Math.floor(decompressProgress),
          currentStep: `Decompressing backup (${Math.round(progress)}%)`,
        });
      });
      finalFilePath = decompressedFilePath;

      wsClient.sendRestoreProgress(historyId, {
        progress: 70,
        currentStep: 'Decompression complete',
      });
    }

    // Step 4: Restore to database
    wsClient.sendRestoreProgress(historyId, {
      progress: 75,
      currentStep: 'Restoring to database',
    });

    await restoreToDatabase(database, finalFilePath);

    wsClient.sendRestoreProgress(historyId, {
      progress: 95,
      currentStep: 'Restore complete',
    });

    // Step 5: Cleanup temporary files
    wsClient.sendRestoreProgress(historyId, {
      progress: 98,
      currentStep: 'Cleaning up',
    });

    await cleanupTempFiles(downloadedFilePath, decryptedFilePath, decompressedFilePath);

    // Calculate duration
    const duration = Date.now() - startTime;

    // Send restore completed event
    wsClient.sendRestoreCompleted(historyId, {
      success: true,
      databaseName: database.name,
      duration,
      timestamp: new Date(),
    });

    logger.info(`Restore job ${historyId} completed successfully in ${duration}ms`);
  } catch (error) {
    logger.error(`Restore job ${historyId} failed:`, error);

    // Cleanup on error
    try {
      await cleanupTempFiles(downloadedFilePath, decryptedFilePath, decompressedFilePath);
    } catch (cleanupError) {
      logger.error('Cleanup failed:', cleanupError);
    }

    wsClient.sendRestoreFailed(historyId, error.message);
    throw error;
  }
}

/**
 * Download backup from cloud storage
 * @param {string} storageType - 's3' or 'google_drive'
 * @param {Object} storage - Storage configuration
 * @param {string} cloudPath - Cloud file path/key/fileId
 * @param {string} fileName - File name
 * @param {Function} progressCallback - Progress callback
 * @returns {Promise<string>} - Downloaded file path
 */
async function downloadFromCloud(storageType, storage, cloudPath, fileName, progressCallback) {
  const tempDir = path.join(config.backupStoragePath, 'temp', 'restore');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const downloadPath = path.join(tempDir, fileName);

  if (storageType === 's3') {
    const { accessKeyId, secretAccessKey, region, bucket } = storage;

    if (!accessKeyId || !secretAccessKey) {
      throw new Error('S3 credentials missing');
    }

    const s3Config = {
      accessKeyId,
      secretAccessKey,
      region,
      bucket,
    };

    logger.info(`Downloading from S3: ${cloudPath}`);
    const result = await s3Handler.downloadFile(s3Config, cloudPath, downloadPath);

    if (!result.success) {
      throw new Error(`S3 download failed: ${result.error}`);
    }

    return downloadPath;
  } else if (storageType === 'google_drive') {
    const { refreshToken, folderId, googleClientId, googleClientSecret, googleRedirectUri } = storage;

    if (!refreshToken) {
      throw new Error('Google Drive refresh token missing');
    }

    const gdriveConfig = {
      refreshToken,
      folderId,
      clientId: googleClientId || process.env.GOOGLE_CLIENT_ID,
      clientSecret: googleClientSecret || process.env.GOOGLE_CLIENT_SECRET,
      redirectUri: googleRedirectUri || process.env.GOOGLE_REDIRECT_URI,
    };

    logger.info(`Downloading from Google Drive: ${cloudPath}`);
    const result = await gdriveHandler.downloadFile(gdriveConfig, cloudPath, downloadPath);

    if (!result.success) {
      throw new Error(`Google Drive download failed: ${result.error}`);
    }

    return downloadPath;
  } else {
    throw new Error(`Unsupported storage type: ${storageType}`);
  }
}

/**
 * Decompress file using gunzip
 * @param {string} compressedFilePath - Compressed file path
 * @param {Function} progressCallback - Progress callback (optional)
 * @returns {Promise<string>} - Decompressed file path
 */
async function decompressFile(compressedFilePath, progressCallback) {
  const decompressedFilePath = compressedFilePath.replace('.gz', '');

  logger.info(`Decompressing file: ${compressedFilePath}`);

  // Get compressed file size for progress tracking
  const compressedStats = fs.statSync(compressedFilePath);
  const totalCompressedSize = compressedStats.size;
  let processedBytes = 0;
  let lastProgressReport = 0;

  const source = fs.createReadStream(compressedFilePath);
  const destination = fs.createWriteStream(decompressedFilePath);
  const gunzip = zlib.createGunzip();

  // Track progress on source stream (compressed data read)
  if (progressCallback) {
    source.on('data', (chunk) => {
      processedBytes += chunk.length;
      const progress = Math.floor((processedBytes / totalCompressedSize) * 100);

      // Report progress every 5% to avoid too many updates
      if (progress >= lastProgressReport + 5 || progress === 100) {
        lastProgressReport = progress;
        try {
          progressCallback(progress);
        } catch (error) {
          logger.error('Progress callback error:', error);
        }
      }
    });
  }

  await pipeline(source, gunzip, destination);

  const stats = fs.statSync(decompressedFilePath);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

  logger.info(`File decompressed: ${decompressedFilePath} (${sizeMB} MB)`);

  return decompressedFilePath;
}

/**
 * Restore database from backup file
 * @param {Object} database - Database configuration
 * @param {string} backupFilePath - Backup file path
 * @returns {Promise<void>}
 */
async function restoreToDatabase(database, backupFilePath) {
  const { type, host, port, username, password, name } = database;

  // Database configuration
  const dbConfig = {
    host,
    port,
    username,
    password,
    database: name,
  };

  // Execute restore based on database type
  let result;

  switch (type.toLowerCase()) {
    case 'postgresql':
    case 'postgres':
      logger.info(`Restoring PostgreSQL database: ${name}`);
      result = await postgresqlConnector.restoreBackup(dbConfig, backupFilePath);
      break;

    case 'mysql':
    case 'mariadb':
      logger.info(`Restoring MySQL database: ${name}`);
      result = await mysqlConnector.restoreBackup(dbConfig, backupFilePath);
      break;

    case 'mongodb':
    case 'mongo':
      logger.info(`Restoring MongoDB database: ${name}`);
      result = await mongodbConnector.restoreBackup(dbConfig, backupFilePath);
      break;

    case 'mssql':
    case 'sqlserver':
      logger.info(`Restoring MSSQL database: ${name}`);
      result = await mssqlConnector.restoreBackup(dbConfig, backupFilePath);
      break;

    default:
      throw new Error(`Unsupported database type: ${type}`);
  }

  if (!result.success) {
    throw new Error(result.error || 'Database restore failed');
  }

  logger.info(`Database restored successfully: ${name}`);
}

/**
 * Cleanup temporary files
 * @param {string} downloadedFilePath - Downloaded file path
 * @param {string} decryptedFilePath - Decrypted file path
 * @param {string} decompressedFilePath - Decompressed file path
 */
async function cleanupTempFiles(downloadedFilePath, decryptedFilePath, decompressedFilePath) {
  try {
    const filesToDelete = [downloadedFilePath, decryptedFilePath, decompressedFilePath].filter(Boolean);

    for (const filePath of filesToDelete) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.debug(`Deleted temp file: ${filePath}`);
      }
    }

    // Remove empty temp directories
    const tempRestoreDir = path.join(config.backupStoragePath, 'temp', 'restore');
    if (fs.existsSync(tempRestoreDir) && fs.readdirSync(tempRestoreDir).length === 0) {
      fs.rmdirSync(tempRestoreDir);
      logger.debug(`Deleted empty directory: ${tempRestoreDir}`);
    }
  } catch (error) {
    logger.error('Cleanup error:', error);
  }
}

module.exports = {
  executeRestoreJob,
};
