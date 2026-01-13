const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { PassThrough } = require('stream');
const logger = require('../../config/logger');

/**
 * PostgreSQL Database Connector
 * Uses pg_dump for backup and psql for restore
 */

/**
 * Test PostgreSQL connection
 * @param {Object} dbConfig - Database configuration
 * @returns {Promise<Object>} - Connection test result
 */
const testConnection = async (dbConfig) => {
  const { host, port, username, password, database } = dbConfig;

  return new Promise((resolve, reject) => {
    // Use psql to test connection
    const command = `"${getPsqlPath()}" -h ${host} -p ${port || 5432} -U "${username}" -d ${database} -c "SELECT 1" -t`;

    const env = {
      ...process.env,
      PGPASSWORD: password,
    };

    exec(command, { env }, (error, stdout, stderr) => {
      if (error) {
        logger.error(`PostgreSQL connection test failed: ${stderr || error.message}`);
        resolve({
          success: false,
          error: stderr || error.message,
        });
        return;
      }

      logger.info(`PostgreSQL connection test successful for database: ${database}`);
      resolve({
        success: true,
        message: 'Connection successful',
      });
    });
  });
};

/**
 * Create PostgreSQL backup using pg_dump
 * @param {Object} dbConfig - Database configuration
 * @param {string} outputPath - Output file path
 * @param {Object} options - Backup options
 * @returns {Promise<Object>} - Backup result
 */
const createBackup = async (dbConfig, outputPath, options = {}) => {
  const { host, port, username, password, database } = dbConfig;
  const { format = 'plain', compression = true } = options;

  return new Promise((resolve, reject) => {
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Build pg_dump command
    let command = `"${getPgDumpPath()}" -h ${host} -p ${port || 5432} -U "${username}" -d ${database}`;

    // Format options
    if (format === 'plain') {
      command += ' -F p'; // Plain SQL
    } else if (format === 'custom') {
      command += ' -F c'; // Custom compressed format
    } else if (format === 'tar') {
      command += ' -F t'; // Tar format
    }

    // Add --clean and --if-exists for safe restore
    // This includes DROP commands in the backup file
    command += ' --clean --if-exists';

    // Encoding
    command += ' --encoding=UTF8';

    // Output file
    command += ` -f "${outputPath}"`;

    logger.info(`Starting PostgreSQL backup: ${database}`);
    logger.debug(`Backup command: ${command.replace(password, '***')}`);

    const env = {
      ...process.env,
      PGPASSWORD: password,
    };

    const childProcess = exec(command, { env, maxBuffer: 1024 * 1024 * 100 }, (error, stdout, stderr) => {
      if (error) {
        logger.error(`PostgreSQL backup failed: ${stderr || error.message}`);
        reject(new Error(stderr || error.message));
        return;
      }

      // Get file size
      const stats = fs.statSync(outputPath);
      const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);

      logger.info(`PostgreSQL backup completed: ${database} (${fileSizeInMB} MB)`);

      resolve({
        success: true,
        filePath: outputPath,
        fileSize: stats.size,
        fileSizeMB: fileSizeInMB,
        database,
      });
    });

    // Handle progress (pg_dump doesn't have built-in progress, but we can estimate)
    childProcess.stderr.on('data', (data) => {
      logger.debug(`pg_dump: ${data.toString()}`);
    });
  });
};

/**
 * Restore PostgreSQL backup using psql
 * @param {Object} dbConfig - Database configuration
 * @param {string} backupPath - Backup file path
 * @param {Object} options - Restore options
 * @returns {Promise<Object>} - Restore result
 */
const restoreBackup = async (dbConfig, backupPath, options = {}) => {
  const { host, port, username, password, database } = dbConfig;
  const { dropDatabase = false, createDatabase = false } = options;

  return new Promise(async (resolve, reject) => {
    if (!fs.existsSync(backupPath)) {
      reject(new Error(`Backup file not found: ${backupPath}`));
      return;
    }

    const env = {
      ...process.env,
      PGPASSWORD: password,
    };

    try {
      // Check if database exists
      logger.info(`Checking if database exists: ${database}`);
      const checkCmd = `"${getPsqlPath()}" -h ${host} -p ${port || 5432} -U "${username}" -d postgres -t -c "SELECT 1 FROM pg_database WHERE datname='${database}'"`;

      let databaseExists = false;
      try {
        const result = await execPromise(checkCmd, { env });
        databaseExists = result.trim() === '1';
      } catch (error) {
        logger.debug(`Database check failed, assuming it doesn't exist: ${error.message}`);
      }

      if (!databaseExists) {
        // Database doesn't exist, create it
        logger.info(`Database ${database} does not exist. Creating...`);
        const createCmd = `"${getPsqlPath()}" -h ${host} -p ${port || 5432} -U "${username}" -d postgres -c "CREATE DATABASE \\"${database}\\""`;
        await execPromise(createCmd, { env });
        logger.info(`Database ${database} created successfully`);
      } else {
        // Database exists - backup file includes DROP commands (--clean --if-exists)
        logger.info(`Database ${database} exists. Backup includes DROP commands for clean restore.`);
      }

      // Restore backup
      // The backup file already contains DROP IF EXISTS commands from pg_dump --clean --if-exists
      logger.info(`Starting PostgreSQL restore: ${database}`);
      const command = `"${getPsqlPath()}" -h ${host} -p ${port || 5432} -U "${username}" -d ${database} -f "${backupPath}"`;

      exec(command, { env, maxBuffer: 1024 * 1024 * 100 }, (error, stdout, stderr) => {
        if (error) {
          // psql sometimes writes warnings to stderr even on success
          // Check if it's a critical error
          if (stderr && !stderr.includes('NOTICE') && !stderr.includes('WARNING')) {
            logger.error(`PostgreSQL restore failed: ${stderr || error.message}`);
            reject(new Error(stderr || error.message));
            return;
          }
        }

        logger.info(`PostgreSQL restore completed: ${database}`);
        resolve({
          success: true,
          database,
        });
      });
    } catch (error) {
      logger.error(`PostgreSQL restore failed: ${error.message}`);
      reject(error);
    }
  });
};

/**
 * Create PostgreSQL backup as a stream (for large databases)
 * This streams the backup directly without writing to disk first
 * @param {Object} dbConfig - Database configuration
 * @param {Object} options - Backup options
 * @returns {Promise<Object>} - Stream and metadata
 */
const createBackupStream = async (dbConfig, options = {}) => {
  const { host, port, username, password, database } = dbConfig;
  const { format = 'plain' } = options;

  return new Promise((resolve, reject) => {
    // Build pg_dump command args
    const args = [
      '-h', host,
      '-p', String(port || 5432),
      '-U', username,
      '-d', database,
    ];

    // Format options
    if (format === 'plain') {
      args.push('-F', 'p'); // Plain SQL
    } else if (format === 'custom') {
      args.push('-F', 'c'); // Custom compressed format
    } else if (format === 'tar') {
      args.push('-F', 't'); // Tar format
    }

    // Add --clean and --if-exists for safe restore
    args.push('--clean', '--if-exists');

    // Encoding
    args.push('--encoding=UTF8');

    logger.info(`Starting PostgreSQL streaming backup: ${database}`);
    logger.debug(`pg_dump args: ${args.join(' ')}`);

    const env = {
      ...process.env,
      PGPASSWORD: password,
    };

    // Spawn pg_dump process
    const pgDump = spawn(getPgDumpPath(), args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe'], // stdin ignored, stdout piped, stderr piped
    });

    // Create a passthrough stream with backpressure handling
    const dataStream = new PassThrough({
      highWaterMark: 64 * 1024, // 64KB buffer (smaller for better backpressure)
    });

    let totalBytes = 0;
    let hasError = false;
    let errorMessage = '';

    // Pipe stdout to our stream with proper backpressure
    pgDump.stdout.pipe(dataStream);

    // Track size
    pgDump.stdout.on('data', (chunk) => {
      totalBytes += chunk.length;
    });

    // Capture stderr for errors
    pgDump.stderr.on('data', (data) => {
      const message = data.toString();
      logger.debug(`pg_dump stderr: ${message}`);

      // Only treat as error if it's not a notice/warning
      if (!message.includes('NOTICE') && !message.includes('WARNING')) {
        hasError = true;
        errorMessage += message;
      }
    });

    // Handle process completion
    pgDump.on('close', (code) => {
      if (code !== 0 || hasError) {
        logger.error(`PostgreSQL streaming backup failed with code ${code}: ${errorMessage}`);
        dataStream.destroy(new Error(errorMessage || `pg_dump exited with code ${code}`));
      } else {
        const sizeMB = (totalBytes / (1024 * 1024)).toFixed(2);
        logger.info(`PostgreSQL streaming backup completed: ${database} (${sizeMB} MB)`);
        dataStream.end();
      }
    });

    pgDump.on('error', (error) => {
      logger.error(`pg_dump process error: ${error.message}`);
      dataStream.destroy(error);
      reject(error);
    });

    // Resolve immediately with the stream
    resolve({
      stream: dataStream,
      pgDumpProcess: pgDump,
      database,
      // Getter for current size (useful for progress tracking)
      getCurrentSize: () => totalBytes,
    });
  });
};

/**
 * Get PostgreSQL version
 * @param {Object} dbConfig - Database configuration
 * @returns {Promise<string>} - PostgreSQL version
 */
const getVersion = async (dbConfig) => {
  const { host, port, username, password, database } = dbConfig;

  return new Promise((resolve, reject) => {
    const command = `"${getPsqlPath()}" -h ${host} -p ${port || 5432} -U "${username}" -d ${database} -c "SELECT version()" -t`;

    const env = {
      ...process.env,
      PGPASSWORD: password,
    };

    exec(command, { env }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }

      resolve(stdout.trim());
    });
  });
};

/**
 * Get pg_dump executable path
 * @returns {string} - Path to pg_dump
 */
function getPgDumpPath() {
  // For Windows, always use full path to avoid "system cannot find the path" error
  if (process.platform === 'win32') {
    const fs = require('fs');
    const possiblePaths = [
      'C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe',
      'C:\\Program Files\\PostgreSQL\\15\\bin\\pg_dump.exe',
      'C:\\Program Files\\PostgreSQL\\14\\bin\\pg_dump.exe',
      'C:\\Program Files\\PostgreSQL\\13\\bin\\pg_dump.exe',
      'C:\\Program Files\\PostgreSQL\\12\\bin\\pg_dump.exe',
    ];

    // Find first existing path
    for (const pgPath of possiblePaths) {
      if (fs.existsSync(pgPath)) {
        return pgPath;
      }
    }

    // Fallback to pg_dump in PATH (if available)
    return 'pg_dump';
  }

  // Linux/Mac
  return 'pg_dump';
}

/**
 * Get psql executable path
 * @returns {string} - Path to psql
 */
function getPsqlPath() {
  // For Windows, always use full path
  if (process.platform === 'win32') {
    const fs = require('fs');
    const possiblePaths = [
      'C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe',
      'C:\\Program Files\\PostgreSQL\\15\\bin\\psql.exe',
      'C:\\Program Files\\PostgreSQL\\14\\bin\\psql.exe',
      'C:\\Program Files\\PostgreSQL\\13\\bin\\psql.exe',
      'C:\\Program Files\\PostgreSQL\\12\\bin\\psql.exe',
    ];

    // Find first existing path
    for (const psqlPath of possiblePaths) {
      if (fs.existsSync(psqlPath)) {
        return psqlPath;
      }
    }

    // Fallback
    return 'psql';
  }

  // Linux/Mac
  return 'psql';
}

/**
 * Promisified exec
 */
function execPromise(command, options) {
  return new Promise((resolve, reject) => {
    exec(command, options, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout);
    });
  });
}

module.exports = {
  testConnection,
  createBackup,
  createBackupStream,
  restoreBackup,
  getVersion,
};
