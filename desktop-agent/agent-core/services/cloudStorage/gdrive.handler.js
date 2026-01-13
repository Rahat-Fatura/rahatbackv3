const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const logger = require('../../config/logger');

/**
 * Google Drive Storage Handler
 * Handles upload, download, and file management for Google Drive
 */

/**
 * Create Google Drive client from refresh token
 * @param {Object} config - Google Drive configuration
 * @returns {Object} - Google Drive client
 */
const createDriveClient = (config) => {
  const { refreshToken, clientId, clientSecret, redirectUri } = config;

  if (!refreshToken) {
    throw new Error('Google Drive refresh token is required');
  }

  // Use environment variables or config from backend
  const oauth2Client = new google.auth.OAuth2(
    clientId || process.env.GOOGLE_CLIENT_ID,
    clientSecret || process.env.GOOGLE_CLIENT_SECRET,
    redirectUri || process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/v1/cloud-storage/google-drive/callback'
  );

  oauth2Client.setCredentials({
    refresh_token: refreshToken,
  });

  return google.drive({ version: 'v3', auth: oauth2Client });
};

/**
 * Upload file to Google Drive
 * @param {Object} gdriveConfig - Google Drive configuration
 * @param {string} filePath - Local file path
 * @param {string} gdriveKey - Remote file name/key
 * @param {Function} progressCallback - Progress callback function
 * @returns {Promise<Object>} - Upload result
 */
const uploadFile = async (gdriveConfig, filePath, gdriveKey, progressCallback = null) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  try {
    const drive = createDriveClient(gdriveConfig);

    // Get file stats
    const fileStats = fs.statSync(filePath);
    const fileSizeInMB = (fileStats.size / (1024 * 1024)).toFixed(2);

    logger.info(`Uploading file to Google Drive: ${gdriveKey} (${fileSizeInMB} MB)`);

    // Prepare file metadata
    const fileMetadata = {
      name: path.basename(gdriveKey), // Use basename as file name
      parents: gdriveConfig.folderId ? [gdriveConfig.folderId] : [],
    };

    // Prepare file content
    const media = {
      mimeType: getContentType(filePath),
      body: fs.createReadStream(filePath),
    };

    // Upload file
    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, name, size, createdTime, webViewLink',
    });

    logger.info(`File uploaded to Google Drive successfully: ${response.data.id}`);

    if (progressCallback) {
      progressCallback(100); // Mark as complete
    }

    return {
      success: true,
      fileId: response.data.id,
      key: gdriveKey,
      size: fileStats.size,
      sizeMB: fileSizeInMB,
      webViewLink: response.data.webViewLink,
      url: response.data.webViewLink,
    };
  } catch (error) {
    logger.error(`Google Drive upload failed: ${error.message}`);
    throw error;
  }
};

/**
 * Upload file to Google Drive with progress tracking (for large files)
 * Uses resumable upload with chunking for reliability
 * @param {Object} gdriveConfig - Google Drive configuration
 * @param {string} filePath - Local file path
 * @param {string} gdriveKey - Remote file name/key
 * @param {Function} progressCallback - Progress callback
 * @returns {Promise<Object>} - Upload result
 */
const uploadFileWithProgress = async (gdriveConfig, filePath, gdriveKey, progressCallback = null) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const MAX_RETRIES = 3;
  const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const drive = createDriveClient(gdriveConfig);

      const fileStats = fs.statSync(filePath);
      const fileSizeInMB = (fileStats.size / (1024 * 1024)).toFixed(2);

      logger.info(`Uploading file to Google Drive (with progress): ${gdriveKey} (${fileSizeInMB} MB) - Attempt ${attempt}/${MAX_RETRIES}`);

      // Prepare file metadata
      const fileMetadata = {
        name: path.basename(gdriveKey),
        parents: gdriveConfig.folderId ? [gdriveConfig.folderId] : [],
      };

      // For large files, use resumable upload with stream
      const fileStream = fs.createReadStream(filePath);
      const media = {
        mimeType: getContentType(filePath),
        body: fileStream,
      };

      // Track progress
      let uploadedBytes = 0;
      let lastReportedPercentage = 0;

      fileStream.on('data', (chunk) => {
        uploadedBytes += chunk.length;
        const percentage = Math.round((uploadedBytes / fileStats.size) * 100);

        // Report progress every 5% or when completed
        if (percentage >= lastReportedPercentage + 5 || percentage === 100) {
          lastReportedPercentage = percentage;
          const uploadedMB = (uploadedBytes / (1024 * 1024)).toFixed(2);
          logger.debug(`Upload progress: ${percentage}% (${uploadedMB}/${fileSizeInMB} MB)`);

          if (progressCallback) {
            progressCallback(percentage);
          }
        }
      });

      // Use Google Drive's resumable upload (supported by googleapis)
      const response = await drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id, name, size, createdTime, webViewLink',
        supportsAllDrives: true,
      });

      logger.info(`File uploaded to Google Drive successfully: ${response.data.id}`);

      return {
        success: true,
        fileId: response.data.id,
        key: gdriveKey,
        size: fileStats.size,
        sizeMB: fileSizeInMB,
        webViewLink: response.data.webViewLink,
        url: response.data.webViewLink,
      };
    } catch (error) {
      logger.error(`Google Drive upload attempt ${attempt} failed: ${error.message}`);

      // Check if error is authentication related
      if (error.message && error.message.includes('invalid_grant')) {
        logger.error('Google Drive authentication failed: Token is invalid or expired');
        throw new Error('Google Drive authentication failed. Please reconnect Google Drive in Cloud Storage settings and refresh the access token.');
      }

      if (error.message && error.message.includes('invalid_client')) {
        logger.error('Google Drive client configuration is invalid');
        throw new Error('Google Drive client configuration is invalid. Please check your Google API credentials.');
      }

      // Check if error is retryable
      const isRetryable =
        error.code === 'ETIMEDOUT' ||
        error.code === 'ECONNRESET' ||
        error.code === 'ENOTFOUND' ||
        (error.response && error.response.status >= 500) || // Server errors
        (error.response && error.response.status === 429); // Rate limit

      if (!isRetryable || attempt === MAX_RETRIES) {
        logger.error(`Google Drive upload failed after ${attempt} attempts`);
        throw new Error(`Google Drive upload failed: ${error.message}`);
      }

      // Wait before retry (exponential backoff)
      const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Max 10 seconds
      logger.info(`Retrying in ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  throw new Error('Google Drive upload failed after all retries');
};

/**
 * Download file from Google Drive
 * @param {Object} gdriveConfig - Google Drive configuration
 * @param {string} fileId - Google Drive file ID
 * @param {string} downloadPath - Local download path
 * @returns {Promise<Object>} - Download result
 */
const downloadFile = async (gdriveConfig, fileId, downloadPath) => {
  try {
    const drive = createDriveClient(gdriveConfig);

    // Extract fileId from URL if full URL is provided
    let actualFileId = fileId;
    if (fileId.includes('drive.google.com')) {
      const match = fileId.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        actualFileId = match[1];
        logger.info(`Extracted fileId from URL: ${actualFileId}`);
      } else {
        throw new Error(`Invalid Google Drive URL format: ${fileId}`);
      }
    }

    logger.info(`Downloading file from Google Drive: ${actualFileId}`);

    const response = await drive.files.get(
      { fileId: actualFileId, alt: 'media' },
      { responseType: 'stream' }
    );

    // Ensure download directory exists
    const downloadDir = path.dirname(downloadPath);
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }

    // Write stream to file
    const fileStream = fs.createWriteStream(downloadPath);

    await new Promise((resolve, reject) => {
      response.data
        .on('end', () => {
          logger.info(`File downloaded from Google Drive successfully: ${fileId}`);
          resolve();
        })
        .on('error', (err) => {
          logger.error(`Error downloading from Google Drive: ${err.message}`);
          reject(err);
        })
        .pipe(fileStream);
    });

    const stats = fs.statSync(downloadPath);
    const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);

    return {
      success: true,
      filePath: downloadPath,
      size: stats.size,
      sizeMB: fileSizeInMB,
    };
  } catch (error) {
    logger.error(`Google Drive download failed: ${error.message}`);
    throw error;
  }
};

/**
 * Delete file from Google Drive
 * @param {Object} gdriveConfig - Google Drive configuration
 * @param {string} fileId - Google Drive file ID
 * @returns {Promise<Object>} - Delete result
 */
const deleteFile = async (gdriveConfig, fileId) => {
  try {
    const drive = createDriveClient(gdriveConfig);

    logger.info(`Deleting file from Google Drive: ${fileId}`);

    await drive.files.delete({ fileId: fileId });

    logger.info(`File deleted from Google Drive successfully: ${fileId}`);

    return {
      success: true,
      fileId: fileId,
    };
  } catch (error) {
    logger.error(`Google Drive delete failed: ${error.message}`);
    throw error;
  }
};

/**
 * Check if file exists in Google Drive
 * @param {Object} gdriveConfig - Google Drive configuration
 * @param {string} fileId - Google Drive file ID
 * @returns {Promise<boolean>} - True if exists
 */
const fileExists = async (gdriveConfig, fileId) => {
  try {
    const drive = createDriveClient(gdriveConfig);

    await drive.files.get({
      fileId: fileId,
      fields: 'id',
    });

    return true;
  } catch (error) {
    if (error.code === 404) {
      return false;
    }
    throw error;
  }
};

/**
 * Test Google Drive connection
 * @param {Object} gdriveConfig - Google Drive configuration
 * @returns {Promise<Object>} - Test result
 */
const testConnection = async (gdriveConfig) => {
  try {
    const drive = createDriveClient(gdriveConfig);

    // Try to get user info
    const response = await drive.about.get({ fields: 'user, storageQuota' });

    logger.info(`Google Drive connection test successful: ${response.data.user.emailAddress}`);

    return {
      success: true,
      message: 'Connection successful',
      user: response.data.user.emailAddress,
      quota: response.data.storageQuota,
    };
  } catch (error) {
    logger.error(`Google Drive connection test failed: ${error.message}`);
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
  downloadFile,
  deleteFile,
  fileExists,
  testConnection,
};
