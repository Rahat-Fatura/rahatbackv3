/**
 * Fix stuck backup history entries
 */

const prisma = require('./src/utils/database');

async function fixStuckBackups() {
  try {
    console.log('\n🔧 Fixing stuck backup history entries...\n');

    // Find all running backups
    const stuckBackups = await prisma.backupHistory.findMany({
      where: { status: 'running' },
    });

    console.log(`Found ${stuckBackups.length} stuck backups`);

    if (stuckBackups.length === 0) {
      console.log('✅ No stuck backups found!');
      await prisma.$disconnect();
      return;
    }

    // Update them to failed
    const result = await prisma.backupHistory.updateMany({
      where: { status: 'running' },
      data: {
        status: 'failed',
        errorMessage: 'Backup stuck - cleaned up by script',
        completedAt: new Date(),
      },
    });

    console.log(`\n✅ Fixed ${result.count} stuck backup(s)`);
    console.log('========================================\n');

    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

fixStuckBackups();
