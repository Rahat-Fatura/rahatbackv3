const { MongoClient } = require('mongodb');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const os = require('os');

const execPromise = promisify(exec);

/**
 * Validate and sanitize input to prevent command injection
 */
const validateInput = (value, fieldName, pattern = /^[a-zA-Z0-9_\-\.]+$/) => {
  if (!value) {
    throw new Error(`${fieldName} is required`);
  }
  if (!pattern.test(value)) {
    throw new Error(`${fieldName} contains invalid characters`);
  }
  return value;
};

/**
 * Escape shell arguments
 */
const escapeShellArg = (arg) => {
  if (os.platform() === 'win32') {
    return `"${arg.replace(/"/g, '""')}"`;
  } else {
    return `'${arg.replace(/'/g, "'\\''")}'`;
  }
};

/**
 * Test MongoDB database connection
 */
const testConnection = async (config) => {
  let client;
  try {
    // Use connectionString if provided, otherwise build from components
    const uri =
      config.connectionString ||
      `mongodb://${config.username}:${config.password}@${config.host}:${config.port}/${config.database}`;

    client = new MongoClient(uri, {
      ssl: config.sslEnabled,
      serverSelectionTimeoutMS: 5000,
    });

    await client.connect();
    const adminDb = client.db().admin();
    const serverInfo = await adminDb.serverInfo();

    return {
      success: true,
      message: 'Connection successful',
      version: serverInfo.version,
    };
  } catch (error) {
    return {
      success: false,
      message: error.message,
    };
  } finally {
    if (client) {
      await client.close();
    }
  }
};

/**
 * Create MongoDB backup using mongodump
 */
const createBackup = async (config, outputPath) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  let folderName;
  let outputDir;
  let command;

  if (config.connectionString) {
    // Use connection string (validate URL format but allow special chars)
    if (!config.connectionString.startsWith('mongodb://') && !config.connectionString.startsWith('mongodb+srv://')) {
      throw new Error('Invalid MongoDB connection string format');
    }

    // Extract database name from connection string for folder name
    const dbMatch = config.connectionString.match(/\/([^/?]+)(\?|$)/);
    const dbName = dbMatch ? dbMatch[1] : 'backup';
    folderName = `${validateInput(dbName, 'database', /^[a-zA-Z0-9_\-]+$/)}_${timestamp}`;
    outputDir = path.join(outputPath, folderName);

    // Use connection string (properly escaped)
    command = `mongodump --uri=${escapeShellArg(config.connectionString)} --out="${outputDir}"`;
  } else {
    // Validate individual parameters
    const safeHost = validateInput(config.host, 'host', /^[a-zA-Z0-9\.\-]+$/);
    const safeUsername = validateInput(config.username, 'username', /^[a-zA-Z0-9_\-@\.]+$/);
    const safeDatabase = validateInput(config.database, 'database', /^[a-zA-Z0-9_\-]+$/);
    const safePort = parseInt(config.port, 10);

    if (isNaN(safePort) || safePort < 1 || safePort > 65535) {
      throw new Error('Invalid port number');
    }

    folderName = `${safeDatabase}_${timestamp}`;
    outputDir = path.join(outputPath, folderName);

    // Use --password via command (mongodump doesn't support env var)
    command = `mongodump --host ${safeHost} --port ${safePort} --username ${escapeShellArg(safeUsername)} --password ${escapeShellArg(config.password)} --db ${safeDatabase} --out="${outputDir}"`;
  }

  try {
    const startTime = Date.now();
    await execPromise(command, {
      maxBuffer: 1024 * 1024 * 500, // 500MB buffer for large databases
      timeout: 30 * 60 * 1000, // 30 minutes timeout for very large backups
    });
    const duration = Math.floor((Date.now() - startTime) / 1000);

    // Calculate folder size
    const size = await getFolderSize(outputDir);

    return {
      success: true,
      fileName: folderName,
      filePath: outputDir,
      fileSize: size,
      duration,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Restore MongoDB database from backup
 */
const restoreBackup = async (config, backupFolderPath) => {
  // Validate backup folder path
  if (!backupFolderPath || !fsSync.existsSync(backupFolderPath)) {
    throw new Error('Invalid backup folder path');
  }

  let command;
  if (config.connectionString) {
    // Validate connection string format
    if (!config.connectionString.startsWith('mongodb://') && !config.connectionString.startsWith('mongodb+srv://')) {
      throw new Error('Invalid MongoDB connection string format');
    }
    command = `mongorestore --uri=${escapeShellArg(config.connectionString)} --drop "${backupFolderPath}"`;
  } else {
    // Validate individual parameters
    const safeHost = validateInput(config.host, 'host', /^[a-zA-Z0-9\.\-]+$/);
    const safeUsername = validateInput(config.username, 'username', /^[a-zA-Z0-9_\-@\.]+$/);
    const safeDatabase = validateInput(config.database, 'database', /^[a-zA-Z0-9_\-]+$/);
    const safePort = parseInt(config.port, 10);

    if (isNaN(safePort) || safePort < 1 || safePort > 65535) {
      throw new Error('Invalid port number');
    }

    command = `mongorestore --host ${safeHost} --port ${safePort} --username ${escapeShellArg(safeUsername)} --password ${escapeShellArg(config.password)} --db ${safeDatabase} --drop "${backupFolderPath}"`;
  }

  try {
    const startTime = Date.now();
    await execPromise(command, {
      maxBuffer: 1024 * 1024 * 500, // 500MB buffer for large databases
      timeout: 30 * 60 * 1000, // 30 minutes timeout for very large restores
    });
    const duration = Math.floor((Date.now() - startTime) / 1000);

    return {
      success: true,
      duration,
      message: 'Restore completed successfully',
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Get database size
 */
const getDatabaseSize = async (config) => {
  let client;
  try {
    const uri =
      config.connectionString ||
      `mongodb://${config.username}:${config.password}@${config.host}:${config.port}/${config.database}`;

    client = new MongoClient(uri, {
      ssl: config.sslEnabled,
    });

    await client.connect();
    const db = client.db(config.database);
    const stats = await db.stats();

    return {
      success: true,
      size: stats.dataSize + stats.indexSize,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  } finally {
    if (client) {
      await client.close();
    }
  }
};

/**
 * Helper function to calculate folder size
 */
const getFolderSize = async (folderPath) => {
  let totalSize = 0;
  const files = await fs.readdir(folderPath, { withFileTypes: true });

  for (const file of files) {
    const filePath = path.join(folderPath, file.name);
    if (file.isDirectory()) {
      totalSize += await getFolderSize(filePath);
    } else {
      const stats = await fs.stat(filePath);
      totalSize += stats.size;
    }
  }

  return totalSize;
};

module.exports = {
  testConnection,
  createBackup,
  restoreBackup,
  getDatabaseSize,
};
