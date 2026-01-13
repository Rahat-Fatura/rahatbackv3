const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Authentication
  login: (email, password, backendUrl) =>
    ipcRenderer.invoke('auth:login', { email, password, backendUrl }),
  logout: () => ipcRenderer.invoke('auth:logout'),

  // Agent info
  getAgentInfo: () => ipcRenderer.invoke('agent:info'),

  // Jobs
  getJobLogs: () => ipcRenderer.invoke('jobs:logs'),

  // Configuration
  getConfig: () => ipcRenderer.invoke('config:get'),
  updateConfig: (config) => ipcRenderer.invoke('config:update', config),

  // Window controls
  showWindow: () => ipcRenderer.send('window:show'),
  hideWindow: () => ipcRenderer.send('window:hide'),

  // Event listeners
  onConnected: (callback) => ipcRenderer.on('ws:connected', callback),
  onDisconnected: (callback) => ipcRenderer.on('ws:disconnected', callback),
  onBackupStarted: (callback) => ipcRenderer.on('backup:started', (event, data) => callback(data)),
  onBackupProgress: (callback) => ipcRenderer.on('backup:progress', (event, data) => callback(data)),
  onBackupCompleted: (callback) => ipcRenderer.on('backup:completed', (event, data) => callback(data)),
  onBackupFailed: (callback) => ipcRenderer.on('backup:failed', (event, data) => callback(data)),

  // Remove listeners
  removeListener: (channel, callback) => ipcRenderer.removeListener(channel, callback),
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),

  // Platform info
  platform: process.platform,
  version: process.env.npm_package_version || '1.0.0',
});

console.log('Preload script loaded');
