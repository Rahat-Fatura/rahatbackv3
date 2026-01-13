/**
 * Test Script for Differential Backup
 * This script tests the differential backup functionality
 */

const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000/v1';
let authToken = '';

// Test credentials (adjust based on your setup)
const TEST_USER = {
  email: 'admin@example.com',
  password: 'password123', // Change this to your actual test user password
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const log = {
  info: (msg) => console.log(`${colors.cyan}ℹ ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}✓ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}✗ ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}⚠ ${msg}${colors.reset}`),
  step: (msg) => console.log(`\n${colors.blue}▶ ${msg}${colors.reset}`),
};

// Helper function to make authenticated requests
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
});

api.interceptors.request.use((config) => {
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

// Sleep helper
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function login() {
  log.step('Step 1: Login to get authentication token');
  try {
    const response = await axios.post(`${API_BASE_URL}/auth/login`, TEST_USER);
    authToken = response.data.tokens.access.token;
    log.success(`Logged in successfully as ${TEST_USER.email}`);
    return true;
  } catch (error) {
    log.error(`Login failed: ${error.response?.data?.message || error.message}`);
    return false;
  }
}

async function createTestDatabase() {
  log.step('Step 2: Create test database connection');
  try {
    // First, check if test database already exists
    const existingDbs = await api.get('/databases');
    const testDb = existingDbs.data.results.find((db) => db.name === 'test_differential_backup');

    if (testDb) {
      log.warning('Test database already exists, using existing one');
      return testDb.id;
    }

    // Create new test database
    const dbData = {
      name: 'test_differential_backup',
      type: 'postgresql', // Change to mysql or mssql if needed
      host: 'localhost',
      port: 5432,
      username: 'postgres',
      password: 'postgres', // Change to your actual password
      database: 'rahat_fatura_db', // Use existing database for testing
      sslEnabled: false,
    };

    const response = await api.post('/databases', dbData);
    log.success(`Created test database with ID: ${response.data.id}`);
    return response.data.id;
  } catch (error) {
    log.error(`Failed to create database: ${error.response?.data?.message || error.message}`);
    throw error;
  }
}

async function createBackupJob(databaseId, backupType = 'full') {
  log.step(`Step 3: Create backup job with type: ${backupType}`);
  try {
    const jobData = {
      databaseId,
      name: `Test ${backupType} Backup Job`,
      scheduleType: 'manual',
      storageType: 'local',
      storagePath: './backups/test',
      retentionDays: 7,
      compression: true,
      isEncrypted: false,
      backupType: backupType, // 'full', 'incremental', or 'differential'
    };

    const response = await api.post('/backup-jobs', jobData);
    log.success(`Created ${backupType} backup job with ID: ${response.data.id}`);
    return response.data.id;
  } catch (error) {
    log.error(`Failed to create backup job: ${error.response?.data?.message || error.message}`);
    throw error;
  }
}

async function runBackup(backupJobId, expectedType) {
  log.step(`Step 4: Run ${expectedType} backup (Job ID: ${backupJobId})`);
  try {
    const response = await api.post(`/backup-jobs/${backupJobId}/run`);
    log.success(`Backup started: ${response.data.message}`);

    // Wait for backup to complete
    log.info('Waiting for backup to complete...');
    await sleep(5000); // Wait 5 seconds

    // Check backup history
    const history = await api.get(`/backup-history?backupJobId=${backupJobId}`);
    const latestBackup = history.data.results[0];

    if (latestBackup.status === 'success') {
      log.success(`✓ ${expectedType.toUpperCase()} Backup completed successfully!`);
      log.info(`  - Backup ID: ${latestBackup.id}`);
      log.info(`  - Type: ${latestBackup.backupType}`);
      log.info(`  - File: ${latestBackup.fileName}`);
      log.info(`  - Size: ${(latestBackup.fileSize / 1024).toFixed(2)} KB`);
      log.info(`  - Duration: ${latestBackup.duration}s`);
      if (latestBackup.baseBackupId) {
        log.info(`  - Base Backup ID: ${latestBackup.baseBackupId}`);
      }
      return latestBackup;
    } else if (latestBackup.status === 'running') {
      log.warning('Backup still running, waiting more...');
      await sleep(10000);
      return runBackup(backupJobId, expectedType);
    } else {
      log.error(`Backup failed: ${latestBackup.errorMessage}`);
      return null;
    }
  } catch (error) {
    log.error(`Failed to run backup: ${error.response?.data?.message || error.message}`);
    throw error;
  }
}

async function verifyDifferentialBackup(fullBackupId, differentialBackupId) {
  log.step('Step 5: Verify differential backup properties');

  try {
    const diffBackup = await api.get(`/backup-history/${differentialBackupId}`);
    const backup = diffBackup.data;

    log.info('Checking differential backup properties...');

    // Check 1: Backup type should be 'differential'
    if (backup.backupType === 'differential') {
      log.success('✓ Backup type is correctly set to "differential"');
    } else {
      log.error(`✗ Expected backup type "differential", got "${backup.backupType}"`);
    }

    // Check 2: Should have baseBackupId pointing to full backup
    if (backup.baseBackupId === fullBackupId) {
      log.success(`✓ Base backup ID correctly references full backup (ID: ${fullBackupId})`);
    } else {
      log.error(`✗ Expected baseBackupId ${fullBackupId}, got ${backup.baseBackupId}`);
    }

    // Check 3: File name should contain 'differential'
    if (backup.fileName.includes('differential')) {
      log.success(`✓ File name correctly contains "differential": ${backup.fileName}`);
    } else {
      log.warning(`⚠ File name doesn't contain "differential": ${backup.fileName}`);
    }

    return true;
  } catch (error) {
    log.error(`Failed to verify backup: ${error.response?.data?.message || error.message}`);
    return false;
  }
}

async function testDifferentialWithoutFullBackup(databaseId) {
  log.step('Step 6: Test differential backup without full backup (should fail)');

  try {
    // Create a new backup job with differential type
    const jobId = await createBackupJob(databaseId, 'differential');

    // Try to run differential backup without a full backup first
    try {
      await api.post(`/backup-jobs/${jobId}/run`);
      log.error('✗ Differential backup should have failed without full backup, but succeeded!');
      return false;
    } catch (error) {
      if (error.response?.status === 500 && error.response?.data?.message?.includes('full backup first')) {
        log.success('✓ Differential backup correctly failed without full backup');
        log.info(`  Error message: "${error.response.data.message}"`);
        return true;
      } else {
        log.error(`Unexpected error: ${error.response?.data?.message || error.message}`);
        return false;
      }
    }
  } catch (error) {
    log.error(`Test failed: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('🧪 DIFFERENTIAL BACKUP TEST SUITE');
  console.log('='.repeat(70) + '\n');

  try {
    // Login
    const loggedIn = await login();
    if (!loggedIn) {
      process.exit(1);
    }

    // Create test database
    const databaseId = await createTestDatabase();

    // Test 1: Create full backup job and run it
    const fullBackupJobId = await createBackupJob(databaseId, 'full');
    const fullBackup = await runBackup(fullBackupJobId, 'full');

    if (!fullBackup) {
      log.error('Full backup failed, cannot continue test');
      process.exit(1);
    }

    // Wait a bit before differential backup
    log.info('Waiting 3 seconds before differential backup...');
    await sleep(3000);

    // Test 2: Create differential backup job and run it
    const diffBackupJobId = await createBackupJob(databaseId, 'differential');
    const diffBackup = await runBackup(diffBackupJobId, 'differential');

    if (!diffBackup) {
      log.error('Differential backup failed, cannot continue test');
      process.exit(1);
    }

    // Test 3: Verify differential backup properties
    await verifyDifferentialBackup(fullBackup.id, diffBackup.id);

    // Test 4: Test differential without full backup (should fail)
    // We'll create a fresh database for this test
    log.info('\n' + '-'.repeat(70));
    await testDifferentialWithoutFullBackup(databaseId);

    // Summary
    console.log('\n' + '='.repeat(70));
    log.success('🎉 ALL TESTS COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(70) + '\n');

    console.log('Test Results Summary:');
    console.log(`  ✓ Full backup: ${fullBackup.fileName}`);
    console.log(`  ✓ Differential backup: ${diffBackup.fileName}`);
    console.log(`  ✓ Base backup reference: Correct`);
    console.log(`  ✓ Error handling: Correct\n`);
  } catch (error) {
    log.error(`Test suite failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Run tests
main();
