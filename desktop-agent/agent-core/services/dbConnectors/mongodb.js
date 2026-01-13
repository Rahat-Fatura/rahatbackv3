const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const logger = require('../../config/logger');
const { promisify } = require('util');
const { MongoClient } = require('mongodb');

const execAsync = promisify(exec);

/**
 * MongoDB Database Connector
 * Uses mongodump for backup and mongorestore for restore
 */

/**
 * Build MongoDB connection string
 */
function buildConnectionString(config) {
  const { host, port, username, password, database, connectionString } = config;

  // If custom connection string provided, use it
  if (connectionString) {
    return connectionString;
  }

  // Build connection string
  const auth = username && password ? `${username}:${encodeURIComponent(password)}@` : '';
  return `mongodb://${auth}${host}:${port}/${database}`;
}

/**
 * Test MongoDB connection
 */
async function testConnection(config) {
  const connectionString = buildConnectionString(config);
  const client = new MongoClient(connectionString, {
    serverSelectionTimeoutMS: 5000,
  });

  try {
    await client.connect();
    await client.db().admin().ping();
    logger.info(`MongoDB connection successful: ${config.database}`);
    return { success: true };
  } catch (error) {
    logger.error(`MongoDB connection failed: ${error.message}`);
    throw new Error(`MongoDB connection failed: ${error.message}`);
  } finally {
    await client.close();
  }
}

/**
 * Create MongoDB backup using mongodump
 */
async function createBackup(config, outputPath, progressCallback) {
  const { host, port, username, password, database } = config;

  try {
    logger.info(`Starting MongoDB backup: ${database}`);

    // Output directory for mongodump (it creates a folder structure)
    const backupDir = path.dirname(outputPath);
    const backupName = path.basename(outputPath, path.extname(outputPath));
    const dumpDir = path.join(backupDir, backupName);

    // Ensure output directory exists
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    if (progressCallback) {
      progressCallback({ status: 'running', message: 'Starting MongoDB backup...', progress: 10 });
    }

    // Build mongodump command
    const dumpCommand = [
      'mongodump',
      `--host=${host}`,
      `--port=${port}`,
      username ? `--username=${username}` : '',
      password ? `--password="${password}"` : '',
      `--db=${database}`,
      `--out="${dumpDir}"`,
      '--gzip', // Compress output
    ].filter(Boolean).join(' ');

    if (progressCallback) {
      progressCallback({ status: 'running', message: 'Running mongodump...', progress: 30 });
    }

    logger.debug(`MongoDB dump command: ${dumpCommand.replace(password || '', '***')}`);

    // Execute mongodump
    await execAsync(dumpCommand, {
      timeout: 600000, // 10 minutes
      maxBuffer: 500 * 1024 * 1024, // 500MB buffer
      windowsHide: true,
    });

    // Check if backup was created
    const dbDumpDir = path.join(dumpDir, database);
    if (!fs.existsSync(dbDumpDir)) {
      throw new Error('Backup directory was not created');
    }

    // Archive the dump directory into the output file
    if (progressCallback) {
      progressCallback({ status: 'running', message: 'Archiving backup...', progress: 70 });
    }

    // Use tar to create archive (works on Windows with Git Bash or WSL)
    const tarCommand = process.platform === 'win32'
      ? `cd "${backupDir}" && tar -czf "${backupName}.tar.gz" "${backupName}"`
      : `tar -czf "${outputPath}" -C "${backupDir}" "${backupName}"`;

    await execAsync(tarCommand, {
      timeout: 300000, // 5 minutes
      windowsHide: true,
      shell: true,
    });

    // Get final archive size
    const finalPath = process.platform === 'win32'
      ? path.join(backupDir, `${backupName}.tar.gz`)
      : outputPath;

    const stats = fs.existsSync(finalPath) ? fs.statSync(finalPath) : null;
    const fileSizeMB = stats ? (stats.size / 1024 / 1024).toFixed(2) : 'Unknown';

    // Clean up dump directory
    if (fs.existsSync(dumpDir)) {
      fs.rmSync(dumpDir, { recursive: true, force: true });
    }

    if (progressCallback) {
      progressCallback({
        status: 'running',
        message: `MongoDB backup completed: ${fileSizeMB} MB`,
        progress: 90
      });
    }

    logger.info(`MongoDB backup completed: ${database} (${fileSizeMB} MB)`);

    return {
      success: true,
      filePath: finalPath,
      fileSize: stats ? stats.size : 0,
      database: database,
    };
  } catch (error) {
    logger.error(`MongoDB backup failed: ${error.message}`);

    // Clean up failed backup
    const backupDir = path.dirname(outputPath);
    const backupName = path.basename(outputPath, path.extname(outputPath));
    const dumpDir = path.join(backupDir, backupName);

    if (fs.existsSync(dumpDir)) {
      fs.rmSync(dumpDir, { recursive: true, force: true });
    }

    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    throw new Error(`MongoDB backup failed: ${error.message}`);
  }
}

/**
 * Restore MongoDB backup
 */
async function restoreBackup(config, backupPath, progressCallback) {
  const { host, port, username, password, database } = config;

  try {
    logger.info(`Starting MongoDB restore: ${database}`);

    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup file not found: ${backupPath}`);
    }

    if (progressCallback) {
      progressCallback({ status: 'running', message: 'Extracting backup...', progress: 10 });
    }

    // Extract archive
    const backupDir = path.dirname(backupPath);
    const extractCommand = process.platform === 'win32'
      ? `cd "${backupDir}" && tar -xzf "${path.basename(backupPath)}"`
      : `tar -xzf "${backupPath}" -C "${backupDir}"`;

    await execAsync(extractCommand, {
      timeout: 300000, // 5 minutes
      windowsHide: true,
      shell: true,
    });

    if (progressCallback) {
      progressCallback({ status: 'running', message: 'Starting MongoDB restore...', progress: 30 });
    }

    // Find the extracted dump directory
    const backupName = path.basename(backupPath, path.extname(backupPath)).replace('.tar', '');
    const dumpDir = path.join(backupDir, backupName);

    if (!fs.existsSync(dumpDir)) {
      throw new Error('Extracted dump directory not found');
    }

    // Build mongorestore command
    const restoreCommand = [
      'mongorestore',
      `--host=${host}`,
      `--port=${port}`,
      username ? `--username=${username}` : '',
      password ? `--password="${password}"` : '',
      `--db=${database}`,
      '--gzip',
      '--drop', // Drop collections before restoring
      `"${path.join(dumpDir, database)}"`,
    ].filter(Boolean).join(' ');

    if (progressCallback) {
      progressCallback({ status: 'running', message: 'Restoring database...', progress: 50 });
    }

    await execAsync(restoreCommand, {
      timeout: 600000, // 10 minutes
      maxBuffer: 500 * 1024 * 1024, // 500MB buffer
      windowsHide: true,
    });

    // Clean up extracted directory
    if (fs.existsSync(dumpDir)) {
      fs.rmSync(dumpDir, { recursive: true, force: true });
    }

    if (progressCallback) {
      progressCallback({ status: 'running', message: 'Restore completed', progress: 100 });
    }

    logger.info(`MongoDB restore completed: ${database}`);

    return {
      success: true,
      database: database,
    };
  } catch (error) {
    logger.error(`MongoDB restore failed: ${error.message}`);
    throw new Error(`MongoDB restore failed: ${error.message}`);
  }
}

module.exports = {
  testConnection,
  createBackup,
  restoreBackup,
};
