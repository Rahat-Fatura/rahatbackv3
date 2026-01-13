const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkGoogleDriveConfig() {
  try {
    console.log('🔍 Checking Google Drive configurations...\n');

    const gdriveConfigs = await prisma.cloudStorage.findMany({
      where: {
        storageType: 'google_drive',
      },
    });

    if (gdriveConfigs.length === 0) {
      console.log('❌ No Google Drive configurations found');
      return;
    }

    console.log(`✅ Found ${gdriveConfigs.length} Google Drive configuration(s):\n`);

    for (const config of gdriveConfigs) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`📦 ID: ${config.id}`);
      console.log(`📝 Name: ${config.name}`);
      console.log(`👤 User ID: ${config.userId}`);
      console.log(`📁 Folder ID: ${config.gdFolderId || 'root'}`);
      console.log(`🔑 Has Refresh Token: ${!!config.gdRefreshToken}`);
      console.log(`📊 Active: ${config.isActive}`);
      console.log(`⭐ Default: ${config.isDefault}`);
      console.log(`📅 Created: ${config.createdAt}`);

      // Check if token is encrypted
      if (config.gdRefreshToken) {
        try {
          const parsed = JSON.parse(config.gdRefreshToken);
          if (parsed.iv && parsed.authTag && parsed.encrypted) {
            console.log(`🔒 Token Status: ENCRYPTED ✅`);
            console.log(`   - IV Length: ${parsed.iv.length}`);
            console.log(`   - AuthTag Length: ${parsed.authTag.length}`);
            console.log(`   - Encrypted Length: ${parsed.encrypted.length}`);
          } else {
            console.log(`🔓 Token Status: PLAIN TEXT (needs encryption)`);
          }
        } catch (e) {
          console.log(`🔓 Token Status: PLAIN TEXT (needs encryption)`);
          console.log(`   - Token Length: ${config.gdRefreshToken.length}`);
        }
      }
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }

    // Check associated backup jobs
    console.log('\n📋 Checking backup jobs using Google Drive:\n');

    for (const config of gdriveConfigs) {
      const jobs = await prisma.backupJob.findMany({
        where: {
          cloudStorageId: config.id,
        },
        include: {
          database: true,
        },
      });

      if (jobs.length > 0) {
        console.log(`\n💼 Jobs for "${config.name}" (ID: ${config.id}):`);
        for (const job of jobs) {
          console.log(`   - Job ${job.id}: ${job.name} (Database: ${job.database.name}, Active: ${job.isActive})`);
        }
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkGoogleDriveConfig();
