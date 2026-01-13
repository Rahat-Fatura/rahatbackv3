/**
 * Execute a backup job
 * Usage: node test-execute-backup.js <job_id>
 */

const { backupService } = require('./src/services');

async function executeBackup() {
  const jobId = parseInt(process.argv[2]);

  if (!jobId) {
    console.error('❌ Usage: node test-execute-backup.js <job_id>');
    console.log('Example: node test-execute-backup.js 67');
    process.exit(1);
  }

  try {
    console.log(`\n🚀 Executing backup job ${jobId}...\n`);
    console.log('📡 Sending job to agent via WebSocket...');
    console.log('👀 Watch the agent terminal for progress...\n');

    const result = await backupService.executeBackup(jobId);

    console.log('✅ Result:');
    console.log('========================================');
    console.log(JSON.stringify(result, null, 2));
    console.log('========================================\n');

    if (result.status === 'sent_to_agent') {
      console.log('✅ Job sent to agent successfully!');
      console.log('');
      console.log('📋 Next steps:');
      console.log('   1. Check agent terminal for backup progress');
      console.log('   2. Check backend terminal for completion status');
      console.log('   3. Check desktop-agent/backups/ folder for backup file');
      console.log('');
    }

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('');
    console.error('Possible issues:');
    console.error('  - Agent is not connected');
    console.error('  - Database credentials incorrect');
    console.error('  - Job is already running');
    console.error('');
    process.exit(1);
  }
}

executeBackup();
