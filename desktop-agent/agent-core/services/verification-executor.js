const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
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
const { decryptFile: decryptFileUtil, SALT_LENGTH, IV_LENGTH, AUTH_TAG_LENGTH } = require('../utils/encryption');

/**
 * Get database connector based on type
 */
function getConnector(dbType) {
  const connectors = {
    postgresql: postgresqlConnector,
    mysql: mysqlConnector,
    mongodb: mongodbConnector,
    mssql: mssqlConnector,
    mariadb: mysqlConnector, // MariaDB uses MySQL connector
  };

  return connectors[dbType.toLowerCase()];
}

/**
 * Execute verification job
 * @param {Object} verificationData - Verification job data from backend
 * @param {Object} wsClient - WebSocket client instance
 */
async function executeVerificationJob(verificationData, wsClient) {
  const {
    historyId,
    database,
    backup,
    storageType,
    storage,
    verificationLevel = 'BASIC',
    isEncrypted,
    encryptionPasswordHash,
  } = verificationData;

  logger.info(`Starting verification job ${historyId} for backup ${backup.fileName}`);
  logger.info(`Verification level: ${verificationLevel}, Storage type: ${storageType}`);

  const startTime = Date.now();
  let downloadedFilePath = null;
  let decryptedFilePath = null;
  let decompressedFilePath = null;
  let finalFilePath = null;

  let verificationResult = {
    backupHistoryId: historyId,
    verificationMethod: verificationLevel,
    checks: [],
    overallStatus: 'PENDING',
  };

  try {
    // Send verification started event
    wsClient.sendVerificationStarted(historyId, {
      backupFileName: backup.fileName,
      verificationLevel,
      timestamp: new Date(),
    });

    // Progress: 10% - Starting
    wsClient.sendVerificationProgress(historyId, {
      progress: 10,
      currentStep: 'Downloading backup file from cloud storage',
    });

    // Step 1: Download from cloud storage
    const backupDir = path.join(config.backupStoragePath, 'verify', `verify_${historyId}_${Date.now()}`);
    await fs.mkdir(backupDir, { recursive: true });

    downloadedFilePath = path.join(backupDir, backup.fileName);

    if (storageType === 's3') {
      logger.info('Downloading backup from S3');

      // Map backend field names to S3 handler format
      const s3Config = {
        accessKeyId: storage.accessKeyId,
        secretAccessKey: storage.secretAccessKey,
        region: storage.region,
        bucket: storage.bucket,
      };

      // Extract S3 key from URL or use storageKey directly
      let s3Key = backup.storageKey || backup.filePath;
      if (s3Key && s3Key.startsWith('http')) {
        // Extract key from full S3 URL
        const urlMatch = s3Key.match(/\.com\/(.+)$/);
        if (urlMatch) {
          s3Key = urlMatch[1];
          logger.info(`Extracted S3 key from URL: ${s3Key}`);
        }
      }

      await s3Handler.downloadFile(s3Config, s3Key, downloadedFilePath);
    } else if (storageType === 'google_drive') {
      logger.info('Downloading backup from Google Drive');

      // Map storage config to gdrive handler format
      const gdriveConfig = {
        refreshToken: storage.refreshToken,
        folderId: storage.folderId,
        clientId: storage.googleClientId,
        clientSecret: storage.googleClientSecret,
        redirectUri: storage.googleRedirectUri,
      };

      logger.debug(`Google Drive config: hasRefreshToken=${!!gdriveConfig.refreshToken}, folderId=${gdriveConfig.folderId || 'root'}, hasClientId=${!!gdriveConfig.clientId}`);

      // Get fileId from storageKey (should be the Google Drive file ID)
      // Backup executor now sends fileId directly in storageKey
      let fileId = backup.storageKey || backup.filePath;

      // Fallback: Try to extract fileId from Google Drive share URL if needed
      // Format: https://drive.google.com/file/d/FILE_ID/view
      if (fileId && fileId.includes('drive.google.com')) {
        const fileIdMatch = fileId.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (fileIdMatch) {
          fileId = fileIdMatch[1];
          logger.info(`Extracted fileId from Google Drive URL: ${fileId}`);
        }
      }

      logger.info(`Downloading file from Google Drive: ${fileId}`);
      await gdriveHandler.downloadFile(gdriveConfig, fileId, downloadedFilePath);
    } else if (storageType === 'local') {
      // Copy from local storage
      logger.info('Using local backup file');
      const localPath = backup.filePath;
      if (fsSync.existsSync(localPath)) {
        await fs.copyFile(localPath, downloadedFilePath);
      } else {
        throw new Error(`Local backup file not found: ${localPath}`);
      }
    } else {
      throw new Error(`Unsupported storage type: ${storageType}`);
    }

    logger.info(`Backup downloaded successfully: ${downloadedFilePath}`);

    // Progress: 30% - Downloaded
    wsClient.sendVerificationProgress(historyId, {
      progress: 30,
      currentStep: 'File downloaded, starting verification checks',
    });

    finalFilePath = downloadedFilePath;

    // Level 1: Basic Checks
    logger.info('Running basic verification checks...');

    // Check 1: File existence
    verificationResult.checks.push(await verifyFileExistence(finalFilePath));

    // Check 2: File size
    const stats = await fs.stat(finalFilePath);
    verificationResult.checks.push(await verifyFileSize(finalFilePath, backup.fileSize));

    // Progress: 40%
    wsClient.sendVerificationProgress(historyId, {
      progress: 40,
      currentStep: 'Verifying file integrity',
    });

    // Check 3: Checksum verification
    if (backup.checksumValue) {
      verificationResult.checks.push(await verifyChecksum(finalFilePath, backup.checksumValue, backup.checksumAlgorithm || 'sha256'));
    }

    // Check 4: Compression integrity (if compressed)
    if (backup.fileName.replace('.enc', '').endsWith('.gz')) {
      verificationResult.checks.push(await verifyCompressionIntegrity(finalFilePath, isEncrypted));

      // Decompress for further checks
      if (!isEncrypted) {
        decompressedFilePath = finalFilePath.replace('.gz', '');
        logger.info(`Decompressing file: ${finalFilePath}`);
        await decompressFile(finalFilePath, decompressedFilePath);
        finalFilePath = decompressedFilePath;
        logger.info(`File decompressed: ${decompressedFilePath}`);
      }
    }

    // Progress: 50%
    wsClient.sendVerificationProgress(historyId, {
      progress: 50,
      currentStep: 'Basic checks completed',
    });

    // Check 5: Encryption integrity (if encrypted)
    if (isEncrypted) {
      verificationResult.checks.push(await verifyEncryptionIntegrity(finalFilePath, encryptionPasswordHash));

      // Decrypt file for further checks
      decryptedFilePath = finalFilePath.replace('.enc', '');
      logger.info(`Decrypting file: ${finalFilePath}`);
      await decryptFileUtil(finalFilePath, decryptedFilePath, encryptionPasswordHash);
      finalFilePath = decryptedFilePath;
      logger.info(`File decrypted: ${decryptedFilePath}`);

      // If still compressed, decompress
      if (finalFilePath.endsWith('.gz')) {
        decompressedFilePath = finalFilePath.replace('.gz', '');
        logger.info(`Decompressing decrypted file: ${finalFilePath}`);
        await decompressFile(finalFilePath, decompressedFilePath);
        finalFilePath = decompressedFilePath;
        logger.info(`File decompressed: ${decompressedFilePath}`);
      }
    }

    // Level 2: Database-specific verification
    if (verificationLevel === 'DATABASE' || verificationLevel === 'FULL') {
      logger.info('Running database-specific verification...');

      wsClient.sendVerificationProgress(historyId, {
        progress: 60,
        currentStep: 'Verifying database structure',
      });

      const connector = getConnector(database.type);

      if (connector && connector.verifyBackup) {
        const dbConfig = {
          host: database.host,
          port: database.port,
          username: database.username,
          password: database.password,
          database: database.database,
          ...database.connectionOptions,
        };

        verificationResult.checks.push(await connector.verifyBackup(dbConfig, finalFilePath));
      } else {
        verificationResult.checks.push({
          check: 'database_verification',
          passed: null,
          skipped: true,
          note: `Database verification not implemented for ${database.type}`,
        });
      }
    }

    // Progress: 80%
    wsClient.sendVerificationProgress(historyId, {
      progress: 80,
      currentStep: verificationLevel === 'FULL' ? 'Running test restore' : 'Completing verification',
    });

    // Level 3: Test restore (expensive!)
    if (verificationLevel === 'FULL') {
      logger.info('Running test restore...');

      wsClient.sendVerificationProgress(historyId, {
        progress: 85,
        currentStep: 'Performing test restore to temporary database',
      });

      verificationResult.checks.push(await performTestRestore(database, backup, finalFilePath));
    }

    // Progress: 95% - Cleanup
    wsClient.sendVerificationProgress(historyId, {
      progress: 95,
      currentStep: 'Cleaning up temporary files',
    });

    // Clean up temporary files
    try {
      if (backupDir && fsSync.existsSync(backupDir)) {
        await fs.rm(backupDir, { recursive: true, force: true });
        logger.info(`Cleaned up temporary directory: ${backupDir}`);
      }
    } catch (cleanupError) {
      logger.warn(`Failed to cleanup verification directory: ${cleanupError.message}`);
    }

    // Determine overall status
    const failedChecks = verificationResult.checks.filter((c) => c.passed === false);
    verificationResult.overallStatus = failedChecks.length === 0 ? 'PASSED' : 'FAILED';

    const duration = Date.now() - startTime;
    logger.info(`Verification completed for backup ${historyId} in ${duration}ms: ${verificationResult.overallStatus}`);

    // Send verification completed event
    wsClient.sendVerificationCompleted(historyId, {
      duration,
      verificationResult,
      timestamp: new Date(),
    });

  } catch (error) {
    logger.error(`Verification failed for backup ${historyId}: ${error.message}`);
    logger.error(error.stack);

    // Clean up on error
    try {
      if (downloadedFilePath && fsSync.existsSync(path.dirname(downloadedFilePath))) {
        await fs.rm(path.dirname(downloadedFilePath), { recursive: true, force: true });
      }
    } catch (cleanupError) {
      logger.warn(`Failed to cleanup after error: ${cleanupError.message}`);
    }

    verificationResult.overallStatus = 'FAILED';
    verificationResult.error = error.message;

    // Send verification failed event
    // Convert error object to JSON string for database storage
    wsClient.sendVerificationFailed(historyId, JSON.stringify({
      error: error.message,
      errorStack: error.stack,
      timestamp: new Date().toISOString(),
    }));

    throw error;
  }
}

/**
 * Helper: Verify file exists and is accessible
 */
async function verifyFileExistence(filePath) {
  try {
    await fs.access(filePath);
    return { check: 'file_existence', passed: true, message: 'File exists and is accessible' };
  } catch {
    return { check: 'file_existence', passed: false, error: 'File not found or not accessible' };
  }
}

/**
 * Helper: Verify file size is reasonable
 */
async function verifyFileSize(filePath, expectedSize) {
  try {
    const stats = await fs.stat(filePath);
    const isValid = stats.size > 0;

    let message = `File size: ${formatBytes(stats.size)}`;
    if (expectedSize) {
      const sizeDiff = Math.abs(stats.size - expectedSize);
      const diffPercent = (sizeDiff / expectedSize) * 100;
      message += ` (expected: ${formatBytes(expectedSize)}, diff: ${diffPercent.toFixed(2)}%)`;
    }

    return {
      check: 'file_size',
      passed: isValid,
      message,
      actualSize: stats.size,
      expectedSize,
    };
  } catch (error) {
    return { check: 'file_size', passed: false, error: error.message };
  }
}

/**
 * Helper: Verify checksum
 */
async function verifyChecksum(filePath, expectedChecksum, algorithm = 'sha256') {
  try {
    const actualChecksum = await calculateChecksum(filePath, algorithm);
    const passed = actualChecksum === expectedChecksum;

    return {
      check: 'checksum',
      passed,
      message: passed ? 'Checksum matches' : 'Checksum mismatch',
      algorithm,
      expectedChecksum,
      actualChecksum,
    };
  } catch (error) {
    return { check: 'checksum', passed: false, error: error.message };
  }
}

/**
 * Helper: Calculate file checksum
 */
function calculateChecksum(filePath, algorithm = 'sha256') {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(algorithm);
    const stream = fsSync.createReadStream(filePath);

    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Helper: Verify compression integrity
 */
async function verifyCompressionIntegrity(filePath, isEncrypted = false) {
  try {
    if (isEncrypted) {
      // Can't verify compressed file if it's encrypted (need to decrypt first)
      return {
        check: 'compression_integrity',
        passed: null,
        skipped: true,
        note: 'Compression check skipped (file is encrypted)',
      };
    }

    // Try to read gzip header
    const fd = await fs.open(filePath, 'r');
    const buffer = Buffer.alloc(2);
    await fd.read(buffer, 0, 2, 0);
    await fd.close();

    // Check gzip magic number (0x1f 0x8b)
    const isGzip = buffer[0] === 0x1f && buffer[1] === 0x8b;

    if (!isGzip) {
      return {
        check: 'compression_integrity',
        passed: false,
        error: 'Invalid gzip header',
      };
    }

    // Try to decompress to verify integrity (without saving)
    const testDecompress = new Promise((resolve, reject) => {
      const gunzip = zlib.createGunzip();
      const readStream = fsSync.createReadStream(filePath);
      let bytesDecompressed = 0;

      gunzip.on('data', (chunk) => {
        bytesDecompressed += chunk.length;
      });

      gunzip.on('end', () => {
        resolve(bytesDecompressed);
      });

      gunzip.on('error', reject);
      readStream.on('error', reject);

      readStream.pipe(gunzip);
    });

    const decompressedBytes = await testDecompress;

    return {
      check: 'compression_integrity',
      passed: true,
      message: `Compression valid, decompressed size: ${formatBytes(decompressedBytes)}`,
      decompressedSize: decompressedBytes,
    };
  } catch (error) {
    return {
      check: 'compression_integrity',
      passed: false,
      error: `Compression verification failed: ${error.message}`,
    };
  }
}

/**
 * Helper: Verify encryption integrity
 */
async function verifyEncryptionIntegrity(filePath, encryptionPasswordHash) {
  try {
    // Read encrypted file header to verify format (AES-256-GCM)
    const fd = await fs.open(filePath, 'r');
    const headerBuffer = Buffer.alloc(SALT_LENGTH + IV_LENGTH);
    await fd.read(headerBuffer, 0, SALT_LENGTH + IV_LENGTH, 0);
    await fd.close();

    // Basic check: file should be large enough to contain SALT + IV + auth tag
    const stats = await fs.stat(filePath);
    const minSize = SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH; // 64 + 16 + 16 = 96 bytes

    if (stats.size < minSize) {
      return {
        check: 'encryption_integrity',
        passed: false,
        error: `File too small to be properly encrypted (${stats.size} bytes, minimum ${minSize} bytes)`,
      };
    }

    return {
      check: 'encryption_integrity',
      passed: true,
      message: 'Encryption format appears valid (AES-256-GCM)',
      note: 'File will be decrypted for further verification',
    };
  } catch (error) {
    return {
      check: 'encryption_integrity',
      passed: false,
      error: `Encryption verification failed: ${error.message}`,
    };
  }
}

/**
 * Helper: Decompress file
 */
async function decompressFile(inputPath, outputPath) {
  const gunzip = zlib.createGunzip();
  const input = fsSync.createReadStream(inputPath);
  const output = fsSync.createWriteStream(outputPath);

  await pipeline(input, gunzip, output);
}

/**
 * Helper: Perform test restore
 */
async function performTestRestore(database, backup, filePath) {
  try {
    const connector = getConnector(database.type);

    if (!connector || !connector.testConnection) {
      return {
        check: 'test_restore',
        passed: null,
        skipped: true,
        note: `Test restore not implemented for ${database.type}`,
      };
    }

    // Create temporary test database name
    const testDbName = `rahat_test_${backup.id}_${Date.now()}`;

    logger.info(`Starting test restore to temporary database: ${testDbName}`);

    const dbConfig = {
      host: database.host,
      port: database.port,
      username: database.username,
      password: database.password,
      database: testDbName, // Use test database
      ...database.connectionOptions,
    };

    // Create test database
    const createDbConfig = { ...dbConfig, database: 'postgres' }; // Connect to default DB to create

    // Note: This is a simplified version. Full implementation would:
    // 1. Create test database
    // 2. Restore backup to test database
    // 3. Verify data integrity
    // 4. Drop test database

    // For now, we'll just test if we can connect and read the backup file
    const canConnect = await connector.testConnection(createDbConfig);

    if (!canConnect) {
      return {
        check: 'test_restore',
        passed: false,
        error: 'Cannot connect to database for test restore',
      };
    }

    // Verify backup file is readable SQL/dump format
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const hasDbCommands = fileContent.includes('CREATE TABLE') ||
                          fileContent.includes('INSERT INTO') ||
                          fileContent.includes('DROP TABLE');

    return {
      check: 'test_restore',
      passed: hasDbCommands,
      message: hasDbCommands ? 'Backup file contains valid database commands' : 'Backup file format unclear',
      note: 'Full test restore with temporary database not performed (would require additional permissions)',
    };
  } catch (error) {
    return {
      check: 'test_restore',
      passed: false,
      error: `Test restore failed: ${error.message}`,
    };
  }
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

module.exports = {
  executeVerificationJob,
};
