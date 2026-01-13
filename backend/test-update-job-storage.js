/**
 * Update backup job storage type to local for testing
 * Usage: node test-update-job-storage.js <job_id>
 */

const prisma = require('./src/utils/database');

async function updateJobStorage() {
  const jobId = parseInt(process.argv[2]);

  if (!jobId) {
    console.error('❌ Usage: node test-update-job-storage.js <job_id>');
    console.log('Example: node test-update-job-storage.js 67');
    process.exit(1);
  }

  try {
    console.log(`\n🔧 Updating backup job ${jobId} to local storage...`);

    const result = await prisma.backupJob.update({
      where: { id: jobId },
      data: {
        storageType: 'local',
        cloudStorageId: null,
      },
    });

    console.log('\n✅ Backup job updated successfully!');
    console.log('========================================');
    console.log(`Job ID: ${result.id}`);
    console.log(`Name: ${result.name}`);
    console.log(`Storage Type: ${result.storageType}`);
    console.log(`Compression: ${result.compression}`);
    console.log('========================================\n');

    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
    await prisma.$disconnect();
    process.exit(1);
  }
}

updateJobStorage();
