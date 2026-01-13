const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { cloudStorageService } = require('../services');
const { googleDriveConnector, awsS3Connector } = require('../utils/cloudStorage');

/**
 * Create cloud storage configuration
 */
const createCloudStorage = catchAsync(async (req, res) => {
  const cloudStorage = await cloudStorageService.createCloudStorage(req.user.id, req.body);
  res.status(httpStatus.CREATED).send(cloudStorage);
});

/**
 * Get all cloud storage configurations
 */
const getCloudStorages = catchAsync(async (req, res) => {
  const filters = {
    storageType: req.query.storageType,
  };

  // Convert isActive to boolean (handle both string and boolean input)
  if (req.query.isActive !== undefined) {
    if (typeof req.query.isActive === 'boolean') {
      filters.isActive = req.query.isActive;
    } else {
      filters.isActive = req.query.isActive === 'true';
    }
  }

  const cloudStorages = await cloudStorageService.getUserCloudStorages(req.user.id, filters);
  res.send(cloudStorages);
});

/**
 * Get cloud storage by ID
 */
const getCloudStorage = catchAsync(async (req, res) => {
  const cloudStorage = await cloudStorageService.getCloudStorageById(parseInt(req.params.id), req.user.id);
  res.send(cloudStorage);
});

/**
 * Update cloud storage configuration
 */
const updateCloudStorage = catchAsync(async (req, res) => {
  const cloudStorage = await cloudStorageService.updateCloudStorage(parseInt(req.params.id), req.user.id, req.body);
  res.send(cloudStorage);
});

/**
 * Delete cloud storage configuration
 */
const deleteCloudStorage = catchAsync(async (req, res) => {
  await cloudStorageService.deleteCloudStorage(parseInt(req.params.id), req.user.id);
  res.status(httpStatus.NO_CONTENT).send();
});

/**
 * Test cloud storage connection
 */
const testConnection = catchAsync(async (req, res) => {
  const result = await cloudStorageService.testConnection(parseInt(req.params.id), req.user.id);
  res.send(result);
});

/**
 * Set cloud storage as default
 */
const setAsDefault = catchAsync(async (req, res) => {
  const cloudStorage = await cloudStorageService.setAsDefault(parseInt(req.params.id), req.user.id);
  res.send(cloudStorage);
});

/**
 * List files in cloud storage
 */
const listFiles = catchAsync(async (req, res) => {
  const result = await cloudStorageService.listFiles(parseInt(req.params.id), req.user.id);
  res.send(result);
});

/**
 * Get Google Drive authorization URL
 */
const getGoogleDriveAuthUrl = catchAsync(async (req, res) => {
  const authUrl = googleDriveConnector.getAuthUrl();
  res.send({ authUrl });
});

/**
 * Google Drive OAuth callback
 */
const googleDriveCallback = catchAsync(async (req, res) => {
  // Disable CSP for this endpoint to allow inline scripts
  res.setHeader('Content-Security-Policy', "script-src 'unsafe-inline'");
  // Disable COOP to allow popup to access window.opener
  res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');

  const { code, error } = req.query;

  // Handle authorization error
  if (error) {
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authorization Failed</title>
          <style>
            body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
            .container { text-align: center; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .error { color: #f44336; font-size: 24px; margin-bottom: 20px; }
            .message { color: #666; margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error">❌ Authorization Failed</div>
            <div class="message">User denied access or an error occurred.</div>
            <div class="message">You can close this window.</div>
          </div>
          <script>
            // Send failure message to parent window
            if (window.opener) {
              window.opener.postMessage({
                type: 'GOOGLE_DRIVE_AUTH_FAILED',
                error: '${error}'
              }, '*');
              setTimeout(() => window.close(), 2000);
            }
          </script>
        </body>
      </html>
    `);
  }

  if (!code) {
    return res.status(httpStatus.BAD_REQUEST).send({ message: 'Authorization code is required' });
  }

  const result = await googleDriveConnector.getTokensFromCode(code);

  if (!result.success) {
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authorization Failed</title>
          <style>
            body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
            .container { text-align: center; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .error { color: #f44336; font-size: 24px; margin-bottom: 20px; }
            .message { color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error">❌ Token Exchange Failed</div>
            <div class="message">${result.error}</div>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'GOOGLE_DRIVE_AUTH_FAILED',
                error: '${result.error}'
              }, '*');
              setTimeout(() => window.close(), 2000);
            }
          </script>
        </body>
      </html>
    `);
  }

  // Success - send HTML page that posts message to parent window
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Authorization Successful</title>
        <style>
          body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
          .container { text-align: center; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .success { color: #4CAF50; font-size: 24px; margin-bottom: 20px; }
          .message { color: #666; margin-bottom: 10px; }
          .spinner { border: 3px solid #f3f3f3; border-top: 3px solid #4CAF50; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 20px auto; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success">✅ Authorization Successful!</div>
          <div class="message">Connecting to Google Drive...</div>
          <div class="spinner"></div>
          <div class="message">This window will close automatically.</div>
        </div>
        <script>
          // Send refresh token to parent window
          console.log('=== OAuth Callback Script Running ===');
          console.log('Refresh Token:', '${result.refreshToken}');
          console.log('window.opener exists?', !!window.opener);
          console.log('window.opener:', window.opener);

          if (window.opener && !window.opener.closed) {
            try {
              console.log('Parent window is available and not closed');

              // Try sending to multiple possible origins
              const origins = ['http://localhost:3001', 'http://localhost:3000', window.location.origin, '*'];

              const messageData = {
                type: 'GOOGLE_DRIVE_AUTH_SUCCESS',
                refreshToken: '${result.refreshToken}'
              };

              console.log('Message to send:', messageData);

              origins.forEach(origin => {
                console.log('Sending postMessage to origin:', origin);
                try {
                  window.opener.postMessage(messageData, origin);
                  console.log('Successfully sent to:', origin);
                } catch (err) {
                  console.error('Error sending to', origin, ':', err);
                }
              });

              console.log('All postMessage calls completed. Window will close in 2 seconds.');

              // Close window after a delay
              setTimeout(() => {
                console.log('Closing popup window now');
                window.close();
              }, 2000);
            } catch (error) {
              console.error('Failed to send message:', error);
              document.querySelector('.message').textContent = 'Token alındı! Bu pencereyi kapatabilirsiniz.';
            }
          } else {
            console.log('window.opener not available or already closed');
            document.querySelector('.message').textContent = 'Token alındı! Bu pencereyi kapatabilirsiniz.';
          }
        </script>
      </body>
    </html>
  `);
});

module.exports = {
  createCloudStorage,
  getCloudStorages,
  getCloudStorage,
  updateCloudStorage,
  deleteCloudStorage,
  testConnection,
  setAsDefault,
  listFiles,
  getGoogleDriveAuthUrl,
  googleDriveCallback,
};
