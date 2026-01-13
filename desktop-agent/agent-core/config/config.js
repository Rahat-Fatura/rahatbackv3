require('dotenv').config();

module.exports = {
  backendUrl: process.env.BACKEND_URL || 'http://localhost:3000',
  backendWsUrl: process.env.BACKEND_WS_URL || 'ws://localhost:3000',
  agentVersion: process.env.AGENT_VERSION || '1.0.0',
  backupStoragePath: process.env.BACKUP_STORAGE_PATH || './backups',
  logLevel: process.env.LOG_LEVEL || 'info',
  autoStart: process.env.AUTO_START === 'true',

  // Heartbeat interval (ms)
  heartbeatInterval: 30000, // 30 seconds

  // Reconnection settings (production-ready - never give up!)
  reconnectDelay: 5000, // 5 seconds
  maxReconnectAttempts: Infinity, // Never stop trying to reconnect!
};
