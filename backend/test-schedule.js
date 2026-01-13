const { scheduleService } = require('./src/services');
const { backupJobModel } = require('./src/models');

async function testSchedule() {
  console.log('\n=== Testing Schedule Service ===\n');

  // Get all active jobs
  const activeJobs = await backupJobModel.findActiveJobs();
  console.log(`Found ${activeJobs.length} active backup jobs:\n`);

  activeJobs.forEach((job) => {
    console.log(`Job ID: ${job.id}`);
    console.log(`  Name: ${job.name}`);
    console.log(`  Schedule: ${job.scheduleType}`);
    console.log(`  Cron: ${job.cronExpression || 'N/A'}`);
    console.log(`  Last Run: ${job.lastRunAt || 'Never'}`);
    console.log(`  Next Run: ${job.nextRunAt || 'Not scheduled'}`);
    console.log(`  Active: ${job.isActive}`);

    // Calculate next run time
    const cronExpression = scheduleService.getCronExpression(job.scheduleType, job.cronExpression);
    const nextRun = scheduleService.getNextRunTime(cronExpression);
    console.log(`  Calculated Next Run: ${nextRun}`);
    console.log('');
  });

  // Get scheduled jobs status
  const status = scheduleService.getScheduledJobsStatus();
  console.log(`\nCurrently running cron jobs: ${status.length}`);
  status.forEach((s) => {
    console.log(`  - Job ${s.jobId}: ${s.isRunning ? 'Running' : 'Stopped'}`);
  });

  process.exit(0);
}

testSchedule().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
