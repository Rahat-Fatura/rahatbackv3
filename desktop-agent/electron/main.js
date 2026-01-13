const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
require('dotenv').config();

const logger = require('../agent-core/config/logger');
const { initializeTray } = require('./tray');
const websocketClient = require('../agent-core/services/websocket-client');
const authService = require('../agent-core/services/auth.service');
const { getAgentInfo } = require('../agent-core/utils/system-info');

let mainWindow = null;
let isQuitting = false;

// Create main window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false, // Don't show until ready
  });

  // Load the app
  // Always load the agent's own UI (not the web frontend)
  mainWindow.loadFile(path.join(__dirname, '../ui/index.html'));

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    logger.info('Main window created and shown');
  });

  // Handle window close
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      logger.info('Window hidden to tray');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

// App ready
app.whenReady().then(async () => {
  logger.info('Rahat Backup Agent starting...');
  logger.info(`Platform: ${process.platform}`);
  logger.info(`Version: ${app.getVersion()}`);

  // Create window
  createWindow();

  // Create system tray
  const trayControls = initializeTray(app, mainWindow);

  // Initialize WebSocket client
  websocketClient.initialize();

  // Setup WebSocket event forwarding to UI
  websocketClient.on('connected', () => {
    if (mainWindow) mainWindow.webContents.send('ws:connected');
    // Update tray status
    trayControls.updateStatus('online');
    trayControls.setToolTip('Rahat Backup Agent - Online');
  });

  websocketClient.on('disconnected', () => {
    if (mainWindow) mainWindow.webContents.send('ws:disconnected');
    // Update tray status
    trayControls.updateStatus('offline');
    trayControls.setToolTip('Rahat Backup Agent - Offline');
  });

  websocketClient.on('backup:started', (data) => {
    if (mainWindow) mainWindow.webContents.send('backup:started', data);
  });

  websocketClient.on('backup:progress', (data) => {
    if (mainWindow) mainWindow.webContents.send('backup:progress', data);
  });

  websocketClient.on('backup:completed', (data) => {
    if (mainWindow) mainWindow.webContents.send('backup:completed', data);
  });

  websocketClient.on('backup:failed', (data) => {
    if (mainWindow) mainWindow.webContents.send('backup:failed', data);
  });

  // Auto-connect if already authenticated
  const authInfo = authService.getAuthInfo();
  if (authInfo.isAuthenticated && authInfo.token && authInfo.agentId) {
    logger.info('Auto-connecting to WebSocket (already authenticated)');
    try {
      await websocketClient.connect(authInfo.token, authInfo.agentId);
      logger.info('Auto-connect successful');
    } catch (error) {
      logger.error('Auto-connect failed:', error.message);
    }
  }

  logger.info('Application initialized');
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  websocketClient.disconnect();
  logger.info('Application quitting');
});

// IPC Handlers

// Login
ipcMain.handle('auth:login', async (event, { email, password, backendUrl }) => {
  try {
    logger.info(`Login attempt for user: ${email}`);
    const result = await authService.login(email, password, backendUrl);

    if (result.success) {
      // Connect to WebSocket
      await websocketClient.connect(result.token, result.agentId);
      logger.info('Login successful, WebSocket connected');
    }

    return result;
  } catch (error) {
    logger.error('Login failed:', error);
    return {
      success: false,
      error: error.message,
    };
  }
});

// Logout
ipcMain.handle('auth:logout', async () => {
  try {
    websocketClient.disconnect();
    authService.logout();
    logger.info('Logout successful');
    return { success: true };
  } catch (error) {
    logger.error('Logout failed:', error);
    return {
      success: false,
      error: error.message,
    };
  }
});

// Get agent info
ipcMain.handle('agent:info', async () => {
  try {
    const info = await getAgentInfo();
    const authInfo = authService.getAuthInfo();

    return {
      success: true,
      data: {
        ...info,
        isAuthenticated: authInfo.isAuthenticated,
        user: authInfo.user,
        status: websocketClient.getConnectionStatus() ? 'online' : 'offline',
      },
    };
  } catch (error) {
    logger.error('Failed to get agent info:', error);
    return {
      success: false,
      error: error.message,
    };
  }
});

// Get job logs
ipcMain.handle('jobs:logs', async () => {
  try {
    // TODO: Implement job logs from SQLite
    return {
      success: true,
      data: [],
    };
  } catch (error) {
    logger.error('Failed to get job logs:', error);
    return {
      success: false,
      error: error.message,
    };
  }
});

// Get configuration
ipcMain.handle('config:get', async () => {
  try {
    return {
      success: true,
      data: {
        backendUrl: process.env.BACKEND_URL || 'http://localhost:3000',
        backupPath: process.env.BACKUP_STORAGE_PATH || './backups',
        autoStart: process.env.AUTO_START === 'true',
      },
    };
  } catch (error) {
    logger.error('Failed to get config:', error);
    return {
      success: false,
      error: error.message,
    };
  }
});

// Update configuration
ipcMain.handle('config:update', async (event, config) => {
  try {
    // TODO: Update .env file
    logger.info('Configuration updated:', config);
    return { success: true };
  } catch (error) {
    logger.error('Failed to update config:', error);
    return {
      success: false,
      error: error.message,
    };
  }
});

// Show/hide window
ipcMain.on('window:show', () => {
  if (mainWindow) {
    mainWindow.show();
  }
});

ipcMain.on('window:hide', () => {
  if (mainWindow) {
    mainWindow.hide();
  }
});

// WebSocket events forwarding to renderer (handled above in app.whenReady)
// Duplicate listeners removed to avoid multiple updates

websocketClient.on('backup:started', (data) => {
  if (mainWindow) {
    mainWindow.webContents.send('backup:started', data);
  }
});

websocketClient.on('backup:progress', (data) => {
  if (mainWindow) {
    mainWindow.webContents.send('backup:progress', data);
  }
});

websocketClient.on('backup:completed', (data) => {
  if (mainWindow) {
    mainWindow.webContents.send('backup:completed', data);
  }
});

websocketClient.on('backup:failed', (data) => {
  if (mainWindow) {
    mainWindow.webContents.send('backup:failed', data);
  }
});

logger.info('Electron main process initialized');
