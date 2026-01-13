const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('../config/config');
const logger = require('../config/logger');
const { agentService } = require('./index');
const { tokenService } = require('./index');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Store active agent connections
const activeAgents = new Map(); // agentId -> socket

// Store pending database test requests
const pendingDatabaseTests = new Map(); // requestId -> { resolve, reject, timeout }

// Store pending verification requests
const pendingVerificationRequests = new Map(); // historyId -> { resolve, reject, timeout }

/**
 * Initialize WebSocket server
 * @param {Object} httpServer - HTTP server instance
 * @returns {Object} Socket.IO server instance
 */
const initializeWebSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: config.corsOrigin || '*',
      credentials: true,
    },
    path: '/ws',
    // Increase ping/pong timeout for long-running operations (restore, backup, verification)
    // Restore can take 15+ minutes, so we need a very generous timeout
    pingTimeout: 300000, // 5 minutes (default: 5000)
    pingInterval: 25000, // 25 seconds (default: 25000)
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      const agentId = socket.handshake.auth.agentId;
      const userId = socket.handshake.auth.userId;

      if (!token) {
        return next(new Error('Authentication error: Missing token'));
      }

      // Verify JWT token (access tokens are not stored in DB, only refresh tokens)
      const payload = jwt.verify(token, config.jwt.secret);

      if (!payload || !payload.sub) {
        return next(new Error('Authentication error: Invalid token'));
      }

      // Check if this is an agent or a frontend user connection
      if (agentId) {
        // Agent connection
        const agent = await agentService.authenticateAgent(agentId, payload.sub);

        // Attach user and agent to socket
        socket.userId = payload.sub;
        socket.agentId = agentId;
        socket.agentDbId = agent.id;
        socket.connectionType = 'agent';

        logger.info(`Agent authenticated: ${agentId} for user ${payload.sub}`);
      } else if (userId) {
        // Frontend user connection
        if (userId !== payload.sub) {
          return next(new Error('Authentication error: User ID mismatch'));
        }

        socket.userId = userId;
        socket.connectionType = 'user';

        logger.info(`Frontend user authenticated: ${userId}`);
      } else {
        return next(new Error('Authentication error: Missing agentId or userId'));
      }

      next();
    } catch (error) {
      logger.error(`WebSocket authentication failed: ${error.message}`);
      next(new Error(`Authentication error: ${error.message}`));
    }
  });

  // Connection handler
  io.on('connection', (socket) => {
    const { agentId, userId, connectionType } = socket;

    if (connectionType === 'agent') {
      logger.info(`Agent connected: ${agentId} (User: ${userId})`);

      // Store active agent connection
      activeAgents.set(agentId, socket);

      // Update agent status to online
      agentService.updateAgentStatus(agentId, 'online').catch((error) => {
        logger.error(`Failed to update agent status: ${error.message}`);
      });
    } else if (connectionType === 'user') {
      logger.info(`Frontend user connected: ${userId}`);
    }

    // Heartbeat handler
    socket.on('heartbeat', async () => {
      try {
        // Only update agent heartbeat if this is an agent connection
        if (connectionType === 'agent' && agentId) {
          await agentService.heartbeat(agentId);
        }
        // Send acknowledgment to both agents and frontend
        socket.emit('heartbeat:ack');
      } catch (error) {
        logger.error(`Heartbeat failed for agent ${agentId}: ${error.message}`);
      }
    });

    // Backup status updates from agent
    socket.on('backup:started', (data) => {
      logger.info(`Backup started on agent ${agentId}:`, data);
      // Broadcast to user's frontend connections if needed
      io.to(`user:${userId}`).emit('backup:started', data);
    });

    socket.on('backup:progress', (data) => {
      io.to(`user:${userId}`).emit('backup:progress', data);
    });

    socket.on('backup:completed', async (data) => {
      logger.info(`Backup completed on agent ${agentId}:`, data);

      // Update backup history in database
      const { backupService } = require('./index');
      await backupService.handleAgentBackupCompleted(data.jobId, data);

      // Broadcast to user's frontend connections
      io.to(`user:${userId}`).emit('backup:completed', data);
    });

    socket.on('backup:failed', async (data) => {
      logger.error(`Backup failed on agent ${agentId}:`, data);

      // Update backup history in database
      const { backupService } = require('./index');
      await backupService.handleAgentBackupFailed(data.jobId, data.error);

      // Broadcast to user's frontend connections
      io.to(`user:${userId}`).emit('backup:failed', data);
    });

    // Restore status updates from agent
    socket.on('restore:started', (data) => {
      logger.info(`Restore started on agent ${agentId}:`, data);
      // Broadcast to user's frontend connections
      io.to(`user:${userId}`).emit('restore:started', data);
    });

    socket.on('restore:progress', (data) => {
      io.to(`user:${userId}`).emit('restore:progress', data);
    });

    socket.on('restore:completed', async (data) => {
      logger.info(`Restore completed on agent ${agentId}:`, data);

      try {
        // Update restore history and backup history in database
        const completedAt = new Date();
        const duration = data.duration || 0;

        // Find the most recent running restore for this backup
        const runningRestore = await prisma.restoreHistory.findFirst({
          where: {
            backupHistoryId: data.historyId || data.backupId,
            status: 'running',
          },
          orderBy: { startedAt: 'desc' },
        });

        if (runningRestore) {
          // Update restore history
          await prisma.restoreHistory.update({
            where: { id: runningRestore.id },
            data: {
              status: 'success',
              completedAt,
              duration,
            },
          });

          // Update backup history with last restore status
          await prisma.backupHistory.update({
            where: { id: data.historyId || data.backupId },
            data: {
              lastRestoreStatus: 'success',
              lastRestoreCompletedAt: completedAt,
              lastRestoreDuration: duration,
              lastRestoreError: null,
            },
          });

          logger.info(`Restore status updated: restoreHistoryId=${runningRestore.id}, status=success, duration=${duration}ms`);
        } else {
          logger.warn(`No running restore found for backupHistoryId=${data.historyId || data.backupId}`);
        }
      } catch (error) {
        logger.error(`Failed to update restore status: ${error.message}`);
      }

      // Broadcast to user's frontend connections
      io.to(`user:${userId}`).emit('restore:completed', data);
    });

    socket.on('restore:failed', async (data) => {
      logger.error(`Restore failed on agent ${agentId}:`, data);

      try {
        // Update restore history and backup history in database
        const completedAt = new Date();
        const duration = data.duration || 0;
        const errorMessage = data.error || 'Unknown error';

        // Find the most recent running restore for this backup
        const runningRestore = await prisma.restoreHistory.findFirst({
          where: {
            backupHistoryId: data.historyId || data.backupId,
            status: 'running',
          },
          orderBy: { startedAt: 'desc' },
        });

        if (runningRestore) {
          // Update restore history
          await prisma.restoreHistory.update({
            where: { id: runningRestore.id },
            data: {
              status: 'failed',
              completedAt,
              duration,
              errorMessage,
            },
          });

          // Update backup history with last restore status
          await prisma.backupHistory.update({
            where: { id: data.historyId || data.backupId },
            data: {
              lastRestoreStatus: 'failed',
              lastRestoreCompletedAt: completedAt,
              lastRestoreDuration: duration,
              lastRestoreError: errorMessage,
            },
          });

          logger.info(`Restore status updated: restoreHistoryId=${runningRestore.id}, status=failed, error=${errorMessage}`);
        } else {
          logger.warn(`No running restore found for backupHistoryId=${data.historyId || data.backupId}`);
        }
      } catch (error) {
        logger.error(`Failed to update restore status: ${error.message}`);
      }

      // Broadcast to user's frontend connections
      io.to(`user:${userId}`).emit('restore:failed', data);
    });

    // Database test connection result
    socket.on('database:test:result', (data) => {
      const { requestId, success, message, version } = data;
      logger.info(`Database test result from agent ${agentId}:`, { requestId, success });

      // Resolve pending promise if exists
      const pendingRequest = pendingDatabaseTests.get(requestId);
      if (pendingRequest) {
        clearTimeout(pendingRequest.timeout);
        pendingRequest.resolve({ success, message, version });
        pendingDatabaseTests.delete(requestId);
      }

      // Also forward to frontend (for real-time UI updates)
      io.to(`user:${userId}`).emit('database:test:result', data);
    });

    // Verification status updates from agent
    socket.on('verification:started', (data) => {
      logger.info(`Verification started on agent ${agentId}:`, data);
      // Broadcast to user's frontend connections
      io.to(`user:${userId}`).emit('verification:started', data);
    });

    socket.on('verification:progress', (data) => {
      io.to(`user:${userId}`).emit('verification:progress', data);
    });

    socket.on('verification:completed', async (data) => {
      logger.info(`Verification completed on agent ${agentId}:`, data);

      // Update backup history in database
      const { backupService } = require('./index');
      await backupService.handleAgentVerificationCompleted(data.historyId, data);

      // Resolve pending promise if exists
      const pendingRequest = pendingVerificationRequests.get(data.historyId);
      if (pendingRequest) {
        clearTimeout(pendingRequest.timeout);
        pendingRequest.resolve(data.verificationResult);
        pendingVerificationRequests.delete(data.historyId);
      }

      // Broadcast to user's frontend connections
      io.to(`user:${userId}`).emit('verification:completed', data);
    });

    socket.on('verification:failed', async (data) => {
      logger.error(`Verification failed on agent ${agentId}:`, data);

      // Update backup history in database
      const { backupService } = require('./index');
      await backupService.handleAgentVerificationFailed(data.historyId, data.error);

      // Reject pending promise if exists
      const pendingRequest = pendingVerificationRequests.get(data.historyId);
      if (pendingRequest) {
        clearTimeout(pendingRequest.timeout);
        pendingRequest.reject(new Error(data.error || 'Verification failed'));
        pendingVerificationRequests.delete(data.historyId);
      }

      // Broadcast to user's frontend connections
      io.to(`user:${userId}`).emit('verification:failed', data);
    });

    // Disconnect handler
    socket.on('disconnect', async () => {
      if (connectionType === 'agent') {
        logger.info(`Agent disconnected: ${agentId}`);

        // Remove from active connections
        activeAgents.delete(agentId);

        // Update agent status to offline
        try {
          await agentService.updateAgentStatus(agentId, 'offline');
        } catch (error) {
          logger.error(`Failed to update agent status on disconnect: ${error.message}`);
        }
      } else if (connectionType === 'user') {
        logger.info(`Frontend user disconnected: ${userId}`);
      }
    });

    // Error handler
    socket.on('error', (error) => {
      logger.error(`Socket error for agent ${agentId}:`, error);
    });

    // Join user room for broadcasting
    socket.join(`user:${userId}`);
  });

  logger.info('WebSocket server initialized');
  return io;
};

/**
 * Send backup job to agent
 * @param {string} agentId
 * @param {Object} jobData
 * @returns {Promise<boolean>}
 */
const sendJobToAgent = async (agentId, jobData) => {
  const socket = activeAgents.get(agentId);

  if (!socket) {
    logger.warn(`Agent ${agentId} is not connected`);
    return false;
  }

  try {
    logger.info(`Sending job to agent ${agentId}:`, {
      jobId: jobData.id,
      isEncrypted: jobData.isEncrypted,
      hasPasswordHash: !!jobData.encryptionPasswordHash,
      passwordHashLength: jobData.encryptionPasswordHash?.length
    });

    // Send job execution command to agent
    socket.emit('job:execute', jobData);

    return true;
  } catch (error) {
    logger.error(`Failed to send job to agent ${agentId}: ${error.message}`);
    return false;
  }
};

/**
 * Send restore job to agent
 * @param {string} agentId
 * @param {Object} restoreData
 * @returns {Promise<boolean>}
 */
const sendRestoreToAgent = async (agentId, restoreData) => {
  const socket = activeAgents.get(agentId);

  if (!socket) {
    logger.warn(`Agent ${agentId} is not connected`);
    return false;
  }

  try {
    logger.info(`Sending restore to agent ${agentId}:`, { historyId: restoreData.historyId });

    // Send restore execution command to agent
    socket.emit('restore:execute', restoreData);

    return true;
  } catch (error) {
    logger.error(`Failed to send restore to agent ${agentId}: ${error.message}`);
    return false;
  }
};

/**
 * Send database test request to agent and wait for result
 * @param {string} agentId
 * @param {Object} config - Database configuration
 * @returns {Promise<Object>} - Test result
 */
const sendDatabaseTestToAgent = async (agentId, config) => {
  const socket = activeAgents.get(agentId);

  if (!socket) {
    throw new Error(`Agent ${agentId} is not connected`);
  }

  // Generate unique request ID
  const requestId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  return new Promise((resolve, reject) => {
    // Set timeout (30 seconds)
    const timeout = setTimeout(() => {
      pendingDatabaseTests.delete(requestId);
      reject(new Error('Database test timeout - Agent did not respond'));
    }, 30000);

    // Store pending request
    pendingDatabaseTests.set(requestId, { resolve, reject, timeout });

    // Send test request to agent
    logger.info(`Sending database test to agent ${agentId}:`, { requestId, type: config.type });
    socket.emit('database:test', { requestId, config });
  });
};

/**
 * Send verification request to agent and wait for result
 * @param {string} agentId
 * @param {Object} verificationData - Verification data
 * @returns {Promise<Object>} - Verification result
 */
const sendVerificationToAgent = async (agentId, verificationData) => {
  const socket = activeAgents.get(agentId);

  if (!socket) {
    throw new Error(`Agent ${agentId} is not connected`);
  }

  const { historyId } = verificationData;

  return new Promise((resolve, reject) => {
    // Set timeout (15 minutes - large backups need more time for download + decompress + verify)
    const timeout = setTimeout(() => {
      pendingVerificationRequests.delete(historyId);
      reject(new Error('Verification timeout - Agent did not respond within 15 minutes'));
    }, 900000); // 15 minutes

    // Store pending request
    pendingVerificationRequests.set(historyId, { resolve, reject, timeout });

    // Send verification request to agent
    logger.info(`Sending verification to agent ${agentId}:`, { historyId, verificationLevel: verificationData.verificationLevel });
    socket.emit('verification:execute', verificationData);
  });
};

/**
 * Check if agent is online
 * @param {string} agentId
 * @returns {boolean}
 */
const isAgentOnline = (agentId) => {
  return activeAgents.has(agentId);
};

/**
 * Get all online agents
 * @returns {Array<string>}
 */
const getOnlineAgents = () => {
  return Array.from(activeAgents.keys());
};

/**
 * Get online agents count
 * @returns {number}
 */
const getOnlineAgentsCount = () => {
  return activeAgents.size;
};

/**
 * Disconnect agent
 * @param {string} agentId
 */
const disconnectAgent = (agentId) => {
  const socket = activeAgents.get(agentId);
  if (socket) {
    socket.disconnect(true);
    activeAgents.delete(agentId);
    logger.info(`Agent ${agentId} forcefully disconnected`);
  }
};

module.exports = {
  initializeWebSocket,
  sendJobToAgent,
  sendRestoreToAgent,
  sendDatabaseTestToAgent,
  sendVerificationToAgent,
  isAgentOnline,
  getOnlineAgents,
  getOnlineAgentsCount,
  disconnectAgent,
};
