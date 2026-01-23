const httpStatus = require('http-status');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const zlib = require('zlib');
const { backupJobModel, backupHistoryModel, databaseModel, cloudStorageModel } = require('../models');
const { getConnector } = require('../utils/dbConnectors');
const { getCloudStorageConnector } = require('../utils/cloudStorage');
const databaseService = require('./database.service');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const { sendBackupNotification } = require('./email.service');
const prisma = require('../utils/database');
const { encryptFile, decryptFile, hashPassword } = require('../utils/encryption');

// Backup storage directory
const BACKUP_STORAGE_PATH = process.env.BACKUP_STORAGE_PATH || path.join(__dirname, '../../backups');

/**
 * Send email notification for backup status
 */
const sendBackupEmailNotification = async (userId, backupJob, dbConfig, status, details = {}) => {
  try {
    const notificationSettings = await prisma.notificationSettings.findUnique({
      where: { userId },
    });

    if (!notificationSettings || !notificationSettings.isActive || !notificationSettings.emailEnabled) {
      return;
    }

    // Check if user wants this type of notification
    if (status === 'success' && !notificationSettings.notifyOnSuccess) {
      return;
    }
    if (status === 'failed' && !notificationSettings.notifyOnFailure) {
      return;
    }

    const isSuccess = status === 'success';
    const subject = isSuccess
      ? `✅ Backup Başarılı - ${dbConfig.name}`
      : `❌ Backup Hatalı - ${dbConfig.name}`;

    const formatBytes = (bytes) => {
      if (!bytes) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
    };

    const formatDuration = (ms) => {
      if (!ms) return '0s';
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
      }
      return `${seconds}s`;
    };

    const text = isSuccess
      ? `Veritabanı: ${dbConfig.name}\nJob: ${backupJob.name}\nDurum: Başarılı\nDosya: ${details.fileName}\nBoyut: ${formatBytes(details.fileSize)}\nSüre: ${formatDuration(details.duration)}`
      : `Veritabanı: ${dbConfig.name}\nJob: ${backupJob.name}\nDurum: Hatalı\nHata: ${details.error}`;

    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: ${isSuccess ? '#4CAF50' : '#f44336'}; color: white; padding: 20px; text-align: center;">
        <h1 style="margin: 0;">${isSuccess ? '✅ Backup Başarılı' : '❌ Backup Hatalı'}</h1>
      </div>
      <div style="padding: 20px; border: 1px solid #ddd;">
        <h2 style="color: #333;">Backup Detayları</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Veritabanı:</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${dbConfig.name} (${dbConfig.type})</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Job Adı:</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${backupJob.name}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Durum:</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; color: ${isSuccess ? '#4CAF50' : '#f44336'}; font-weight: bold;">${isSuccess ? 'Başarılı' : 'Hatalı'}</td>
          </tr>
          ${
            isSuccess
              ? `
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Dosya Adı:</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${details.fileName}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Dosya Boyutu:</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${formatBytes(details.fileSize)}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Süre:</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${formatDuration(details.duration)}</td>
          </tr>
          `
              : `
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Hata Mesajı:</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; color: #f44336;">${details.error}</td>
          </tr>
          `
          }
          <tr>
            <td style="padding: 8px;"><strong>Tarih:</strong></td>
            <td style="padding: 8px;">${new Date().toLocaleString('tr-TR')}</td>
          </tr>
        </table>
      </div>
      <div style="background: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #666;">
        <p>Bu email otomatik olarak Backup System tarafından gönderilmiştir.</p>
      </div>
    </div>
    `;

    await sendBackupNotification(userId, subject, text, html);
    logger.info(`Email notification sent to user ${userId} for backup job ${backupJob.id}`);
  } catch (error) {
    logger.error(`Failed to send email notification: ${error.message}`);
    // Don't throw error, just log it - email failure shouldn't stop backup process
  }
};

/**
 * Ensure backup storage directory exists
 */
const ensureBackupDirectory = async () => {
  try {
    await fs.access(BACKUP_STORAGE_PATH);
  } catch {
    await fs.mkdir(BACKUP_STORAGE_PATH, { recursive: true });
  }
};

/**
 * Create a new backup job
 */
const createBackupJob = async (userId, jobData) => {
  // Verify database belongs to user
  const database = await databaseModel.findById(jobData.databaseId);
  if (!database) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Database not found');
  }
  if (database.userId !== userId) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied');
  }

  // Verify cloud storage if storage type is cloud
  if (jobData.storageType === 'cloud' && jobData.cloudStorageId) {
    const cloudStorage = await cloudStorageModel.findById(jobData.cloudStorageId);
    if (!cloudStorage) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Cloud storage not found');
    }
  }

  const backupJob = await backupJobModel.create(jobData);
  return backupJob;
};

/**
 * Get backup job by ID
 */
const getBackupJobById = async (id, userId) => {
  const backupJob = await backupJobModel.findById(id);
  if (!backupJob) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Backup job not found');
  }
  if (backupJob.database.userId !== userId) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied');
  }
  return backupJob;
};

/**
 * Get all backup jobs for a user
 */
const getUserBackupJobs = async (userId, filters = {}) => {
  return await backupJobModel.findByUserId(userId, filters);
};

/**
 * Update backup job
 */
const updateBackupJob = async (id, userId, updateData) => {
  await getBackupJobById(id, userId); // Verify ownership
  const updatedJob = await backupJobModel.update(id, updateData);
  if (!updatedJob) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Backup job not found');
  }
  return updatedJob;
};

/**
 * Delete backup job
 */
const deleteBackupJob = async (id, userId) => {
  await getBackupJobById(id, userId);
  await backupJobModel.delete(id);
  return { id };
};

/**
 * Execute a backup
 */
const executeBackup = async (backupJobId) => {
  const backupJob = await backupJobModel.findById(backupJobId);
  if (!backupJob) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Backup job not found');
  }

  // Check if there's already a running backup for this job (database-based check)
  const runningBackup = await prisma.backupHistory.findFirst({
    where: {
      backupJobId: parseInt(backupJobId),
      status: 'running',
    },
  });

  if (runningBackup) {
    logger.warn(`Backup job ${backupJobId} is already running, skipping...`);
    throw new ApiError(httpStatus.CONFLICT, 'Bu job için zaten çalışan bir backup var');
  }

  // Get database config with decrypted password
  const dbConfig = await databaseService.getDatabaseConfig(backupJob.databaseId);

  // CHECK IF DATABASE HAS AGENT - If yes, send to agent via WebSocket
  if (dbConfig.agentId) {
    logger.info(`Database ${dbConfig.name} is linked to agent ${dbConfig.agentId}, sending job to agent...`);

    let backupHistory = null;
    try {
      // Get agent details (need UUID for WebSocket)
      const agent = await prisma.agent.findUnique({
        where: { id: dbConfig.agentId },
      });

      if (!agent) {
        throw new ApiError(httpStatus.NOT_FOUND, `Agent with ID ${dbConfig.agentId} not found`);
      }

      logger.info(`Agent found: ${agent.agentId} (${agent.deviceName}) - Status: ${agent.status}`);

      // Check if agent is actually connected via WebSocket BEFORE creating history
      const { websocketService } = require('./index');
      if (!websocketService.isAgentOnline(agent.agentId)) {
        // Agent not connected - create "skipped" history so user knows what happened
        logger.warn(`Backup job ${backupJobId} skipped - agent ${agent.agentId} (${agent.deviceName}) is not connected`);

        await backupHistoryModel.create({
          backupJobId: parseInt(backupJobId),
          databaseId: parseInt(backupJob.databaseId),
          status: 'skipped',
          fileName: '',
          filePath: '',
          completedAt: new Date(),
          errorMessage: 'Agent bağlı değildi, backup atlandı. Bir sonraki zamanlamada tekrar denenecek.',
        });

        return {
          success: false,
          status: 'skipped',
          message: 'Agent bağlı değil, backup atlandı.',
        };
      }

      // Agent is connected - create "running" history entry
      const historyData = {
        backupJobId: parseInt(backupJobId),
        databaseId: parseInt(backupJob.databaseId),
        status: 'running',
        fileName: '',
        filePath: '',
      };
      logger.info(`Creating backup history for job ${backupJobId}`, historyData);
      backupHistory = await backupHistoryModel.create(historyData);

      // Get cloud storage config if configured
      // Note: cloudStorageModel.findById() automatically decrypts S3 credentials
      let cloudStorage = null;
      if (backupJob.cloudStorageId) {
        cloudStorage = await cloudStorageModel.findById(backupJob.cloudStorageId);
        logger.info(`Cloud storage loaded: id=${cloudStorage?.id}, type=${cloudStorage?.storageType}, hasAccessKey=${!!cloudStorage?.accessKeyId}, hasSecretKey=${!!cloudStorage?.secretAccessKey}`);
      }

      // Prepare job data for agent
      const jobData = {
        id: backupJob.id,
        database: {
          id: dbConfig.id,
          name: dbConfig.name,
          type: dbConfig.type,
          host: dbConfig.host,
          port: dbConfig.port,
          username: dbConfig.username,
          password: dbConfig.password,
          database: dbConfig.database,
        },
        backupType: backupJob.backupType || 'full',
        compression: backupJob.compression || false,
        isEncrypted: backupJob.isEncrypted || false,
        encryptionPasswordHash: backupJob.encryptionPasswordHash,
        storageType: backupJob.storageType || 'local',
        storage: cloudStorage ? {
          type: cloudStorage.storageType,
          // S3 fields
          accessKeyId: cloudStorage.accessKeyId,
          secretAccessKey: cloudStorage.secretAccessKey,
          region: cloudStorage.region,
          bucket: cloudStorage.bucket,
          path: cloudStorage.path,
          // Google Drive fields (decrypted by model)
          refreshToken: cloudStorage.refreshToken,
          folderId: cloudStorage.folderId,
          // Google OAuth credentials (from backend env)
          googleClientId: process.env.GOOGLE_CLIENT_ID,
          googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
          googleRedirectUri: process.env.GOOGLE_REDIRECT_URI,
        } : {},
      };

      // Log encryption settings being sent to agent
      logger.info(`Sending job to agent - isEncrypted: ${jobData.isEncrypted}, hasPasswordHash: ${!!jobData.encryptionPasswordHash}`);

      // Send job to agent via WebSocket (use agent UUID, not DB ID)
      const sent = await websocketService.sendJobToAgent(agent.agentId, jobData);

      if (!sent) {
        // Agent is not connected - mark backup as failed
        await backupHistoryModel.update(backupHistory.id, {
          status: 'failed',
          completedAt: new Date(),
          errorMessage: 'Agent bağlı değil. Desktop agent uygulamasının çalıştığından emin olun.',
        });
        throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, `Agent ${agent.agentId} (${agent.deviceName}) is not connected. Please make sure the desktop agent is running.`);
      }

      logger.info(`Backup job ${backupJobId} sent to agent ${agent.agentId}`);

      // Return immediately - agent will report back via WebSocket
      return {
        success: true,
        status: 'sent_to_agent',
        message: 'Backup job sent to agent for execution',
        agentId: agent.agentId,
        agentDevice: agent.deviceName,
      };
    } catch (error) {
      logger.error(`Failed to send job to agent: ${error.message}`);
      // If backup history was created, mark it as failed
      if (backupHistory) {
        await backupHistoryModel.update(backupHistory.id, {
          status: 'failed',
          completedAt: new Date(),
          errorMessage: error.message || 'Backup işlemi başlatılamadı',
        });
      }
      throw error;
    }
  }

  // NO AGENT = NO BACKUP
  // Database is on localhost (agent's PC), backend cannot access it
  logger.error(`Database ${dbConfig.name} has no agent configured. Backup requires an active agent.`);
  throw new ApiError(
    httpStatus.BAD_REQUEST,
    'Backup requires a desktop agent. The database is on localhost and cannot be accessed from the backend. Please ensure the desktop agent is running and the database is linked to an agent.'
  );
};

/**
 * Compress backup file using gzip
 */
const compressBackup = async (filePath) => {
  const output = `${filePath}.gz`;
  const inputStream = fsSync.createReadStream(filePath);
  const outputStream = fsSync.createWriteStream(output);
  const gzip = zlib.createGzip({ level: 9 });

  return new Promise((resolve, reject) => {
    outputStream.on('finish', () => resolve(output));
    outputStream.on('error', reject);
    inputStream.on('error', reject);
    gzip.on('error', reject);

    inputStream.pipe(gzip).pipe(outputStream);
  });
};

/**
 * Clean up old backups based on retention policy
 */
const cleanupOldBackups = async (backupJobId, retentionDays) => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const oldBackups = await backupHistoryModel.findByJobId(backupJobId, 1000);
  const backupJob = await backupJobModel.findById(backupJobId);

  for (const backup of oldBackups) {
    if (new Date(backup.startedAt) < cutoffDate && backup.status === 'success') {
      try {
        // Check if backup is from cloud storage
        if (backupJob && backupJob.cloudStorageId && (backupJob.storageType === 'google_drive' || backupJob.storageType === 's3')) {
          // Delete from cloud storage
          try {
            const cloudStorage = await cloudStorageModel.findById(backupJob.cloudStorageId);

            if (cloudStorage && cloudStorage.isActive) {
              const cloudConnector = getCloudStorageConnector(cloudStorage.storageType);
              const deleteResult = await cloudConnector.deleteBackup(cloudStorage, backup.filePath);

              if (deleteResult.success) {
                logger.info(`Cleaned up old backup from ${cloudStorage.storageType}: ${backup.fileName}`);
              } else {
                logger.warn(`Failed to delete old backup from cloud: ${deleteResult.error}`);
                continue; // Skip deleting history record if cloud delete failed
              }
            }
          } catch (error) {
            logger.error(`Error cleaning up backup from cloud storage: ${error.message}`);
            continue; // Skip deleting history record if cloud delete failed
          }
        } else {
          // Delete local file
          await fs.unlink(backup.filePath);
          logger.info(`Cleaned up old local backup: ${backup.fileName}`);
        }

        // Delete history record only after successful file deletion
        await backupHistoryModel.delete(backup.id);
      } catch (error) {
        logger.error(`Failed to cleanup backup ${backup.id}: ${error.message}`);
      }
    }
  }
};

/**
 * Get backup history
 */
const getBackupHistory = async (userId, filters = {}) => {
  return await backupHistoryModel.findByUserId(userId, filters);
};

/**
 * Get backup history by ID
 */
const getBackupHistoryById = async (id, userId) => {
  const backup = await backupHistoryModel.findById(id);
  if (!backup) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Backup not found');
  }
  if (backup.database.userId !== userId) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied');
  }
  return backup;
};

/**
 * Download backup file
 */
const getBackupFilePath = async (id, userId) => {
  const backup = await getBackupHistoryById(id, userId);
  if (backup.status !== 'success') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Backup is not available for download');
  }

  // Check if backup is from cloud storage
  // Handle old backups that might not have a backupJobId
  const backupJob = backup.backupJobId ? await backupJobModel.findById(backup.backupJobId) : null;

  // If cloud storage (Google Drive or S3), download first
  if (backupJob && backupJob.cloudStorageId && (backupJob.storageType === 'google_drive' || backupJob.storageType === 's3')) {
    const cloudStorage = await cloudStorageModel.findById(backupJob.cloudStorageId);

    if (cloudStorage && cloudStorage.isActive) {
      // Create temporary download path
      const tempDownloadPath = path.join(BACKUP_STORAGE_PATH, 'temp', backup.fileName);
      await fs.mkdir(path.dirname(tempDownloadPath), { recursive: true });

      const cloudConnector = getCloudStorageConnector(cloudStorage.storageType);

      // Download from cloud storage
      const downloadResult = await cloudConnector.downloadBackup(
        cloudStorage,
        backup.filePath, // This is the cloud fileId or S3 key
        tempDownloadPath
      );

      if (!downloadResult.success) {
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Failed to download from cloud: ${downloadResult.error}`);
      }

      return {
        filePath: tempDownloadPath,
        fileName: backup.fileName,
        isTemp: true, // Flag to clean up after download
      };
    }
  }

  // Local file - check if exists
  try {
    await fs.access(backup.filePath);
    return {
      filePath: backup.filePath,
      fileName: backup.fileName,
      isTemp: false,
    };
  } catch {
    throw new ApiError(httpStatus.NOT_FOUND, 'Backup file not found');
  }
};

/**
 * Delete backup
 */
const deleteBackup = async (id, userId) => {
  const backup = await getBackupHistoryById(id, userId);

  // Check if backup is from cloud storage
  // Handle old backups that might not have a backupJobId
  const backupJob = backup.backupJobId ? await backupJobModel.findById(backup.backupJobId) : null;

  if (backupJob && backupJob.cloudStorageId && (backupJob.storageType === 'google_drive' || backupJob.storageType === 's3')) {
    // Delete from cloud storage
    try {
      const cloudStorage = await cloudStorageModel.findById(backupJob.cloudStorageId);

      if (cloudStorage && cloudStorage.isActive) {
        const cloudConnector = getCloudStorageConnector(cloudStorage.storageType);
        const deleteResult = await cloudConnector.deleteBackup(cloudStorage, backup.filePath);

        if (deleteResult.success) {
          logger.info(`Successfully deleted backup from ${cloudStorage.storageType}: ${backup.filePath}`);
        } else {
          logger.warn(`Failed to delete backup from cloud storage: ${deleteResult.error}`);
        }
      }
    } catch (error) {
      logger.error(`Error deleting backup from cloud storage: ${error.message}`);
      // Continue with deletion even if cloud delete fails
    }
  } else {
    // Delete local file
    try {
      await fs.unlink(backup.filePath);
      logger.info(`Successfully deleted local backup file: ${backup.filePath}`);
    } catch (error) {
      logger.error(`Failed to delete local backup file: ${error.message}`);
    }
  }

  // Delete history record
  await backupHistoryModel.delete(id);
  return backup;
};

/**
 * Get backup statistics for user
 */
const getBackupStats = async (userId) => {
  return await backupHistoryModel.getStats(userId);
};

/**
 * Restore a backup
 */
const restoreBackup = async (historyId, userId) => {
  // Get backup history with ownership verification
  const backup = await getBackupHistoryById(historyId, userId);

  if (backup.status !== 'success') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Only successful backups can be restored');
  }

  // Get database config with decrypted password
  const dbConfig = await databaseService.getDatabaseConfig(backup.databaseId);

  // CHECK IF DATABASE HAS AGENT - If yes, send to agent via WebSocket
  if (dbConfig.agentId) {
    logger.info(`Database ${dbConfig.name} is linked to agent ${dbConfig.agentId}, sending restore to agent...`);

    try {
      // Get agent details (need UUID for WebSocket)
      const agent = await prisma.agent.findUnique({
        where: { id: dbConfig.agentId },
      });

      if (!agent) {
        throw new ApiError(httpStatus.NOT_FOUND, `Agent with ID ${dbConfig.agentId} not found`);
      }

      logger.info(`Agent found: ${agent.agentId} (${agent.deviceName}) - Status: ${agent.status}`);

      // Get backup job (if exists) for storage info (not required for encryption)
      const backupJob = backup.backupJobId ? await backupJobModel.findById(backup.backupJobId) : null;

      logger.info(`Backup job for restore: jobId=${backupJob?.id}, storageType=${backupJob?.storageType}, cloudStorageId=${backupJob?.cloudStorageId}`);

      // Get cloud storage config if configured
      let cloudStorage = null;
      let storageType = 'local';

      if (backupJob && backupJob.cloudStorageId) {
        cloudStorage = await cloudStorageModel.findById(backupJob.cloudStorageId);
        storageType = backupJob.storageType || 'local';
        logger.info(`Cloud storage loaded: id=${cloudStorage?.id}, type=${cloudStorage?.storageType}`);
      }

      // Handle case where backup job was deleted but backup history still has cloud URL
      // Detect storage type from filePath if it's a URL
      if (!backupJob && backup.filePath && (backup.filePath.startsWith('http://') || backup.filePath.startsWith('https://'))) {
        logger.warn(`Backup job deleted. Attempting to detect storage type from filePath: ${backup.filePath}`);

        // Detect S3 URL patterns
        if (backup.filePath.includes('.s3.') || backup.filePath.includes('s3.amazonaws.com')) {
          storageType = 's3';
          logger.info('Detected storage type as S3 from URL pattern');

          // Try to find an active S3 storage config for this user
          const allCloudStorages = await cloudStorageModel.findByUserId(userId);
          const s3Storage = allCloudStorages.find(cs => cs.storageType === 's3' && cs.isActive);

          if (s3Storage) {
            cloudStorage = s3Storage;
            logger.info(`Using active S3 cloud storage config (ID: ${s3Storage.id}) for restore`);
          } else {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Backup is stored in S3 but no active S3 cloud storage configuration found. The original backup job may have been deleted.');
          }
        }
        // Detect Google Drive URL patterns
        else if (backup.filePath.includes('drive.google.com') || backup.filePath.includes('googleapis.com')) {
          storageType = 'google_drive';
          logger.info('Detected storage type as Google Drive from URL pattern');

          // Try to find an active Google Drive storage config
          const allCloudStorages = await cloudStorageModel.findByUserId(userId);
          const gdStorage = allCloudStorages.find(cs => cs.storageType === 'google_drive' && cs.isActive);

          if (gdStorage) {
            cloudStorage = gdStorage;
            logger.info(`Using active Google Drive cloud storage config (ID: ${gdStorage.id}) for restore`);
          } else {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Backup is stored in Google Drive but no active Google Drive configuration found. The original backup job may have been deleted.');
          }
        }
      }

      // Prepare restore data for agent
      // Convert BigInt to string for JSON serialization
      const restoreData = {
        historyId: backup.id,
        database: {
          id: dbConfig.id,
          name: dbConfig.name,
          database: dbConfig.database, // Actual database name (may differ from connection name)
          type: dbConfig.type,
          host: dbConfig.host,
          port: dbConfig.port,
          username: dbConfig.username,
          password: dbConfig.password,
        },
        backup: {
          fileName: backup.fileName,
          filePath: backup.filePath, // Cloud fileId or S3 key/URL
          fileSize: backup.fileSize ? backup.fileSize.toString() : '0', // Convert BigInt to string
          isEncrypted: backup.isEncrypted,
          // Extract S3 key from URL if storage type is s3
          storageKey: storageType === 's3' && backup.filePath.startsWith('http')
            ? backup.filePath.split('/').slice(3).join('/') // Extract key from URL
            : backup.filePath,
        },
        isEncrypted: backup.isEncrypted || false,
        encryptionPasswordHash: backup.encryptionPasswordHash || backupJob?.encryptionPasswordHash, // Prefer history over job
        storageType: storageType,
        storage: cloudStorage ? {
          type: cloudStorage.storageType,
          // S3 fields
          accessKeyId: cloudStorage.accessKeyId,
          secretAccessKey: cloudStorage.secretAccessKey,
          region: cloudStorage.region,
          bucket: cloudStorage.bucket,
          path: cloudStorage.path,
          // Google Drive fields (decrypted by model)
          refreshToken: cloudStorage.refreshToken,
          folderId: cloudStorage.folderId,
          // Google OAuth credentials (from backend env)
          googleClientId: process.env.GOOGLE_CLIENT_ID,
          googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
          googleRedirectUri: process.env.GOOGLE_REDIRECT_URI,
        } : {},
      };

      // Create restore history record with "running" status
      const restoreHistoryRecord = await prisma.restoreHistory.create({
        data: {
          backupHistoryId: backup.id,
          status: 'running',
          startedAt: new Date(),
          restoredBy: userId,
          databaseName: dbConfig.name,
        },
      });

      // Update backup history with last restore status
      await prisma.backupHistory.update({
        where: { id: backup.id },
        data: {
          lastRestoreStatus: 'running',
          lastRestoreStartedAt: new Date(),
          lastRestoreCompletedAt: null,
          lastRestoreDuration: null,
          lastRestoreError: null,
        },
      });

      logger.info(`Restore tracking created: restoreHistoryId=${restoreHistoryRecord.id}, status=running`);

      // Send restore to agent via WebSocket (use agent UUID, not DB ID)
      const { websocketService } = require('./index');
      const sent = await websocketService.sendRestoreToAgent(agent.agentId, restoreData);

      if (!sent) {
        // Agent is not connected - update restore status to failed
        await prisma.restoreHistory.update({
          where: { id: restoreHistoryRecord.id },
          data: {
            status: 'failed',
            completedAt: new Date(),
            duration: 0,
            errorMessage: 'Agent is not connected',
          },
        });

        await prisma.backupHistory.update({
          where: { id: backup.id },
          data: {
            lastRestoreStatus: 'failed',
            lastRestoreCompletedAt: new Date(),
            lastRestoreDuration: 0,
            lastRestoreError: 'Agent is not connected',
          },
        });

        throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, `Agent ${agent.agentId} (${agent.deviceName}) is not connected. Please make sure the desktop agent is running.`);
      }

      logger.info(`Restore request sent to agent ${agent.agentId}`);

      // Return immediately - agent will report back via WebSocket
      return {
        success: true,
        status: 'sent_to_agent',
        message: 'Restore request sent to agent for execution',
        agentId: agent.agentId,
        agentDevice: agent.deviceName,
        restoreHistoryId: restoreHistoryRecord.id,
      };
    } catch (error) {
      logger.error(`Failed to send restore to agent: ${error.message}`);
      throw error;
    }
  }

  // NO AGENT = NO RESTORE
  // Database is on localhost (agent's PC), backend cannot access it
  logger.error(`Database ${dbConfig.name} has no agent configured. Restore requires an active agent.`);
  throw new ApiError(
    httpStatus.BAD_REQUEST,
    'Restore requires a desktop agent. The database is on localhost and cannot be accessed from the backend. Please ensure the desktop agent is running and the database is linked to an agent.'
  );
};

/**
 * Get the last successful full backup for a database (across all jobs)
 * @param {number} databaseId
 * @returns {Promise<Object|null>}
 */
const getLastFullBackupForDatabase = async (databaseId) => {
  try {
    const lastFullBackup = await prisma.backupHistory.findFirst({
      where: {
        databaseId: parseInt(databaseId),
        backupType: 'full',
        status: 'success',
      },
      orderBy: {
        completedAt: 'desc',
      },
    });
    return lastFullBackup;
  } catch (error) {
    logger.error(`Error finding last full backup for database ${databaseId}: ${error.message}`);
    return null;
  }
};

/**
 * Get the last successful full backup for a specific job
 * @param {number} backupJobId
 * @returns {Promise<Object|null>}
 */
const getLastFullBackup = async (backupJobId) => {
  try {
    const lastFullBackup = await prisma.backupHistory.findFirst({
      where: {
        backupJobId: parseInt(backupJobId),
        backupType: 'full',
        status: 'success',
      },
      orderBy: {
        completedAt: 'desc',
      },
    });
    return lastFullBackup;
  } catch (error) {
    logger.error(`Error finding last full backup for job ${backupJobId}: ${error.message}`);
    return null;
  }
};

/**
 * Get the last successful backup of any type for a job
 * @param {number} backupJobId
 * @returns {Promise<Object|null>}
 */
const getLastSuccessfulBackup = async (backupJobId) => {
  try {
    const lastBackup = await prisma.backupHistory.findFirst({
      where: {
        backupJobId: parseInt(backupJobId),
        status: 'success',
      },
      orderBy: {
        completedAt: 'desc',
      },
    });
    return lastBackup;
  } catch (error) {
    logger.error(`Error finding last successful backup for job ${backupJobId}: ${error.message}`);
    return null;
  }
};

/**
 * Check if differential backup chain is valid
 * @param {number} backupJobId
 * @returns {Promise<boolean>}
 */
const checkDifferentialChainValid = async (backupJobId) => {
  try {
    const lastFullBackup = await getLastFullBackup(backupJobId);
    // Chain is valid if there's a successful full backup
    return lastFullBackup !== null;
  } catch (error) {
    logger.error(`Error checking differential chain for job ${backupJobId}: ${error.message}`);
    return false;
  }
};

/**
 * Verify backup integrity
 * @param {number} backupHistoryId
 * @param {string} verificationLevel - 'BASIC', 'DATABASE', 'FULL'
 * @returns {Promise<Object>}
 */
const verifyBackup = async (backupHistoryId, verificationLevel = 'BASIC', userId = null) => {
  const backup = await backupHistoryModel.findById(backupHistoryId);

  if (!backup) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Backup not found');
  }

  if (backup.status !== 'success') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Only successful backups can be verified');
  }

  // Verify ownership if userId provided
  if (userId && backup.database.userId !== userId) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied');
  }

  logger.info(`Starting backup verification for backup ${backupHistoryId}, level: ${verificationLevel}`);

  // AGENT-BASED VERIFICATION (Production-ready!)
  // If database has an agent, send verification to agent
  if (backup.database.agentId) {
    logger.info(`Database has agent ${backup.database.agentId}, routing verification to agent`);

    const agent = await prisma.agent.findUnique({
      where: { id: backup.database.agentId },
    });

    if (!agent) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Agent not found');
    }

    // Check if agent is online
    const websocketService = require('./websocket.service');
    if (!websocketService.isAgentOnline(agent.agentId)) {
      throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'Agent is offline. Please start the desktop agent and try again.');
    }

    // Load backup job for encryption password if needed
    const backupJob = backup.backupJobId ? await backupJobModel.findById(backup.backupJobId) : null;

    // Load cloud storage config
    let storage = null;
    let storageType = 'local';

    if (backupJob && backupJob.cloudStorageId) {
      const cloudStorage = await cloudStorageModel.findById(backupJob.cloudStorageId);
      if (cloudStorage && cloudStorage.isActive) {
        storageType = cloudStorage.storageType;
        // Decrypt credentials before sending to agent
        storage = cloudStorageModel.decryptCredentials(cloudStorage);
      }
    }

    // Handle case where backup job was deleted but backup history still has cloud URL
    // Detect storage type from filePath if it's a URL
    if (storageType === 'local' && backup.filePath && (backup.filePath.startsWith('http://') || backup.filePath.startsWith('https://'))) {
      logger.warn(`Backup job may have been deleted. Attempting to detect storage type from filePath: ${backup.filePath}`);

      // Detect S3 URL patterns
      if (backup.filePath.includes('.s3.') || backup.filePath.includes('s3.amazonaws.com')) {
        storageType = 's3';
        logger.info('Detected storage type as S3 from URL pattern');

        // Try to find an active S3 storage config for this database's user
        const allCloudStorages = await cloudStorageModel.findByUserId(backup.database.userId);
        const s3Storage = allCloudStorages.find(cs => cs.storageType === 's3' && cs.isActive);

        if (s3Storage) {
          storage = cloudStorageModel.decryptCredentials(s3Storage);
          logger.info(`Using active S3 cloud storage config (ID: ${s3Storage.id}) for verification`);
        } else {
          throw new ApiError(httpStatus.BAD_REQUEST, 'Backup is stored in S3 but no active S3 cloud storage configuration found. The original backup job may have been deleted.');
        }
      }
      // Detect Google Drive URL patterns
      else if (backup.filePath.includes('drive.google.com') || backup.filePath.includes('googleapis.com')) {
        storageType = 'google_drive';
        logger.info('Detected storage type as Google Drive from URL pattern');

        // Try to find an active Google Drive storage config
        const allCloudStorages = await cloudStorageModel.findByUserId(backup.database.userId);
        const gdStorage = allCloudStorages.find(cs => cs.storageType === 'google_drive' && cs.isActive);

        if (gdStorage) {
          storage = cloudStorageModel.decryptCredentials(gdStorage);
          logger.info(`Using active Google Drive cloud storage config (ID: ${gdStorage.id}) for verification`);
        } else {
          throw new ApiError(httpStatus.BAD_REQUEST, 'Backup is stored in Google Drive but no active Google Drive configuration found. The original backup job may have been deleted.');
        }
      }
    }

    // Prepare verification data for agent (convert BigInt to Number/String)
    const verificationData = {
      historyId: Number(backupHistoryId),
      database: {
        id: Number(backup.database.id),
        name: backup.database.name,
        type: backup.database.type,
        host: backup.database.host,
        port: Number(backup.database.port),
        username: backup.database.username,
        password: backup.database.password,
        database: backup.database.database,
        connectionOptions: backup.database.connectionOptions,
      },
      backup: {
        id: Number(backup.id),
        fileName: backup.fileName,
        filePath: backup.filePath,
        storageKey: backup.storageKey,
        fileSize: backup.fileSize ? Number(backup.fileSize) : 0,
        checksumValue: backup.checksumValue,
        checksumAlgorithm: backup.checksumAlgorithm || 'sha256',
      },
      storageType,
      storage: storage ? {
        type: storage.storageType,
        // S3 fields
        accessKeyId: storage.accessKeyId,
        secretAccessKey: storage.secretAccessKey,
        region: storage.region,
        bucket: storage.bucket,
        path: storage.path,
        // Google Drive fields (use same field names as backup job for consistency)
        refreshToken: storage.refreshToken,
        folderId: storage.folderId,
        googleClientId: process.env.GOOGLE_CLIENT_ID,
        googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
        googleRedirectUri: process.env.GOOGLE_REDIRECT_URI,
      } : null,
      verificationLevel,
      isEncrypted: backup.isEncrypted,
      encryptionPasswordHash: backup.encryptionPasswordHash || backupJob?.encryptionPasswordHash, // Prefer history over job
    };

    // Send verification request to agent
    try {
      const result = await websocketService.sendVerificationToAgent(agent.agentId, verificationData);
      logger.info(`Verification completed via agent: ${backupHistoryId}`);
      return result;
    } catch (error) {
      logger.error(`Agent verification failed: ${error.message}`);
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Verification via agent failed: ${error.message}`);
    }
  }

  // FALLBACK: Backend-based verification (only for databases without agent - legacy support)
  logger.info(`No agent found for database, using backend verification (legacy mode)`);

  let verificationResult = {
    backupHistoryId,
    verificationMethod: verificationLevel,
    checks: [],
    overallStatus: 'PENDING',
  };

  try {
    // Get file path (download from cloud if needed)
    let localFilePath = backup.filePath;
    let shouldCleanupFile = false;

    const backupJob = backup.backupJobId ? await backupJobModel.findById(backup.backupJobId) : null;

    // Download from cloud if needed
    if (backupJob && backupJob.cloudStorageId && (backupJob.storageType === 'google_drive' || backupJob.storageType === 's3')) {
      const cloudStorage = await cloudStorageModel.findById(backupJob.cloudStorageId);

      if (cloudStorage && cloudStorage.isActive) {
        const tempDownloadPath = path.join(BACKUP_STORAGE_PATH, 'temp', 'verify', backup.fileName);
        await fs.mkdir(path.dirname(tempDownloadPath), { recursive: true });

        const cloudConnector = getCloudStorageConnector(cloudStorage.storageType);
        logger.info(`Downloading backup from ${cloudStorage.storageType} for verification`);

        const downloadResult = await cloudConnector.downloadBackup(cloudStorage, backup.filePath, tempDownloadPath);

        if (!downloadResult.success) {
          throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Failed to download from cloud: ${downloadResult.error}`);
        }

        localFilePath = tempDownloadPath;
        shouldCleanupFile = true;
      }
    }

    // Level 1: Basic Checks
    logger.info('Running basic verification checks...');
    verificationResult.checks.push(await verifyFileExistence(localFilePath));
    verificationResult.checks.push(await verifyFileSize(localFilePath, backup.fileSize));
    verificationResult.checks.push(await verifyChecksum(localFilePath, backup));

    if (backup.fileName.replace('.enc', '').endsWith('.gz')) {
      verificationResult.checks.push(await verifyCompressionIntegrity(localFilePath));
    }

    if (backup.isEncrypted && backupJob) {
      verificationResult.checks.push(await verifyEncryptionIntegrity(localFilePath, backupJob));
    }

    // Level 2: Database-specific verification
    if (verificationLevel === 'DATABASE' || verificationLevel === 'FULL') {
      logger.info('Running database-specific verification...');
      const dbConfig = await databaseService.getDatabaseConfig(backup.databaseId);
      const connector = getConnector(dbConfig.type);

      if (connector.verifyBackup) {
        verificationResult.checks.push(await connector.verifyBackup(dbConfig, localFilePath));
      } else {
        verificationResult.checks.push({
          check: 'database_verification',
          passed: null,
          skipped: true,
          note: `Database verification not implemented for ${dbConfig.type}`,
        });
      }
    }

    // Level 3: Test restore (expensive!)
    if (verificationLevel === 'FULL') {
      logger.info('Running test restore...');
      verificationResult.checks.push(await performTestRestore(backup, localFilePath));
    }

    // Clean up downloaded file
    if (shouldCleanupFile) {
      try {
        await fs.unlink(localFilePath);
      } catch (error) {
        logger.warn(`Failed to cleanup downloaded file: ${error.message}`);
      }
    }

    // Determine overall status
    const failedChecks = verificationResult.checks.filter((c) => c.passed === false);
    verificationResult.overallStatus = failedChecks.length === 0 ? 'PASSED' : 'FAILED';

    // Update database
    await backupHistoryModel.update(backupHistoryId, {
      isVerified: true,
      verificationStatus: verificationResult.overallStatus,
      verificationMethod: verificationLevel,
      verificationError: failedChecks.length > 0 ? failedChecks.map((c) => c.error).join('; ') : null,
      verificationCompletedAt: new Date(),
    });

    logger.info(`Backup verification completed: ${backupHistoryId}, status: ${verificationResult.overallStatus}`);

    return verificationResult;
  } catch (error) {
    logger.error(`Backup verification failed: ${error.message}`);

    await backupHistoryModel.update(backupHistoryId, {
      isVerified: true,
      verificationStatus: 'FAILED',
      verificationError: error.message,
      verificationCompletedAt: new Date(),
    });

    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Verification failed: ${error.message}`);
  }
};

/**
 * Helper: Verify file exists and is accessible
 */
const verifyFileExistence = async (filePath) => {
  try {
    await fs.access(filePath);
    return { check: 'file_existence', passed: true, message: 'File exists and is accessible' };
  } catch {
    return { check: 'file_existence', passed: false, error: 'File not found or not accessible' };
  }
};

/**
 * Helper: Verify file size is reasonable
 */
const verifyFileSize = async (filePath, expectedSize) => {
  try {
    const stats = await fs.stat(filePath);
    const isValid = stats.size > 0;
    const sizeMatch = expectedSize ? stats.size === Number(expectedSize) : true;

    return {
      check: 'file_size',
      passed: isValid && sizeMatch,
      actual: stats.size,
      expected: expectedSize,
      message: isValid && sizeMatch ? 'File size is valid' : 'File size validation failed',
      error: !isValid ? 'File is empty' : !sizeMatch ? 'File size mismatch' : null,
    };
  } catch (error) {
    return { check: 'file_size', passed: false, error: error.message };
  }
};

/**
 * Helper: Calculate and verify checksum
 */
const verifyChecksum = async (filePath, backup) => {
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256');
  const stream = fsSync.createReadStream(filePath);

  return new Promise((resolve) => {
    stream.on('data', (data) => hash.update(data));
    stream.on('end', async () => {
      const checksum = hash.digest('hex');

      // If this is the first time, save the checksum
      if (!backup.checksumValue) {
        await backupHistoryModel.update(backup.id, {
          checksumAlgorithm: 'SHA256',
          checksumValue: checksum,
        });
        resolve({
          check: 'checksum',
          passed: true,
          checksum,
          message: 'Checksum calculated and saved',
          note: 'First calculation',
        });
      } else {
        // Verify against stored checksum
        const isValid = checksum === backup.checksumValue;
        resolve({
          check: 'checksum',
          passed: isValid,
          checksum,
          expected: backup.checksumValue,
          message: isValid ? 'Checksum validation passed' : 'Checksum mismatch detected',
          error: isValid ? null : 'Checksum mismatch - file may be corrupted',
        });
      }
    });
    stream.on('error', (error) => {
      resolve({ check: 'checksum', passed: false, error: error.message });
    });
  });
};

/**
 * Helper: Verify compression integrity
 */
const verifyCompressionIntegrity = async (filePath) => {
  try {
    const inputStream = fsSync.createReadStream(filePath);
    const gunzip = zlib.createGunzip();
    let bytesRead = 0;

    return new Promise((resolve) => {
      gunzip.on('data', (chunk) => {
        bytesRead += chunk.length;
      });
      gunzip.on('end', () => {
        resolve({
          check: 'compression_integrity',
          passed: true,
          uncompressedSize: bytesRead,
          message: 'Compression integrity verified',
        });
      });
      gunzip.on('error', (error) => {
        resolve({
          check: 'compression_integrity',
          passed: false,
          error: `Compression corrupted: ${error.message}`,
        });
      });
      inputStream.pipe(gunzip);
      inputStream.on('error', (error) => {
        resolve({
          check: 'compression_integrity',
          passed: false,
          error: error.message,
        });
      });
    });
  } catch (error) {
    return { check: 'compression_integrity', passed: false, error: error.message };
  }
};

/**
 * Helper: Verify encryption integrity
 */
const verifyEncryptionIntegrity = async (filePath, backupJob) => {
  try {
    if (!backupJob || !backupJob.encryptionPasswordHash) {
      return {
        check: 'encryption_integrity',
        passed: false,
        error: 'Encryption password not available',
      };
    }

    // Test decrypt first few bytes to verify encryption is valid
    const tempPath = `${filePath}.verify_test`;

    try {
      await decryptFile(filePath, tempPath, backupJob.encryptionPasswordHash);
      await fs.unlink(tempPath); // Clean up

      return {
        check: 'encryption_integrity',
        passed: true,
        message: 'Encryption integrity verified',
      };
    } catch (error) {
      // Clean up if exists
      try {
        await fs.unlink(tempPath);
      } catch {}

      return {
        check: 'encryption_integrity',
        passed: false,
        error: `Decryption test failed: ${error.message}`,
      };
    }
  } catch (error) {
    return {
      check: 'encryption_integrity',
      passed: false,
      error: error.message,
    };
  }
};

/**
 * Helper: Perform test restore (advanced, expensive!)
 */
const performTestRestore = async (backup, filePath) => {
  const startTime = Date.now();

  try {
    const dbConfig = await databaseService.getDatabaseConfig(backup.databaseId);

    // Create temporary test database name
    const testDbName = `test_restore_${backup.id}_${Date.now()}`;
    const testDbConfig = { ...dbConfig, database: testDbName };

    // Get connector
    const connector = getConnector(dbConfig.type);

    if (!connector.performTestRestore) {
      return {
        check: 'test_restore',
        passed: null,
        skipped: true,
        note: `Test restore not implemented for ${dbConfig.type}`,
      };
    }

    // Perform test restore
    logger.info(`Performing test restore to temporary database: ${testDbName}`);
    const result = await connector.performTestRestore(testDbConfig, filePath);
    const duration = Date.now() - startTime;

    // Update backup history with test restore info
    await backupHistoryModel.update(backup.id, {
      testRestoreAttempted: true,
      testRestoreSuccess: result.success,
      testRestoreDuration: duration,
      testRestoreLog: result.log || null,
    });

    return {
      check: 'test_restore',
      passed: result.success,
      duration,
      message: result.success ? 'Test restore completed successfully' : 'Test restore failed',
      error: result.success ? null : result.error,
      log: result.log,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      check: 'test_restore',
      passed: false,
      duration,
      error: error.message,
    };
  }
};

/**
 * Handle backup completed event from agent
 * Called when agent successfully completes a backup
 */
const handleAgentBackupCompleted = async (jobId, result) => {
  try {
    logger.info(`Agent backup completed for job ${jobId}:`, result);

    // Find the backup history entry (most recent one with this jobId)
    const backupHistory = await prisma.backupHistory.findFirst({
      where: { backupJobId: parseInt(jobId) },
      orderBy: { startedAt: 'desc' },
    });

    if (!backupHistory) {
      logger.error(`Backup history not found for job ${jobId}`);
      return;
    }

    // Get backup job to determine storage type
    const backupJob = await backupJobModel.findById(jobId);
    const storageType = backupJob?.storageType || 's3';

    // Update backup history
    await backupHistoryModel.update(backupHistory.id, {
      status: 'success',
      fileName: result.fileName,
      filePath: result.storageUrl || result.filePath,
      storageKey: result.storageKey || result.key || result.fileName, // Save S3 key for verification
      fileSize: result.fileSize,
      isEncrypted: result.isEncrypted || false,
      encryptionPasswordHash: backupJob?.encryptionPasswordHash, // Store hash in history for restore
      completedAt: new Date(),
    });

    // Update backup job (already fetched above)
    await backupJobModel.update(jobId, {
      lastRunAt: new Date(),
    });

    // Send email notification
    const dbConfig = await databaseService.getDatabaseConfig(backupJob.databaseId);
    await sendBackupEmailNotification(dbConfig.userId, backupJob, dbConfig, 'success', {
      fileName: result.fileName,
      fileSize: result.fileSize,
      duration: result.duration,
    });

    logger.info(`Backup history updated for job ${jobId}: completed`);
  } catch (error) {
    logger.error(`Error handling agent backup completed: ${error.message}`);
  }
};

/**
 * Handle backup failed event from agent
 * Called when agent fails to complete a backup
 */
const handleAgentBackupFailed = async (jobId, errorMessage) => {
  try {
    logger.error(`Agent backup failed for job ${jobId}: ${errorMessage}`);

    // Find the backup history entry
    const backupHistory = await prisma.backupHistory.findFirst({
      where: { backupJobId: parseInt(jobId) },
      orderBy: { startedAt: 'desc' },
    });

    if (!backupHistory) {
      logger.error(`Backup history not found for job ${jobId}`);
      return;
    }

    // Update backup history
    await backupHistoryModel.update(backupHistory.id, {
      status: 'failed',
      errorMessage: errorMessage,
      completedAt: new Date(),
    });

    // Update backup job
    const backupJob = await backupJobModel.findById(jobId);
    await backupJobModel.update(jobId, {
      lastRunAt: new Date(),
    });

    // Send email notification
    const dbConfig = await databaseService.getDatabaseConfig(backupJob.databaseId);
    await sendBackupEmailNotification(dbConfig.userId, backupJob, dbConfig, 'failed', {
      error: errorMessage,
    });

    logger.info(`Backup history updated for job ${jobId}: failed`);
  } catch (error) {
    logger.error(`Error handling agent backup failed: ${error.message}`);
  }
};

/**
 * Handle verification completed event from agent
 * @param {number} historyId - Backup history ID
 * @param {Object} data - Verification result data from agent
 */
const handleAgentVerificationCompleted = async (historyId, data) => {
  try {
    logger.info(`Handling agent verification completed for backup ${historyId}`);

    const { verificationResult, duration } = data;

    // Update backup history
    await backupHistoryModel.update(historyId, {
      isVerified: true,
      verificationStatus: verificationResult.overallStatus,
      verificationMethod: verificationResult.verificationMethod,
      verificationError: null,
      verificationCompletedAt: new Date(),
    });

    logger.info(`Backup verification completed for backup ${historyId}: ${verificationResult.overallStatus} (${duration}ms)`);
  } catch (error) {
    logger.error(`Error handling agent verification completed: ${error.message}`);
  }
};

/**
 * Handle verification failed event from agent
 * @param {number} historyId - Backup history ID
 * @param {string} errorMessage - Error message from agent
 */
const handleAgentVerificationFailed = async (historyId, errorMessage) => {
  try {
    logger.info(`Handling agent verification failed for backup ${historyId}`);

    // Update backup history
    await backupHistoryModel.update(historyId, {
      isVerified: true,
      verificationStatus: 'FAILED',
      verificationError: errorMessage,
      verificationCompletedAt: new Date(),
    });

    logger.info(`Backup verification failed for backup ${historyId}: ${errorMessage}`);
  } catch (error) {
    logger.error(`Error handling agent verification failed: ${error.message}`);
  }
};

module.exports = {
  createBackupJob,
  getBackupJobById,
  getUserBackupJobs,
  updateBackupJob,
  deleteBackupJob,
  executeBackup,
  getBackupHistory,
  getBackupHistoryById,
  getBackupFilePath,
  deleteBackup,
  getBackupStats,
  restoreBackup,
  verifyBackup,
  getLastFullBackupForDatabase,
  handleAgentBackupCompleted,
  handleAgentBackupFailed,
  handleAgentVerificationCompleted,
  handleAgentVerificationFailed,
};
