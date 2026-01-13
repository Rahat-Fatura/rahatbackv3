import { io } from 'socket.io-client';

class WebSocketService {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.listeners = new Map(); // Event listeners
    this.heartbeatInterval = null; // Heartbeat interval
  }

  /**
   * Connect to WebSocket server
   * @param {string} token - JWT token
   * @param {string} userId - User ID
   */
  connect(token, userId) {
    if (this.socket && this.connected) {
      console.log('WebSocket already connected');
      return;
    }

    // Connect to backend WebSocket
    const wsUrl = process.env.REACT_APP_WS_URL || 'http://localhost:3000';

    console.log('🔌 Connecting to WebSocket:', wsUrl);

    this.socket = io(wsUrl, {
      path: '/ws',
      transports: ['websocket', 'polling'],
      auth: {
        token,
        userId, // Send userId to join user room
      },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      // Increase timeout for long-running operations (restore can take 15+ minutes)
      timeout: 300000, // 5 minutes (default: 20000)
    });

    // Connection event handlers
    this.socket.on('connect', () => {
      console.log('✅ WebSocket connected');
      this.connected = true;
      this.emit('connected');
      this.startHeartbeat(); // Start heartbeat on connect
    });

    this.socket.on('disconnect', (reason) => {
      console.log('❌ WebSocket disconnected:', reason);
      this.connected = false;
      this.emit('disconnected', reason);
      this.stopHeartbeat(); // Stop heartbeat on disconnect
    });

    this.socket.on('connect_error', (error) => {
      console.error('⚠️ WebSocket connection error:', error.message);
      this.emit('connection_error', error);
    });

    // Backup events
    this.socket.on('backup:started', (data) => {
      console.log('📦 Backup started:', `Job ID: ${data.jobId}`);
      this.emit('backup:started', data);
    });

    this.socket.on('backup:progress', (data) => {
      this.emit('backup:progress', data);
    });

    this.socket.on('backup:completed', (data) => {
      console.log('✅ Backup completed:', `Job ID: ${data.jobId} - Size: ${(data.size / 1024 / 1024).toFixed(2)} MB`);
      this.emit('backup:completed', data);
    });

    this.socket.on('backup:failed', (data) => {
      console.error('❌ Backup failed:', data.error || 'Unknown error');
      this.emit('backup:failed', data);
    });

    // Restore events
    this.socket.on('restore:started', (data) => {
      console.log('🔄 Restore started:', `History ID: ${data.historyId}`);
      this.emit('restore:started', data);
    });

    this.socket.on('restore:progress', (data) => {
      this.emit('restore:progress', data);
    });

    this.socket.on('restore:completed', (data) => {
      console.log('✅ Restore completed:', `History ID: ${data.historyId}`);
      this.emit('restore:completed', data);
    });

    this.socket.on('restore:failed', (data) => {
      console.error('❌ Restore failed:', data.error || 'Unknown error');
      this.emit('restore:failed', data);
    });

    // Verification events
    this.socket.on('verification:started', (data) => {
      console.log('🔍 Verification started:', `History ID: ${data.historyId}`);
      this.emit('verification:started', data);
    });

    this.socket.on('verification:progress', (data) => {
      this.emit('verification:progress', data);
    });

    this.socket.on('verification:completed', (data) => {
      console.log('✅ Verification completed:', `History ID: ${data.historyId} - Result: ${data.verificationResult?.isValid ? 'Valid' : 'Invalid'}`);
      this.emit('verification:completed', data);
    });

    this.socket.on('verification:failed', (data) => {
      console.error('❌ Verification failed:', data.error || 'Unknown error');
      this.emit('verification:failed', data);
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect() {
    this.stopHeartbeat();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
      this.listeners.clear();
      console.log('🔌 WebSocket disconnected');
    }
  }

  /**
   * Start heartbeat to keep connection alive during long operations
   */
  startHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      if (this.connected && this.socket) {
        this.socket.emit('heartbeat');
        console.debug('💓 Heartbeat sent');
      }
    }, 30000); // 30 seconds (same as agent)

    console.log('💓 Heartbeat started');
  }

  /**
   * Stop heartbeat
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      console.log('💓 Heartbeat stopped');
    }
  }

  /**
   * Subscribe to an event
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   * @returns {Function} - Unsubscribe function
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(event);
      if (callbacks) {
        callbacks.delete(callback);
      }
    };
  }

  /**
   * Unsubscribe from an event
   * @param {string} event - Event name
   * @param {Function} callback - Callback function (optional, if not provided, all listeners are removed)
   */
  off(event, callback) {
    if (!callback) {
      // Remove all listeners for this event
      this.listeners.delete(event);
    } else {
      const callbacks = this.listeners.get(event);
      if (callbacks) {
        callbacks.delete(callback);
      }
    }
  }

  /**
   * Emit event to all listeners
   * @param {string} event - Event name
   * @param {any} data - Event data
   */
  emit(event, data) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in ${event} listener:`, error);
        }
      });
    }
  }

  /**
   * Check if connected
   * @returns {boolean}
   */
  isConnected() {
    return this.connected;
  }
}

// Singleton instance
const websocketService = new WebSocketService();

export default websocketService;
