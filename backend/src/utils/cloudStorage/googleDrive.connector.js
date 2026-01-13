const { google } = require('googleapis');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const logger = require('../../config/logger');

/**
 * Create Google Drive client
 */
const createDriveClient = (refreshToken) => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/v1/cloud-storage/google-drive/callback'
  );

  oauth2Client.setCredentials({
    refresh_token: refreshToken,
  });

  return google.drive({ version: 'v3', auth: oauth2Client });
};

/**
 * Test Google Drive connection
 */
const testConnection = async (config) => {
  try {
    // Model decrypts gdRefreshToken to refreshToken
    const refreshToken = config.refreshToken || config.gdRefreshToken;

    if (!refreshToken) {
      return {
        success: false,
        message: 'Refresh token is missing',
      };
    }

    const drive = createDriveClient(refreshToken);

    // Try to get user info
    const response = await drive.about.get({ fields: 'user, storageQuota' });

    return {
      success: true,
      message: 'Connection successful',
      user: response.data.user.emailAddress,
      quota: response.data.storageQuota,
    };
  } catch (error) {
    return {
      success: false,
      message: error.message,
    };
  }
};

/**
 * Upload backup file to Google Drive
 */
const uploadBackup = async (config, filePath, remoteFileName) => {
  try {
    const refreshToken = config.refreshToken || config.gdRefreshToken;
    const drive = createDriveClient(refreshToken);

    const stats = await fs.stat(filePath);
    const fileStream = fsSync.createReadStream(filePath);

    const folderId = config.folderId || config.gdFolderId;
    const fileMetadata = {
      name: remoteFileName,
      parents: folderId ? [folderId] : [],
    };

    const media = {
      mimeType: 'application/octet-stream',
      body: fileStream,
    };

    const startTime = Date.now();

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, name, size, createdTime, webViewLink',
    });

    const duration = Math.floor((Date.now() - startTime) / 1000);

    logger.info(`Successfully uploaded backup to Google Drive: ${response.data.id}`);

    return {
      success: true,
      fileId: response.data.id,
      fileName: response.data.name,
      fileSize: stats.size,
      duration,
      webViewLink: response.data.webViewLink,
    };
  } catch (error) {
    logger.error(`Failed to upload backup to Google Drive: ${error.message}`);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Download backup file from Google Drive
 */
const downloadBackup = async (config, fileId, localFilePath) => {
  try {
    const refreshToken = config.refreshToken || config.gdRefreshToken;
    const drive = createDriveClient(refreshToken);

    const startTime = Date.now();

    const response = await drive.files.get(
      { fileId: fileId, alt: 'media' },
      { responseType: 'stream' }
    );

    // Write stream to file
    const writeStream = fsSync.createWriteStream(localFilePath);

    await new Promise((resolve, reject) => {
      response.data
        .on('end', () => {
          logger.info(`Successfully downloaded backup from Google Drive: ${fileId}`);
          resolve();
        })
        .on('error', (err) => {
          logger.error(`Error downloading backup from Google Drive: ${err.message}`);
          reject(err);
        })
        .pipe(writeStream);
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
    logger.error(`Failed to download backup from Google Drive: ${error.message}`);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Delete backup file from Google Drive
 */
const deleteBackup = async (config, fileId) => {
  try {
    const refreshToken = config.refreshToken || config.gdRefreshToken;
    const drive = createDriveClient(refreshToken);

    await drive.files.delete({ fileId: fileId });

    logger.info(`Successfully deleted backup from Google Drive: ${fileId}`);

    return {
      success: true,
      message: 'Backup deleted successfully',
    };
  } catch (error) {
    logger.error(`Failed to delete backup from Google Drive: ${error.message}`);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * List backups in Google Drive folder
 */
const listBackups = async (config) => {
  try {
    const refreshToken = config.refreshToken || config.gdRefreshToken;
    const drive = createDriveClient(refreshToken);

    // Build query - if no folder specified, list all files created by this app
    let query = 'trashed = false';

    const folderId = config.folderId || config.gdFolderId;
    if (folderId) {
      query += ` and '${folderId}' in parents`;
    }

    const response = await drive.files.list({
      q: query,
      fields: 'files(id, name, size, createdTime, modifiedTime, webViewLink, mimeType)',
      orderBy: 'createdTime desc',
      pageSize: 100, // Get up to 100 files
    });

    const backups = response.data.files.map((file) => ({
      id: file.id,
      name: file.name,
      size: parseInt(file.size || 0),
      createdTime: file.createdTime,
      modifiedTime: file.modifiedTime,
      webViewLink: file.webViewLink,
      mimeType: file.mimeType,
    }));

    return {
      success: true,
      backups,
      count: backups.length,
    };
  } catch (error) {
    logger.error(`Failed to list backups from Google Drive: ${error.message}`);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Get OAuth URL for user authorization
 */
const getAuthUrl = () => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/v1/cloud-storage/google-drive/callback'
  );

  const scopes = ['https://www.googleapis.com/auth/drive.file'];

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent', // Force to get refresh token
  });
};

/**
 * Exchange authorization code for tokens
 */
const getTokensFromCode = async (code) => {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/v1/cloud-storage/google-drive/callback'
    );

    const { tokens } = await oauth2Client.getToken(code);

    return {
      success: true,
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
    };
  } catch (error) {
    logger.error(`Failed to exchange code for tokens: ${error.message}`);
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
  getAuthUrl,
  getTokensFromCode,
};
