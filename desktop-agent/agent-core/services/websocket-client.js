const { io } = require('socket.io-client');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');
const config = require('../config/config');
const authService = require('./auth.service');
const backupExecutor = require('./backup-executor');
const restoreExecutor = require('./restore-executor');
const verificationExecutor = require('./verification-executor');

// Path for persisting active jobs (survives agent restart)
const ACTIVE_JOBS_FILE = path.join(config.backupStoragePath || '.', 'active-jobs.json');

class WebSocketClient extends EventEmitter {
  constructor() {
    super();
    this.socket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.heartbeatInterval = null;
    this.pendingEvents = []; // Queue for events when backend is offline
    this.activeJobs = new Map(); // Track running jobs: jobId -> { startTime, databaseName }
    this.hasIncompleteJobsFromFile = false; // Flag: were there jobs left from previous crash?

    // Load incomplete jobs from previous session (if agent crashed)
    this.loadActiveJobsFromFile();
  }

  /**
   * Initialize client
   */
  initialize() {
    logger.info('WebSocket client initialized');
  }

  /**
   * Connect to backend
   * @param {string} token - JWT token
   * @param {string} agentId - Agent UUID
   */
  async connect(token, agentId) {
    if (this.socket && this.socket.connected) {
      logger.warn('WebSocket already connected');
      return;
    }

    const authInfo = authService.getAuthInfo();
    const backendUrl = authInfo.backendUrl || config.backendUrl;

    // Parse WebSocket URL from backend URL
    const wsUrl = backendUrl.replace(/^http/, 'ws');

    logger.info(`Connecting to WebSocket: ${wsUrl}/ws`);

    this.socket = io(wsUrl, {
      path: '/ws',
      auth: {
        token,
        agentId,
      },
      reconnection: true,
      reconnectionDelay: config.reconnectDelay, // Initial delay: 5 seconds
      reconnectionDelayMax: 60000, // Max delay: 60 seconds (exponential backoff)
      reconnectionAttempts: config.maxReconnectAttempts, // Infinity = never give up!
      transports: ['websocket'], // Prefer WebSocket, fallback to polling
      upgrade: true,
      rememberUpgrade: true,
      forceNew: false, // Reuse existing connection if possible
      timeout: 20000, // Connection timeout: 20 seconds
    });

    this.setupEventHandlers();
  }

  /**
   * Setup event handlers
   */
  setupEventHandlers() {
    // Connection events
    this.socket.on('connect', () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      logger.info('WebSocket connected');
      this.emit('connected');

      // Start heartbeat
      this.startHeartbeat();

      // Report incomplete jobs from previous crash (only if loaded from file)
      if (this.hasIncompleteJobsFromFile) {
        this.reportIncompleteJobs();
        this.hasIncompleteJobsFromFile = false;
      }

      // Process pending events after reconnect
      this.processPendingEvents();
    });

    this.socket.on('disconnect', (reason) => {
      this.isConnected = false;
      logger.warn(`WebSocket disconnected: ${reason}`);
      this.emit('disconnected');

      // Stop heartbeat
      this.stopHeartbeat();
    });

    this.socket.on('connect_error', (error) => {
      this.reconnectAttempts++;
      logger.error(`WebSocket connection error (attempt ${this.reconnectAttempts}):`, error.message);
      logger.info('Retrying with exponential backoff (max 60s delay)...');

      // With Infinity maxReconnectAttempts, agent will keep trying forever
      // Socket.IO handles exponential backoff automatically (5s -> 10s -> 20s -> ... -> 60s max)
    });

    // Heartbeat acknowledgment
    this.socket.on('heartbeat:ack', () => {
      logger.debug('Heartbeat acknowledged');
    });

    // Job execution request from backend
    this.socket.on('job:execute', async (jobData) => {
      logger.info('Received job execution request:', { jobId: jobData.id });

      try {
        // Execute backup job
        await backupExecutor.executeBackupJob(jobData, this);
      } catch (error) {
        logger.error('Job execution failed:', error);
        this.sendBackupFailed(jobData.id, error.message);
      }
    });

    // Database test request from backend
    this.socket.on('database:test', async (testRequest) => {
      const { requestId, config } = testRequest;
      logger.info('Received database test request:', { requestId, type: config.type });

      try {
        // Import database connectors
        const postgresqlConnector = require('./dbConnectors/postgresql.connector');
        const mysqlConnector = require('./dbConnectors/mysql');
        const mongodbConnector = require('./dbConnectors/mongodb');
        const mssqlConnector = require('./dbConnectors/mssql');

        // Select appropriate connector
        let connector;
        switch (config.type.toLowerCase()) {
          case 'postgresql':
          case 'postgres':
            connector = postgresqlConnector;
            break;
          case 'mysql':
          case 'mariadb':
            connector = mysqlConnector;
            break;
          case 'mongodb':
          case 'mongo':
            connector = mongodbConnector;
            break;
          case 'mssql':
          case 'sqlserver':
            connector = mssqlConnector;
            break;
          default:
            throw new Error(`Unsupported database type: ${config.type}`);
        }

        // Test connection from Agent's localhost
        logger.info(`Testing ${config.type} connection: ${config.host}:${config.port}`);
        const result = await connector.testConnection(config);

        // Send result back to backend
        this.sendDatabaseTestResult(requestId, result);
      } catch (error) {
        logger.error('Database test failed:', error);
        this.sendDatabaseTestResult(requestId, {
          success: false,
          message: error.message,
        });
      }
    });

    // Restore execution request from backend
    this.socket.on('restore:execute', async (restoreData) => {
      logger.info('Received restore execution request:', { historyId: restoreData.historyId });

      try {
        // Execute restore job
        await restoreExecutor.executeRestoreJob(restoreData, this);
      } catch (error) {
        logger.error('Restore execution failed:', error);
        this.sendRestoreFailed(restoreData.historyId, error.message);
      }
    });

    // Verification execution request from backend
    this.socket.on('verification:execute', async (verificationData) => {
      logger.info('Received verification execution request:', { historyId: verificationData.historyId });

      try {
        // Execute verification job
        await verificationExecutor.executeVerificationJob(verificationData, this);
      } catch (error) {
        logger.error('Verification execution failed:', error);
        this.sendVerificationFailed(verificationData.historyId, error.message);
      }
    });
  }

  /**
   * Start heartbeat
   */
  startHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected && this.socket) {
        this.socket.emit('heartbeat');
        logger.debug('Heartbeat sent');
      }
    }, config.heartbeatInterval);

    logger.info('Heartbeat started');
  }

  /**
   * Stop heartbeat
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      logger.info('Heartbeat stopped');
    }
  }

  /**
   * Send backup started event
   * @param {number} jobId
   * @param {Object} data
   */
  sendBackupStarted(jobId, data) {
    if (this.socket && this.isConnected) {
      this.socket.emit('backup:started', { jobId, ...data });
      this.emit('backup:started', { jobId, ...data });
      logger.info(`Backup started event sent for job ${jobId}`);
    }
  }

  /**
   * Send backup progress event
   * @param {number} jobId
   * @param {Object} data
   */
  sendBackupProgress(jobId, data) {
    if (this.socket && this.isConnected) {
      this.socket.emit('backup:progress', { jobId, ...data });
      this.emit('backup:progress', { jobId, ...data });
      logger.debug(`Backup progress event sent for job ${jobId}: ${data.progress}%`);
    }
  }

  /**
   * Send backup completed event (queued if offline)
   * @param {number} jobId
   * @param {Object} result
   */
  sendBackupCompleted(jobId, result) {
    const eventData = {
      type: 'backup:completed',
      jobId,
      ...result,
      timestamp: Date.now(),
    };

    // Add to pending queue
    this.pendingEvents.push(eventData);
    logger.info(`Backup completed event added to queue for job ${jobId}`);

    // Try to send immediately if connected
    this.processPendingEvents();
  }

  /**
   * Send backup failed event (queued if offline)
   * @param {number} jobId
   * @param {string} error
   */
  sendBackupFailed(jobId, error) {
    const eventData = {
      type: 'backup:failed',
      jobId,
      error,
      timestamp: Date.now(),
    };

    // Add to pending queue
    this.pendingEvents.push(eventData);
    logger.error(`Backup failed event added to queue for job ${jobId}: ${error}`);

    // Try to send immediately if connected
    this.processPendingEvents();
  }

  /**
   * Load active jobs from file (called on agent startup)
   */
  loadActiveJobsFromFile() {
    try {
      if (fs.existsSync(ACTIVE_JOBS_FILE)) {
        const data = JSON.parse(fs.readFileSync(ACTIVE_JOBS_FILE, 'utf8'));
        if (data && Object.keys(data).length > 0) {
          // Convert object to Map
          for (const [jobId, jobInfo] of Object.entries(data)) {
            this.activeJobs.set(parseInt(jobId), jobInfo);
          }
          this.hasIncompleteJobsFromFile = true;
          logger.warn(`Loaded ${this.activeJobs.size} incomplete job(s) from previous session`);
        }
      }
    } catch (error) {
      logger.error(`Failed to load active jobs from file: ${error.message}`);
    }
  }

  /**
   * Save active jobs to file
   */
  saveActiveJobsToFile() {
    try {
      // Ensure directory exists
      const dir = path.dirname(ACTIVE_JOBS_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const data = Object.fromEntries(this.activeJobs);
      fs.writeFileSync(ACTIVE_JOBS_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
      logger.error(`Failed to save active jobs to file: ${error.message}`);
    }
  }

  /**
   * Add job to active jobs list
   * @param {number} jobId
   * @param {string} databaseName
   */
  addActiveJob(jobId, databaseName) {
    this.activeJobs.set(jobId, {
      startTime: Date.now(),
      databaseName,
    });
    this.saveActiveJobsToFile();
    logger.info(`Job ${jobId} added to active jobs (${this.activeJobs.size} active)`);
  }

  /**
   * Remove job from active jobs list
   * @param {number} jobId
   */
  removeActiveJob(jobId) {
    if (this.activeJobs.has(jobId)) {
      this.activeJobs.delete(jobId);
      this.saveActiveJobsToFile();
      logger.info(`Job ${jobId} removed from active jobs (${this.activeJobs.size} active)`);
    }
  }

  /**
   * Report incomplete jobs as failed
   * Called only when jobs were loaded from file (agent crashed during backup)
   */
  reportIncompleteJobs() {
    if (this.activeJobs.size === 0) {
      return;
    }

    logger.warn(`Found ${this.activeJobs.size} incomplete job(s) from previous crash, reporting as failed...`);

    for (const [jobId, jobInfo] of this.activeJobs) {
      const duration = Date.now() - jobInfo.startTime;
      const durationMin = (duration / 60000).toFixed(1);

      logger.error(`Job ${jobId} (${jobInfo.databaseName}) was interrupted after ${durationMin} minutes`);

      // Send failed event
      this.sendBackupFailed(jobId, `Backup yarıda kesildi (agent kapandı veya çöktü). Süre: ${durationMin} dakika`);
    }

    // Clear active jobs and file after reporting
    this.activeJobs.clear();
    this.saveActiveJobsToFile();
    logger.info('All incomplete jobs reported as failed');
  }

  /**
   * Send database test result
   * @param {string} requestId
   * @param {Object} result
   */
  sendDatabaseTestResult(requestId, result) {
    if (this.socket && this.isConnected) {
      this.socket.emit('database:test:result', { requestId, ...result });
      logger.info(`Database test result sent for request ${requestId}`);
    }
  }

  /**
   * Send restore started event
   * @param {number} historyId
   * @param {Object} data
   */
  sendRestoreStarted(historyId, data) {
    if (this.socket && this.isConnected) {
      this.socket.emit('restore:started', { historyId, ...data });
      this.emit('restore:started', { historyId, ...data });
      logger.info(`Restore started event sent for backup ${historyId}`);
    }
  }

  /**
   * Send restore progress event
   * @param {number} historyId
   * @param {Object} data
   */
  sendRestoreProgress(historyId, data) {
    if (this.socket && this.isConnected) {
      this.socket.emit('restore:progress', { historyId, ...data });
      this.emit('restore:progress', { historyId, ...data });
      logger.debug(`Restore progress event sent for backup ${historyId}: ${data.progress}%`);
    }
  }

  /**
   * Send restore completed event (queued if offline)
   * @param {number} historyId
   * @param {Object} result
   */
  sendRestoreCompleted(historyId, result) {
    const eventData = {
      type: 'restore:completed',
      historyId,
      ...result,
      timestamp: Date.now(),
    };

    // Add to pending queue
    this.pendingEvents.push(eventData);
    logger.info(`Restore completed event added to queue for backup ${historyId}`);

    // Try to send immediately if connected
    this.processPendingEvents();
  }

  /**
   * Send restore failed event (queued if offline)
   * @param {number} historyId
   * @param {string} error
   */
  sendRestoreFailed(historyId, error) {
    const eventData = {
      type: 'restore:failed',
      historyId,
      error,
      timestamp: Date.now(),
    };

    // Add to pending queue
    this.pendingEvents.push(eventData);
    logger.error(`Restore failed event added to queue for backup ${historyId}: ${error}`);

    // Try to send immediately if connected
    this.processPendingEvents();
  }

  /**
   * Process all pending events in the queue
   * Called when connection is established or when new events are added
   */
  processPendingEvents() {
    if (!this.socket || !this.isConnected) {
      logger.info(`Pending events queue: ${this.pendingEvents.length} events waiting for connection`);
      return;
    }

    if (this.pendingEvents.length === 0) {
      return;
    }

    logger.info(`Processing ${this.pendingEvents.length} pending events...`);

    // Process all events in queue
    const eventsToSend = [...this.pendingEvents]; // Copy array
    this.pendingEvents = []; // Clear queue

    eventsToSend.forEach((eventData) => {
      try {
        // Extract event type and prepare data without type field
        const { type, timestamp, ...data } = eventData;

        // Send the event
        this.socket.emit(type, data);
        this.emit(type, data);

        const id = data.jobId || data.historyId;
        logger.info(`Sent pending event: ${type} (id: ${id}) (queued at ${new Date(timestamp).toISOString()})`);
      } catch (error) {
        logger.error(`Failed to send pending event: ${error.message}`, eventData);
        // Re-add to queue if failed
        this.pendingEvents.push(eventData);
      }
    });

    if (this.pendingEvents.length === 0) {
      logger.info('All pending events sent successfully!');
    } else {
      logger.warn(`${this.pendingEvents.length} events failed to send, will retry on next connection`);
    }
  }

  /**
   * Send verification started event
   * @param {number} historyId
   * @param {Object} data
   */
  sendVerificationStarted(historyId, data) {
    if (this.socket && this.isConnected) {
      this.socket.emit('verification:started', { historyId, ...data });
      this.emit('verification:started', { historyId, ...data });
      logger.info(`Verification started event sent for backup ${historyId}`);
    }
  }

  /**
   * Send verification progress event
   * @param {number} historyId
   * @param {Object} data
   */
  sendVerificationProgress(historyId, data) {
    if (this.socket && this.isConnected) {
      this.socket.emit('verification:progress', { historyId, ...data });
      this.emit('verification:progress', { historyId, ...data });
      logger.debug(`Verification progress event sent for backup ${historyId}: ${data.progress}%`);
    }
  }

  /**
   * Send verification completed event
   * @param {number} historyId
   * @param {Object} result
   */
  sendVerificationCompleted(historyId, result) {
    if (this.socket && this.isConnected) {
      this.socket.emit('verification:completed', { historyId, ...result });
      this.emit('verification:completed', { historyId, ...result });
      logger.info(`Verification completed event sent for backup ${historyId}`);
    }
  }

  /**
   * Send verification failed event
   * @param {number} historyId
   * @param {string} error
   */
  sendVerificationFailed(historyId, error) {
    if (this.socket && this.isConnected) {
      this.socket.emit('verification:failed', { historyId, error });
      this.emit('verification:failed', { historyId, error });
      logger.error(`Verification failed event sent for backup ${historyId}: ${error}`);
    }
  }

  /**
   * Disconnect
   */
  disconnect() {
    this.stopHeartbeat();

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      logger.info('WebSocket disconnected by user');
    }
  }

  /**
   * Check if connected
   * @returns {boolean}
   */
  getConnectionStatus() {
    return this.isConnected && this.socket && this.socket.connected;
  }
}

// Export singleton instance
module.exports = new WebSocketClient();
