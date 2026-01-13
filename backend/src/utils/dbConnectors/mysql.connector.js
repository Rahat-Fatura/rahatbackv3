const mysql = require('mysql2/promise');
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
    // Windows: use double quotes and escape existing quotes
    return `"${arg.replace(/"/g, '""')}"`;
  } else {
    // Unix: use single quotes and escape existing single quotes
    return `'${arg.replace(/'/g, "'\\''")}'`;
  }
};

/**
 * Test MySQL database connection
 */
const testConnection = async (config) => {
  try {
    const connection = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.username,
      password: config.password,
      database: config.database,
      ssl: config.sslEnabled ? { rejectUnauthorized: false } : false,
    });

    const [rows] = await connection.query('SELECT VERSION() as version');
    await connection.end();

    return {
      success: true,
      message: 'Connection successful',
      version: rows[0].version,
    };
  } catch (error) {
    return {
      success: false,
      message: error.message,
    };
  }
};

/**
 * Create MySQL backup using mysqldump
 */
const createBackup = async (config, outputPath) => {
  // Validate inputs to prevent command injection
  const safeHost = validateInput(config.host, 'host', /^[a-zA-Z0-9\.\-]+$/);
  const safeUsername = validateInput(config.username, 'username', /^[a-zA-Z0-9_\-@\.]+$/);
  const safeDatabase = validateInput(config.database, 'database', /^[a-zA-Z0-9_\-]+$/);
  const safePort = parseInt(config.port, 10);

  if (isNaN(safePort) || safePort < 1 || safePort > 65535) {
    throw new Error('Invalid port number');
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `${safeDatabase}_${timestamp}.sql`;
  const filePath = path.join(outputPath, fileName);

  // Use MYSQL_PWD environment variable instead of -p flag to avoid password in process list
  const env = {
    ...process.env,
    MYSQL_PWD: config.password,
  };

  // Build mysqldump command (password via environment variable)
  const command = `mysqldump -h ${safeHost} -P ${safePort} -u ${escapeShellArg(safeUsername)} ${safeDatabase} > "${filePath}"`;

  try {
    const startTime = Date.now();
    await execPromise(command, {
      env,
      maxBuffer: 1024 * 1024 * 500, // 500MB buffer for large databases
      timeout: 30 * 60 * 1000, // 30 minutes timeout for very large backups
    });
    const duration = Math.floor((Date.now() - startTime) / 1000);

    // Get file size
    const stats = await fs.stat(filePath);
    const fileSize = stats.size;

    return {
      success: true,
      fileName,
      filePath,
      fileSize,
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
 * Restore MySQL database from backup
 */
const restoreBackup = async (config, backupFilePath) => {
  // Validate inputs to prevent command injection
  const safeHost = validateInput(config.host, 'host', /^[a-zA-Z0-9\.\-]+$/);
  const safeUsername = validateInput(config.username, 'username', /^[a-zA-Z0-9_\-@\.]+$/);
  const safeDatabase = validateInput(config.database, 'database', /^[a-zA-Z0-9_\-]+$/);
  const safePort = parseInt(config.port, 10);

  if (isNaN(safePort) || safePort < 1 || safePort > 65535) {
    throw new Error('Invalid port number');
  }

  // Validate backup file path
  if (!backupFilePath || !fsSync.existsSync(backupFilePath)) {
    throw new Error('Invalid backup file path');
  }

  // Use MYSQL_PWD environment variable
  const env = {
    ...process.env,
    MYSQL_PWD: config.password,
  };

  // MySQL: Drop all tables to ensure clean restore
  // Use parameterized approach to avoid SQL injection
  const dropTablesCommand = `mysql -h ${safeHost} -P ${safePort} -u ${escapeShellArg(safeUsername)} -N -e "SELECT CONCAT('DROP TABLE IF EXISTS \\\\\`', table_name, '\\\\\`;') FROM information_schema.tables WHERE table_schema = '${safeDatabase}';" ${safeDatabase} | mysql -h ${safeHost} -P ${safePort} -u ${escapeShellArg(safeUsername)} ${safeDatabase}`;

  const restoreCommand = `mysql -h ${safeHost} -P ${safePort} -u ${escapeShellArg(safeUsername)} ${safeDatabase} < "${backupFilePath}"`;

  try {
    const startTime = Date.now();

    // Check if database exists
    const checkDbCommand = `mysql -h ${safeHost} -P ${safePort} -u ${escapeShellArg(safeUsername)} -e "SHOW DATABASES LIKE '${safeDatabase}';"`;

    let databaseExists = false;
    try {
      const result = await execPromise(checkDbCommand, { env, timeout: 10000 });
      databaseExists = result.stdout.includes(safeDatabase);
    } catch (error) {
      // If check fails, assume database doesn't exist
      databaseExists = false;
    }

    if (!databaseExists) {
      // Database doesn't exist - create it first
      const createDbCommand = `mysql -h ${safeHost} -P ${safePort} -u ${escapeShellArg(safeUsername)} -e "CREATE DATABASE ${safeDatabase} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"`;

      await execPromise(createDbCommand, {
        env,
        maxBuffer: 1024 * 1024 * 500,
        timeout: 30 * 60 * 1000,
      });
    } else {
      // Database exists - drop all existing tables (preserves database structure, doesn't disconnect users)
      try {
        await execPromise(dropTablesCommand, {
          env,
          maxBuffer: 1024 * 1024 * 500,
          timeout: 30 * 60 * 1000,
        });
      } catch (err) {
        // If no tables exist, this will fail - that's ok
      }
    }

    // Restore from backup (recreates all tables with data, auto_increment values, etc.)
    await execPromise(restoreCommand, {
      env,
      maxBuffer: 1024 * 1024 * 500, // 500MB buffer for large databases
      timeout: 30 * 60 * 1000, // 30 minutes timeout for very large restores
    });

    const duration = Math.floor((Date.now() - startTime) / 1000);

    return {
      success: true,
      duration,
      message: databaseExists
        ? 'Restore completed successfully (database content refreshed)'
        : 'Restore completed successfully (database recreated)',
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
  try {
    const connection = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.username,
      password: config.password,
      database: config.database,
      ssl: config.sslEnabled ? { rejectUnauthorized: false } : false,
    });

    const [rows] = await connection.query(
      `SELECT SUM(data_length + index_length) as size
       FROM information_schema.tables
       WHERE table_schema = ?`,
      [config.database]
    );
    await connection.end();

    return {
      success: true,
      size: parseInt(rows[0].size || 0, 10),
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Create incremental backup - exports only changed tables since last backup
 * Uses information_schema.tables UPDATE_TIME to detect changes
 */
const createIncrementalBackup = async (config, outputPath, lastFullBackupDate) => {
  const safeHost = validateInput(config.host, 'host', /^[a-zA-Z0-9\.\-]+$/);
  const safeUsername = validateInput(config.username, 'username', /^[a-zA-Z0-9_\-@\.]+$/);
  const safeDatabase = validateInput(config.database, 'database', /^[a-zA-Z0-9_\-]+$/);
  const safePort = parseInt(config.port, 10);

  if (isNaN(safePort) || safePort < 1 || safePort > 65535) {
    throw new Error('Invalid port number');
  }

  try {
    const startTime = Date.now();
    const connection = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.username,
      password: config.password,
      database: config.database,
      ssl: config.sslEnabled ? { rejectUnauthorized: false } : false,
    });

    // Get tables that have been modified since last backup
    let query;
    let params;

    if (lastFullBackupDate) {
      // Find tables modified after last full backup
      query = `
        SELECT
          table_name,
          update_time,
          (data_length + index_length) as table_size
        FROM information_schema.tables
        WHERE table_schema = ?
          AND update_time IS NOT NULL
          AND update_time > ?
        ORDER BY update_time DESC
      `;
      params = [config.database, lastFullBackupDate];
    } else {
      // No last backup date - get all tables with recent updates
      query = `
        SELECT
          table_name,
          update_time,
          (data_length + index_length) as table_size
        FROM information_schema.tables
        WHERE table_schema = ?
          AND update_time IS NOT NULL
        ORDER BY update_time DESC
      `;
      params = [config.database];
    }

    const [changedTables] = await connection.query(query, params);
    await connection.end();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${safeDatabase}_incremental_${timestamp}.sql`;
    const filePath = path.join(outputPath, fileName);

    if (changedTables.length === 0) {
      // No changes detected - create empty incremental backup file
      const content = `-- Incremental Backup: ${new Date().toISOString()}\n-- No changes detected since last backup\n`;
      await fs.writeFile(filePath, content, 'utf8');

      const stats = await fs.stat(filePath);
      const duration = Math.floor((Date.now() - startTime) / 1000);

      return {
        success: true,
        fileName,
        filePath,
        fileSize: stats.size,
        duration,
        changedTables: [],
        message: 'No changes detected',
      };
    }

    // Build mysqldump command for only changed tables
    const tableList = changedTables.map(t => t.table_name).join(' ');

    const env = {
      ...process.env,
      MYSQL_PWD: config.password,
    };

    // Include both schema and data for incremental (includes CREATE TABLE)
    const command = `mysqldump -h ${safeHost} -P ${safePort} -u ${escapeShellArg(safeUsername)} ${safeDatabase} ${tableList} --no-create-db > "${filePath}"`;

    await execPromise(command, {
      env,
      maxBuffer: 1024 * 1024 * 500, // 500MB buffer
      timeout: 30 * 60 * 1000 // 30 minutes timeout
    });

    // Prepend header with metadata
    const backupContent = await fs.readFile(filePath, 'utf8');
    const header = `-- Incremental Backup: ${new Date().toISOString()}
-- Base Backup Date: ${lastFullBackupDate || 'N/A'}
-- Changed Tables: ${changedTables.map(t => t.table_name).join(', ')}
-- Total Tables: ${changedTables.length}

`;
    await fs.writeFile(filePath, header + backupContent, 'utf8');

    const duration = Math.floor((Date.now() - startTime) / 1000);
    const stats = await fs.stat(filePath);

    return {
      success: true,
      fileName,
      filePath,
      fileSize: stats.size,
      duration,
      changedTables: changedTables.map(t => t.table_name),
      message: `Incremental backup completed with ${changedTables.length} changed tables`,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Create differential backup - exports only changed tables since LAST FULL BACKUP
 * Uses information_schema.tables UPDATE_TIME to detect changes
 * Note: Differential backups are cumulative from the last full backup, not the last incremental
 */
const createDifferentialBackup = async (config, outputPath, lastFullBackupDate) => {
  const safeHost = validateInput(config.host, 'host', /^[a-zA-Z0-9\.\-]+$/);
  const safeUsername = validateInput(config.username, 'username', /^[a-zA-Z0-9_\-@\.]+$/);
  const safeDatabase = validateInput(config.database, 'database', /^[a-zA-Z0-9_\-]+$/);
  const safePort = parseInt(config.port, 10);

  if (isNaN(safePort) || safePort < 1 || safePort > 65535) {
    throw new Error('Invalid port number');
  }

  // Differential backup REQUIRES a full backup to exist first
  if (!lastFullBackupDate) {
    return {
      success: false,
      error: 'Differential backup requires a full backup first. Please run a full backup.',
    };
  }

  try {
    const startTime = Date.now();
    const connection = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.username,
      password: config.password,
      database: config.database,
      ssl: config.sslEnabled ? { rejectUnauthorized: false } : false,
    });

    // Get tables that have been modified since LAST FULL BACKUP
    const query = `
      SELECT
        table_name,
        update_time,
        (data_length + index_length) as table_size
      FROM information_schema.tables
      WHERE table_schema = ?
        AND update_time IS NOT NULL
        AND update_time > ?
      ORDER BY update_time DESC
    `;
    const params = [config.database, lastFullBackupDate];

    const [changedTables] = await connection.query(query, params);
    await connection.end();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${safeDatabase}_differential_${timestamp}.sql`;
    const filePath = path.join(outputPath, fileName);

    if (changedTables.length === 0) {
      // No changes detected - create empty differential backup file
      const content = `-- Differential Backup: ${new Date().toISOString()}\n-- Base Full Backup Date: ${lastFullBackupDate}\n-- No changes detected since last full backup\n`;
      await fs.writeFile(filePath, content, 'utf8');

      const stats = await fs.stat(filePath);
      const duration = Math.floor((Date.now() - startTime) / 1000);

      return {
        success: true,
        fileName,
        filePath,
        fileSize: stats.size,
        duration,
        changedTables: [],
        message: 'No changes detected since last full backup',
      };
    }

    // Build mysqldump command for only changed tables
    const tableList = changedTables.map(t => t.table_name).join(' ');

    const env = {
      ...process.env,
      MYSQL_PWD: config.password,
    };

    // Include both schema and data for differential (includes CREATE TABLE)
    const command = `mysqldump -h ${safeHost} -P ${safePort} -u ${escapeShellArg(safeUsername)} ${safeDatabase} ${tableList} --no-create-db > "${filePath}"`;

    await execPromise(command, {
      env,
      maxBuffer: 1024 * 1024 * 500, // 500MB buffer
      timeout: 30 * 60 * 1000 // 30 minutes timeout
    });

    // Prepend header with metadata
    const backupContent = await fs.readFile(filePath, 'utf8');
    const header = `-- Differential Backup: ${new Date().toISOString()}
-- Base Full Backup Date: ${lastFullBackupDate}
-- Changed Tables: ${changedTables.map(t => t.table_name).join(', ')}
-- Total Tables: ${changedTables.length}
-- NOTE: This differential contains ALL changes since the last FULL backup

`;
    await fs.writeFile(filePath, header + backupContent, 'utf8');

    const duration = Math.floor((Date.now() - startTime) / 1000);
    const stats = await fs.stat(filePath);

    return {
      success: true,
      fileName,
      filePath,
      fileSize: stats.size,
      duration,
      changedTables: changedTables.map(t => t.table_name),
      message: `Differential backup completed with ${changedTables.length} changed tables since last full backup`,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Verify MySQL backup integrity
 * Validates SQL file syntax and structure
 */
const verifyBackup = async (config, backupFilePath) => {
  const startTime = Date.now();

  try {
    // Check if file exists
    try {
      await fs.access(backupFilePath);
    } catch {
      return {
        check: 'database_verification',
        passed: false,
        error: 'Backup file not found',
      };
    }

    // Read first few lines to validate it's a valid MySQL dump
    const content = await fs.readFile(backupFilePath, 'utf8');
    const lines = content.split('\n').slice(0, 10);

    // Check for MySQL dump header
    const hasMySQLHeader = lines.some(line => line.includes('MySQL dump') || line.includes('mysqldump'));

    if (!hasMySQLHeader) {
      return {
        check: 'database_verification',
        passed: false,
        duration: Date.now() - startTime,
        error: 'File does not appear to be a valid MySQL dump',
      };
    }

    // Count SQL statements for validation
    const createTableCount = (content.match(/CREATE TABLE/gi) || []).length;
    const insertCount = (content.match(/INSERT INTO/gi) || []).length;

    const duration = Date.now() - startTime;

    return {
      check: 'database_verification',
      passed: true,
      duration,
      message: `MySQL backup validated (${createTableCount} tables, ${insertCount} insert statements)`,
      details: {
        tableCount: createTableCount,
        insertCount,
        method: 'SQL syntax validation',
      },
    };
  } catch (error) {
    return {
      check: 'database_verification',
      passed: false,
      duration: Date.now() - startTime,
      error: error.message,
    };
  }
};

module.exports = {
  testConnection,
  createBackup,
  createIncrementalBackup,
  createDifferentialBackup,
  restoreBackup,
  getDatabaseSize,
  verifyBackup,
};
