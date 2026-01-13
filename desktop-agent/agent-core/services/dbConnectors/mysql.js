const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const logger = require('../../config/logger');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * MySQL Database Connector
 * Uses mysqldump for backup
 */

/**
 * Test MySQL connection
 */
async function testConnection(config) {
  const { host, port, username, password, database } = config;

  try {
    // Use mysql command to test connection
    const testCommand = `mysql -h ${host} -P ${port} -u ${username} ${password ? `-p"${password}"` : ''} -e "SELECT 1" ${database}`;

    await execAsync(testCommand, {
      timeout: 10000,
      windowsHide: true,
    });

    logger.info(`MySQL connection successful: ${database}@${host}:${port}`);
    return { success: true };
  } catch (error) {
    logger.error(`MySQL connection failed: ${error.message}`);
    throw new Error(`MySQL connection failed: ${error.message}`);
  }
}

/**
 * Create MySQL backup using mysqldump
 */
async function createBackup(config, outputPath, progressCallback) {
  const { host, port, username, password, database } = config;

  try {
    logger.info(`Starting MySQL backup: ${database}`);

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    if (progressCallback) {
      progressCallback({ status: 'running', message: 'Starting MySQL backup...', progress: 10 });
    }

    // Build mysqldump command
    // --single-transaction: For InnoDB tables, consistent backup without locking
    // --routines: Include stored procedures and functions
    // --triggers: Include triggers
    // --events: Include events
    // --add-drop-database: Add DROP DATABASE before CREATE
    const dumpCommand = [
      'mysqldump',
      `-h ${host}`,
      `-P ${port}`,
      `-u ${username}`,
      password ? `-p"${password}"` : '',
      '--single-transaction',
      '--routines',
      '--triggers',
      '--events',
      '--add-drop-database',
      '--databases',
      database,
      `> "${outputPath}"`,
    ].filter(Boolean).join(' ');

    if (progressCallback) {
      progressCallback({ status: 'running', message: 'Running mysqldump...', progress: 30 });
    }

    logger.debug(`MySQL dump command: ${dumpCommand.replace(password || '', '***')}`);

    // Execute mysqldump
    await execAsync(dumpCommand, {
      timeout: 600000, // 10 minutes
      maxBuffer: 500 * 1024 * 1024, // 500MB buffer
      windowsHide: true,
      shell: true,
    });

    // Check if backup file was created
    if (!fs.existsSync(outputPath)) {
      throw new Error('Backup file was not created');
    }

    const stats = fs.statSync(outputPath);
    const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);

    if (progressCallback) {
      progressCallback({
        status: 'running',
        message: `MySQL backup completed: ${fileSizeMB} MB`,
        progress: 90
      });
    }

    logger.info(`MySQL backup completed: ${database} (${fileSizeMB} MB)`);

    return {
      success: true,
      filePath: outputPath,
      fileSize: stats.size,
      database: database,
    };
  } catch (error) {
    logger.error(`MySQL backup failed: ${error.message}`);

    // Clean up failed backup file
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    throw new Error(`MySQL backup failed: ${error.message}`);
  }
}

/**
 * Restore MySQL backup
 */
async function restoreBackup(config, backupPath, progressCallback) {
  const { host, port, username, password, database } = config;

  try {
    logger.info(`Starting MySQL restore: ${database}`);

    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup file not found: ${backupPath}`);
    }

    if (progressCallback) {
      progressCallback({ status: 'running', message: 'Starting MySQL restore...', progress: 10 });
    }

    // Build mysql restore command
    const restoreCommand = [
      'mysql',
      `-h ${host}`,
      `-P ${port}`,
      `-u ${username}`,
      password ? `-p"${password}"` : '',
      `< "${backupPath}"`,
    ].filter(Boolean).join(' ');

    if (progressCallback) {
      progressCallback({ status: 'running', message: 'Restoring database...', progress: 50 });
    }

    await execAsync(restoreCommand, {
      timeout: 600000, // 10 minutes
      maxBuffer: 500 * 1024 * 1024, // 500MB buffer
      windowsHide: true,
      shell: true,
    });

    if (progressCallback) {
      progressCallback({ status: 'running', message: 'Restore completed', progress: 100 });
    }

    logger.info(`MySQL restore completed: ${database}`);

    return {
      success: true,
      database: database,
    };
  } catch (error) {
    logger.error(`MySQL restore failed: ${error.message}`);
    throw new Error(`MySQL restore failed: ${error.message}`);
  }
}

module.exports = {
  testConnection,
  createBackup,
  restoreBackup,
};
