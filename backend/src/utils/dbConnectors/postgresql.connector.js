const { Client } = require('pg');
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

// PostgreSQL binary path detection
const getPgBinPath = () => {
  if (os.platform() === 'win32') {
    // Windows: Check common PostgreSQL installation paths
    const commonPaths = [
      'C:\\Program Files\\PostgreSQL\\16\\bin',
      'C:\\Program Files\\PostgreSQL\\15\\bin',
      'C:\\Program Files\\PostgreSQL\\14\\bin',
      'C:\\Program Files\\PostgreSQL\\13\\bin',
      'C:\\Program Files (x86)\\PostgreSQL\\16\\bin',
      'C:\\Program Files (x86)\\PostgreSQL\\15\\bin',
      'C:\\Program Files (x86)\\PostgreSQL\\14\\bin',
    ];

    // Return first existing path, or assume it's in PATH
    const existingPath = commonPaths.find(p => {
      try {
        return require('fs').existsSync(path.join(p, 'pg_dump.exe'));
      } catch {
        return false;
      }
    });

    return existingPath || '';
  }
  return ''; // Unix systems: assume in PATH
};

const PG_BIN_PATH = getPgBinPath();
const PG_DUMP = PG_BIN_PATH ? path.join(PG_BIN_PATH, 'pg_dump') : 'pg_dump';
const PSQL = PG_BIN_PATH ? path.join(PG_BIN_PATH, 'psql') : 'psql';

/**
 * Test PostgreSQL database connection
 */
const testConnection = async (config) => {
  const client = new Client({
    host: config.host,
    port: config.port,
    user: config.username,
    password: config.password,
    database: config.database,
    ssl: config.sslEnabled ? { rejectUnauthorized: false } : false,
  });

  try {
    await client.connect();
    const result = await client.query('SELECT version()');
    await client.end();
    return {
      success: true,
      message: 'Connection successful',
      version: result.rows[0].version,
    };
  } catch (error) {
    return {
      success: false,
      message: error.message,
    };
  }
};

/**
 * Create PostgreSQL backup using pg_dump
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

  // Set environment variable for password
  const env = {
    ...process.env,
    PGPASSWORD: config.password,
  };

  // Build pg_dump command (without -C to avoid locale encoding issues)
  // We'll add CREATE DATABASE manually with safe UTF8 locale
  const command = `"${PG_DUMP}" -h ${safeHost} -p ${safePort} -U ${escapeShellArg(safeUsername)} -d ${safeDatabase} -F p --encoding=UTF8 -f "${filePath}"`;

  try {
    const startTime = Date.now();
    await execPromise(command, {
      env,
      maxBuffer: 1024 * 1024 * 500, // 500MB buffer for large databases
      timeout: 30 * 60 * 1000 // 30 minutes timeout for very large backups
    });

    // Prepend CREATE DATABASE command with UTF8 locale (avoiding Windows Turkish locale issues)
    const backupContent = await fs.readFile(filePath, 'utf8');
    const createDbCommand = `--
-- Database creation with UTF8 encoding (safe for all platforms)
--

CREATE DATABASE ${safeDatabase} WITH ENCODING = 'UTF8' LC_COLLATE = 'C' LC_CTYPE = 'C' TEMPLATE = template0;

ALTER DATABASE ${safeDatabase} OWNER TO ${safeUsername};

\\connect ${safeDatabase}

`;
    await fs.writeFile(filePath, createDbCommand + backupContent, 'utf8');

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
 * Restore PostgreSQL database from backup
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

  const env = {
    ...process.env,
    PGPASSWORD: config.password,
  };

  try {
    const startTime = Date.now();

    // Check if database exists (using parameterized query style - safe)
    const checkDbCommand = `"${PSQL}" -h ${safeHost} -p ${safePort} -U ${escapeShellArg(safeUsername)} -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${safeDatabase}'"`;

    let databaseExists = false;
    try {
      const result = await execPromise(checkDbCommand, { env, timeout: 10000 });
      databaseExists = result.stdout.trim() === '1';
    } catch (error) {
      // If check fails, assume database doesn't exist
      databaseExists = false;
    }

    if (databaseExists) {
      // Database exists - drop schema and restore (keeps connections alive)
      const dropSchemaCommand = `"${PSQL}" -h ${safeHost} -p ${safePort} -U ${escapeShellArg(safeUsername)} -d ${safeDatabase} -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO ${safeUsername}; GRANT ALL ON SCHEMA public TO public;"`;

      await execPromise(dropSchemaCommand, {
        env,
        maxBuffer: 1024 * 1024 * 500, // 500MB buffer for large databases
        timeout: 30 * 60 * 1000, // 30 minutes timeout
      });

      // Restore to existing database
      const restoreCommand = `"${PSQL}" -h ${safeHost} -p ${safePort} -U ${escapeShellArg(safeUsername)} -d ${safeDatabase} -f "${backupFilePath}"`;

      await execPromise(restoreCommand, {
        env,
        maxBuffer: 1024 * 1024 * 500,
        timeout: 30 * 60 * 1000,
      });
    } else {
      // Database doesn't exist - create it first with safe UTF8 locale (no Turkish locale issues)
      // CREATE DATABASE cannot run in a transaction, so we use separate commands
      const createDbCommand = `"${PSQL}" -h ${safeHost} -p ${safePort} -U ${escapeShellArg(safeUsername)} -d postgres -c "CREATE DATABASE ${safeDatabase} WITH ENCODING = 'UTF8' LC_COLLATE = 'C' LC_CTYPE = 'C' TEMPLATE = template0"`;

      await execPromise(createDbCommand, {
        env,
        maxBuffer: 1024 * 1024 * 500,
        timeout: 30 * 60 * 1000,
      });

      // Alter database owner in separate command
      const alterOwnerCommand = `"${PSQL}" -h ${safeHost} -p ${safePort} -U ${escapeShellArg(safeUsername)} -d postgres -c "ALTER DATABASE ${safeDatabase} OWNER TO ${safeUsername}"`;

      await execPromise(alterOwnerCommand, {
        env,
        maxBuffer: 1024 * 1024 * 500,
        timeout: 30 * 60 * 1000,
      });

      // Now restore to the newly created database
      const restoreCommand = `"${PSQL}" -h ${safeHost} -p ${safePort} -U ${escapeShellArg(safeUsername)} -d ${safeDatabase} -f "${backupFilePath}"`;

      await execPromise(restoreCommand, {
        env,
        maxBuffer: 1024 * 1024 * 500,
        timeout: 30 * 60 * 1000,
      });
    }

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
  const client = new Client({
    host: config.host,
    port: config.port,
    user: config.username,
    password: config.password,
    database: config.database,
    ssl: config.sslEnabled ? { rejectUnauthorized: false } : false,
  });

  try {
    await client.connect();
    const result = await client.query(
      `SELECT pg_database_size('${config.database}') as size`
    );
    await client.end();
    return {
      success: true,
      size: parseInt(result.rows[0].size, 10),
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
 * Uses pg_stat_user_tables to detect changes
 */
const createIncrementalBackup = async (config, outputPath, lastFullBackupDate) => {
  const safeHost = validateInput(config.host, 'host', /^[a-zA-Z0-9\.\-]+$/);
  const safeUsername = validateInput(config.username, 'username', /^[a-zA-Z0-9_\-@\.]+$/);
  const safeDatabase = validateInput(config.database, 'database', /^[a-zA-Z0-9_\-]+$/);
  const safePort = parseInt(config.port, 10);

  if (isNaN(safePort) || safePort < 1 || safePort > 65535) {
    throw new Error('Invalid port number');
  }

  const client = new Client({
    host: config.host,
    port: config.port,
    user: config.username,
    password: config.password,
    database: config.database,
    ssl: config.sslEnabled ? { rejectUnauthorized: false } : false,
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `${safeDatabase}_incremental_${timestamp}.sql`;
  const filePath = path.join(outputPath, fileName);

  try {
    const startTime = Date.now();
    await client.connect();

    // Get tables that have been modified since last backup
    // Using n_tup_ins, n_tup_upd, n_tup_del from pg_stat_user_tables
    const tablesQuery = `
      SELECT
        schemaname,
        relname as tablename,
        n_tup_ins + n_tup_upd + n_tup_del as total_changes
      FROM pg_stat_user_tables
      WHERE schemaname = 'public'
      ORDER BY total_changes DESC
    `;

    const result = await client.query(tablesQuery);
    const changedTables = result.rows.filter(row => row.total_changes > 0);

    await client.end();

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

    // Build pg_dump command for only changed tables
    const tableList = changedTables.map(t => `-t ${t.tablename}`).join(' ');

    const env = {
      ...process.env,
      PGPASSWORD: config.password,
    };

    // Include both table schema and data (no --data-only, no --create)
    // --create includes CREATE DATABASE which causes issues, so we skip it
    // This includes CREATE TABLE statements automatically
    const command = `"${PG_DUMP}" -h ${safeHost} -p ${safePort} -U ${escapeShellArg(safeUsername)} -d ${safeDatabase} ${tableList} -F p --encoding=UTF8 -f "${filePath}"`;

    await execPromise(command, {
      env,
      maxBuffer: 1024 * 1024 * 500, // 500MB buffer
      timeout: 30 * 60 * 1000 // 30 minutes timeout
    });

    // Prepend header with metadata
    const backupContent = await fs.readFile(filePath, 'utf8');
    const header = `-- Incremental Backup: ${new Date().toISOString()}
-- Base Backup Date: ${lastFullBackupDate || 'N/A'}
-- Changed Tables: ${changedTables.map(t => t.tablename).join(', ')}
-- Total Changes: ${changedTables.reduce((sum, t) => sum + parseInt(t.total_changes), 0)}

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
      changedTables: changedTables.map(t => t.tablename),
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
 * Uses pg_stat_user_tables to detect changes
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

  const client = new Client({
    host: config.host,
    port: config.port,
    user: config.username,
    password: config.password,
    database: config.database,
    ssl: config.sslEnabled ? { rejectUnauthorized: false } : false,
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `${safeDatabase}_differential_${timestamp}.sql`;
  const filePath = path.join(outputPath, fileName);

  try {
    const startTime = Date.now();
    await client.connect();

    // Get tables that have been modified since last FULL backup
    // Using n_tup_ins, n_tup_upd, n_tup_del from pg_stat_user_tables
    // Note: This is a simplified approach. In production, use WAL-based tracking for accuracy
    const tablesQuery = `
      SELECT
        schemaname,
        relname as tablename,
        n_tup_ins + n_tup_upd + n_tup_del as total_changes
      FROM pg_stat_user_tables
      WHERE schemaname = 'public'
      ORDER BY total_changes DESC
    `;

    const result = await client.query(tablesQuery);
    const changedTables = result.rows.filter(row => row.total_changes > 0);

    await client.end();

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

    // Build pg_dump command for only changed tables
    const tableList = changedTables.map(t => `-t ${t.tablename}`).join(' ');

    const env = {
      ...process.env,
      PGPASSWORD: config.password,
    };

    // Include both table schema and data
    const command = `"${PG_DUMP}" -h ${safeHost} -p ${safePort} -U ${escapeShellArg(safeUsername)} -d ${safeDatabase} ${tableList} -F p --encoding=UTF8 -f "${filePath}"`;

    await execPromise(command, {
      env,
      maxBuffer: 1024 * 1024 * 500, // 500MB buffer
      timeout: 30 * 60 * 1000 // 30 minutes timeout
    });

    // Prepend header with metadata
    const backupContent = await fs.readFile(filePath, 'utf8');
    const header = `-- Differential Backup: ${new Date().toISOString()}
-- Base Full Backup Date: ${lastFullBackupDate}
-- Changed Tables: ${changedTables.map(t => t.tablename).join(', ')}
-- Total Changes: ${changedTables.reduce((sum, t) => sum + parseInt(t.total_changes), 0)}
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
      changedTables: changedTables.map(t => t.tablename),
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
 * Verify PostgreSQL backup integrity
 * Uses pg_restore --list to validate backup file structure
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

    // Construct pg_restore command with --list option (validates without restoring)
    const PG_RESTORE = PG_BIN_PATH ? path.join(PG_BIN_PATH, 'pg_restore') : 'pg_restore';
    const command = `${escapeShellArg(PG_RESTORE)} --list ${escapeShellArg(backupFilePath)}`;

    try {
      const { stdout, stderr } = await execPromise(command);

      // If pg_restore --list succeeds, the backup file structure is valid
      const duration = Date.now() - startTime;
      const lineCount = stdout.split('\n').filter(line => line.trim()).length;

      return {
        check: 'database_verification',
        passed: true,
        duration,
        message: `PostgreSQL backup structure validated (${lineCount} objects found)`,
        details: {
          objectCount: lineCount,
          method: 'pg_restore --list',
        },
      };
    } catch (error) {
      // pg_restore failed, backup is corrupted or invalid
      return {
        check: 'database_verification',
        passed: false,
        duration: Date.now() - startTime,
        error: `pg_restore validation failed: ${error.message}`,
        details: {
          method: 'pg_restore --list',
          stderr: error.stderr,
        },
      };
    }
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
