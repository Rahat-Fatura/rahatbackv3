const sql = require('mssql');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const logger = require('../../config/logger');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * MSSQL Database Connector
 * Uses sqlcmd for backup or mssql library
 */

/**
 * Build MSSQL config object
 */
function buildConfig(config) {
  const { host, port, username, password, database } = config;

  return {
    server: host,
    port: port || 1433,
    database: database,
    user: username,
    password: password,
    options: {
      encrypt: false, // For local dev, set true for Azure
      trustServerCertificate: true,
      enableArithAbort: true,
    },
    requestTimeout: 30000,
    connectionTimeout: 15000,
  };
}

/**
 * Test MSSQL connection
 */
async function testConnection(config) {
  const mssqlConfig = buildConfig(config);
  let pool;

  try {
    pool = await sql.connect(mssqlConfig);
    await pool.request().query('SELECT 1');
    logger.info(`MSSQL connection successful: ${config.database}@${config.host}:${config.port}`);
    return { success: true };
  } catch (error) {
    logger.error(`MSSQL connection failed: ${error.message}`);
    throw new Error(`MSSQL connection failed: ${error.message}`);
  } finally {
    if (pool) {
      await pool.close();
    }
  }
}

/**
 * Create MSSQL backup using T-SQL BACKUP DATABASE
 */
async function createBackup(config, outputPath, progressCallback) {
  const { host, port, username, password, database } = config;
  const mssqlConfig = buildConfig(config);
  let pool;

  try {
    logger.info(`Starting MSSQL backup: ${database}`);

    // MSSQL requires a path that SQL Server service can write to
    // Use C:\Temp which is more accessible than user's temp folder
    const tempBackupDir = 'C:\\Temp\\rahat-backup-mssql';

    // Ensure temp directory exists
    if (!fs.existsSync(tempBackupDir)) {
      fs.mkdirSync(tempBackupDir, { recursive: true });
    }

    // Ensure final output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    if (progressCallback) {
      progressCallback({ status: 'running', message: 'Starting MSSQL backup...', progress: 10 });
    }

    // Connect to MSSQL
    pool = await sql.connect(mssqlConfig);

    if (progressCallback) {
      progressCallback({ status: 'running', message: 'Creating backup...', progress: 30 });
    }

    // Create backup to temp location first (SQL Server can access C:\Temp)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const tempBakFile = `${database}_${timestamp}.bak`;
    const tempBakPath = path.join(tempBackupDir, tempBakFile);

    // Note: COMPRESSION is not supported in Express Edition
    const backupQuery = `
      BACKUP DATABASE [${database}]
      TO DISK = N'${tempBakPath.replace(/\\/g, '\\\\')}'
      WITH FORMAT, INIT,
      NAME = N'${database}-Full Database Backup',
      SKIP, NOREWIND, NOUNLOAD, STATS = 10
    `;

    logger.debug(`MSSQL backup query: ${backupQuery}`);
    logger.info(`Backup temp path: ${tempBakPath}`);

    await pool.request().query(backupQuery);

    // Check if backup file was created
    if (!fs.existsSync(tempBakPath)) {
      throw new Error('Backup file was not created');
    }

    // Move backup file to final destination
    const finalBakPath = outputPath.replace('.sql', '.bak');
    fs.copyFileSync(tempBakPath, finalBakPath);

    // Clean up temp file
    try {
      fs.unlinkSync(tempBakPath);
    } catch (cleanupError) {
      logger.warn(`Failed to delete temp backup file: ${cleanupError.message}`);
    }

    const stats = fs.statSync(finalBakPath);
    const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);

    if (progressCallback) {
      progressCallback({
        status: 'running',
        message: `MSSQL backup completed: ${fileSizeMB} MB`,
        progress: 90
      });
    }

    logger.info(`MSSQL backup completed: ${database} (${fileSizeMB} MB)`);

    return {
      success: true,
      filePath: finalBakPath,
      fileSize: stats.size,
      fileSizeMB: fileSizeMB,
      database: database,
    };
  } catch (error) {
    // MSSQL returns multiple errors - get the root cause
    let detailedError = error.message;

    // Check for preceding errors (these usually contain the real cause)
    if (error.precedingErrors && error.precedingErrors.length > 0) {
      const firstError = error.precedingErrors[0];
      detailedError = `${firstError.message} (Code: ${firstError.number})`;
      logger.error(`MSSQL backup failed - Root cause: ${detailedError}`);
    } else {
      logger.error(`MSSQL backup failed: ${error.message}`);
    }

    // If T-SQL backup fails, try sqlcmd as fallback
    if (error.message.includes('permission') || error.message.includes('access') ||
        error.message.includes('operating system error') || error.message.includes('cannot open backup device')) {
      logger.info('Attempting backup using sqlcmd as fallback...');
      return await createBackupWithSqlCmd(config, outputPath, progressCallback);
    }

    // Clean up failed backup files
    const finalBakPath = outputPath.replace('.sql', '.bak');
    const tempBackupDir = 'C:\\Temp\\rahat-backup-mssql';

    // Try to clean up temp file
    try {
      if (fs.existsSync(tempBackupDir)) {
        const files = fs.readdirSync(tempBackupDir);
        files.forEach(file => {
          try {
            fs.unlinkSync(path.join(tempBackupDir, file));
          } catch (e) {
            // Ignore cleanup errors
          }
        });
      }
    } catch (cleanupError) {
      // Ignore cleanup errors
    }

    // Clean up final file if it exists
    if (fs.existsSync(finalBakPath)) {
      try {
        fs.unlinkSync(finalBakPath);
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    throw new Error(`MSSQL backup failed: ${detailedError}`);
  } finally {
    if (pool) {
      await pool.close();
    }
  }
}

/**
 * Fallback: Create backup using sqlcmd (for permissions issues)
 */
async function createBackupWithSqlCmd(config, outputPath, progressCallback) {
  const { host, port, username, password, database } = config;

  try {
    logger.info(`Creating MSSQL backup with sqlcmd: ${database}`);

    if (progressCallback) {
      progressCallback({ status: 'running', message: 'Using sqlcmd for backup...', progress: 30 });
    }

    // Generate SQL script to export data
    const scriptPath = outputPath.replace(path.extname(outputPath), '.sql');
    const bakPath = outputPath.replace('.sql', '.bak');

    // Use bcp (Bulk Copy Program) to export data
    // First, get list of tables
    const getTablesCmd = `sqlcmd -S ${host},${port} -U ${username} -P "${password}" -d ${database} -h -1 -Q "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE'" -o "${scriptPath}.tables"`;

    await execAsync(getTablesCmd, {
      timeout: 60000,
      windowsHide: true,
    });

    // For simplicity, use BACKUP DATABASE command via sqlcmd
    const backupCmd = `sqlcmd -S ${host},${port} -U ${username} -P "${password}" -Q "BACKUP DATABASE [${database}] TO DISK = N'${bakPath}' WITH FORMAT, INIT, COMPRESSION"`;

    await execAsync(backupCmd, {
      timeout: 600000, // 10 minutes
      windowsHide: true,
    });

    if (!fs.existsSync(bakPath)) {
      throw new Error('Backup file was not created via sqlcmd');
    }

    const stats = fs.statSync(bakPath);
    const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);

    if (progressCallback) {
      progressCallback({
        status: 'running',
        message: `MSSQL backup completed: ${fileSizeMB} MB`,
        progress: 90
      });
    }

    logger.info(`MSSQL backup completed via sqlcmd: ${database} (${fileSizeMB} MB)`);

    return {
      success: true,
      filePath: bakPath,
      fileSize: stats.size,
      database: database,
    };
  } catch (error) {
    logger.error(`MSSQL sqlcmd backup failed: ${error.message}`);
    throw new Error(`MSSQL sqlcmd backup failed: ${error.message}`);
  }
}

/**
 * Restore MSSQL backup
 */
async function restoreBackup(config, backupPath, progressCallback) {
  const { host, port, username, password, database } = config;
  const mssqlConfig = buildConfig(config);
  let pool;

  try {
    logger.info(`Starting MSSQL restore: ${database}`);

    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup file not found: ${backupPath}`);
    }

    if (progressCallback) {
      progressCallback({ status: 'running', message: 'Starting MSSQL restore...', progress: 10 });
    }

    // Connect to MSSQL
    pool = await sql.connect(mssqlConfig);

    if (progressCallback) {
      progressCallback({ status: 'running', message: 'Restoring database...', progress: 30 });
    }

    // First, set database to single user mode and close existing connections
    const setToSingleUserQuery = `
      USE master;
      ALTER DATABASE [${database}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    `;

    try {
      await pool.request().query(setToSingleUserQuery);
    } catch (e) {
      // Ignore if database doesn't exist yet
      logger.warn(`Could not set single user mode: ${e.message}`);
    }

    if (progressCallback) {
      progressCallback({ status: 'running', message: 'Restoring from backup...', progress: 50 });
    }

    // Restore database
    const restoreQuery = `
      USE master;
      RESTORE DATABASE [${database}]
      FROM DISK = N'${backupPath}'
      WITH REPLACE, RECOVERY, STATS = 10
    `;

    await pool.request().query(restoreQuery);

    // Set back to multi-user mode
    const setToMultiUserQuery = `
      USE master;
      ALTER DATABASE [${database}] SET MULTI_USER;
    `;

    await pool.request().query(setToMultiUserQuery);

    if (progressCallback) {
      progressCallback({ status: 'running', message: 'Restore completed', progress: 100 });
    }

    logger.info(`MSSQL restore completed: ${database}`);

    return {
      success: true,
      database: database,
    };
  } catch (error) {
    logger.error(`MSSQL restore failed: ${error.message}`);
    throw new Error(`MSSQL restore failed: ${error.message}`);
  } finally {
    if (pool) {
      await pool.close();
    }
  }
}

module.exports = {
  testConnection,
  createBackup,
  restoreBackup,
};
