/**
 * Test script to manually send a backup job to agent
 * Usage: node test-send-job.js
 */

const { websocketService } = require('./src/services');

// Mock job data for testing
const testJobData = {
  id: 999, // Test job ID
  database: {
    id: 1,
    name: 'test_database',
    type: 'postgresql',
    host: 'localhost',
    port: 5432,
    username: 'postgres',
    password: 'your_password_here', // UPDATE THIS
  },
  storageType: 's3', // or 'local'
  storage: {
    // S3 configuration - UPDATE THESE
    accessKeyId: 'YOUR_AWS_ACCESS_KEY',
    secretAccessKey: 'YOUR_AWS_SECRET_KEY',
    region: 'us-east-1',
    bucket: 'your-bucket-name',
    path: 'backups', // Optional prefix
  },
  compression: true,
  isEncrypted: false,
};

/**
 * For local storage test, use this instead:
 */
const testJobDataLocal = {
  id: 999,
  database: {
    id: 1,
    name: 's3_test',
    type: 'postgresql',
    host: 'localhost',
    port: 5432,
    username: 'postgres',
    password: '123',
  },
  storageType: 'local',
  storage: {},
  compression: true,
  isEncrypted: false,
};

// Get agentId from command line argument
const agentId = process.argv[2];

if (!agentId) {
  console.error('❌ Usage: node test-send-job.js <agentId>');
  console.log('');
  console.log('To find your agentId:');
  console.log('1. Login to the agent app');
  console.log('2. Check the backend logs for "Agent connected: <agentId>"');
  console.log('3. Or check the agent UI for the agent ID');
  process.exit(1);
}

// Wait a bit for services to initialize
setTimeout(async () => {
  console.log('📤 Sending test job to agent:', agentId);
  console.log('');

  // Check if agent is online
  const isOnline = websocketService.isAgentOnline(agentId);
  console.log(`Agent ${agentId} status:`, isOnline ? '🟢 ONLINE' : '🔴 OFFLINE');

  if (!isOnline) {
    console.error('');
    console.error('❌ Agent is not connected!');
    console.error('Make sure the agent is running and connected to backend.');
    console.log('');
    console.log('Online agents:', websocketService.getOnlineAgents());
    process.exit(1);
  }

  // Send job to agent (use testJobDataLocal for local storage test)
  const jobToSend = testJobDataLocal; // Change to testJobData for S3 test

  console.log('');
  console.log('Job details:');
  console.log('  - Database:', jobToSend.database.name);
  console.log('  - Type:', jobToSend.database.type);
  console.log('  - Storage:', jobToSend.storageType);
  console.log('');

  const result = await websocketService.sendJobToAgent(agentId, jobToSend);

  if (result) {
    console.log('✅ Job sent successfully!');
    console.log('');
    console.log('Watch the agent logs for progress...');
  } else {
    console.error('❌ Failed to send job to agent');
  }
}, 2000);

console.log('');
console.log('🚀 Test Script Running...');
console.log('Waiting for WebSocket service to initialize...');
console.log('');
