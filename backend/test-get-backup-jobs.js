/**
 * Get backup jobs for a database
 */

const prisma = require('./src/utils/database');

async function getBackupJobs() {
  const databaseId = parseInt(process.argv[2]) || 10;

  try {
    console.log(`\n📋 Backup Jobs for Database ID: ${databaseId}`);
    console.log('========================================\n');

    const jobs = await prisma.backupJob.findMany({
      where: { databaseId },
      include: {
        database: {
          select: {
            name: true,
            type: true,
          },
        },
      },
    });

    if (jobs.length === 0) {
      console.log('❌ No backup jobs found for this database.');
      console.log('\n💡 Create one from frontend or use this command:');
      console.log(`   POST /v1/backup-jobs with databaseId: ${databaseId}`);
    } else {
      jobs.forEach((job) => {
        console.log(`Job ID: ${job.id}`);
        console.log(`Name: ${job.name}`);
        console.log(`Database: ${job.database.name} (${job.database.type})`);
        console.log(`Schedule: ${job.schedule || 'Manual only'}`);
        console.log(`Is Active: ${job.isActive}`);
        console.log(`Storage: ${job.storageType || 'local'}`);
        console.log(`Compression: ${job.compression}`);
        console.log(`---`);
      });

      console.log(`\n✅ To execute a backup job, run:`);
      console.log(`   node test-execute-backup.js ${jobs[0].id}`);
    }

    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

getBackupJobs();
