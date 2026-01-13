const prisma = require('./src/utils/database');

/**
 * Test the complete backup flow:
 * Frontend → Backend → Agent → S3 → Backend → Frontend
 */
async function testBackupFlow() {
  try {
    console.log('\n========================================');
    console.log('🔍 BACKUP FLOW DOĞRULAMA');
    console.log('========================================\n');

    // 1. Check Agent Status
    console.log('1️⃣ AGENT DURUMU:');
    const agents = await prisma.agent.findMany({
      where: { status: 'online' },
      select: {
        id: true,
        agentId: true,
        deviceName: true,
        status: true,
        lastSeen: true,
        _count: {
          select: { databases: true }
        }
      }
    });

    if (agents.length === 0) {
      console.log('   ❌ Hiç online agent yok!\n');
      return;
    }

    agents.forEach(agent => {
      console.log(`   ✅ ${agent.deviceName} (${agent.status})`);
      console.log(`      - Agent UUID: ${agent.agentId}`);
      console.log(`      - Database count: ${agent._count.databases}`);
      console.log(`      - Last seen: ${agent.lastSeen.toLocaleString()}\n`);
    });

    // 2. Check Databases → Agent Linking
    console.log('2️⃣ DATABASE → AGENT BAĞLANTISI:');
    const databases = await prisma.database.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        host: true,
        agentId: true,
        agent: {
          select: {
            deviceName: true,
            status: true
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    const withAgent = databases.filter(db => db.agentId);
    const withoutAgent = databases.filter(db => !db.agentId);

    console.log(`   Toplam: ${databases.length} database`);
    console.log(`   ✅ Agent'a bağlı: ${withAgent.length}`);
    console.log(`   ❌ Agent'a bağlı değil: ${withoutAgent.length}\n`);

    withAgent.forEach(db => {
      console.log(`   ✅ ${db.name} (${db.type}) @ ${db.host}`);
      console.log(`      → Agent: ${db.agent.deviceName} (${db.agent.status})\n`);
    });

    if (withoutAgent.length > 0) {
      withoutAgent.forEach(db => {
        console.log(`   ❌ ${db.name} (${db.type}) @ ${db.host}`);
        console.log(`      → NO AGENT (Cloud mode)\n`);
      });
    }

    // 3. Check Backup Jobs
    console.log('3️⃣ BACKUP JOBS (SCHEDULED):');
    const backupJobs = await prisma.backupJob.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        scheduleType: true,
        cronExpression: true,
        advancedScheduleConfig: true,
        lastRunAt: true,
        nextRunAt: true,
        storageType: true,
        database: {
          select: {
            name: true,
            agentId: true,
            agent: {
              select: {
                deviceName: true,
                status: true
              }
            }
          }
        },
        cloudStorage: {
          select: {
            name: true,
            storageType: true
          }
        }
      }
    });

    console.log(`   Toplam active jobs: ${backupJobs.length}\n`);

    backupJobs.forEach(job => {
      console.log(`   📋 Job #${job.id}: ${job.name}`);
      console.log(`      - Database: ${job.database.name}`);

      if (job.database.agent) {
        console.log(`      - Agent: ${job.database.agent.deviceName} (${job.database.agent.status}) ✅`);
      } else {
        console.log(`      - Agent: NONE (Cloud mode) ❌`);
      }

      console.log(`      - Schedule: ${job.scheduleType}`);
      if (job.scheduleType === 'cron') {
        console.log(`      - Cron: ${job.cronExpression}`);
      } else if (job.scheduleType === 'advanced' && job.advancedScheduleConfig) {
        const config = JSON.parse(job.advancedScheduleConfig);
        console.log(`      - Advanced: Every ${config.interval} ${config.unit}`);
      }

      console.log(`      - Storage: ${job.storageType}`);
      if (job.cloudStorage) {
        console.log(`      - Cloud: ${job.cloudStorage.name} (${job.cloudStorage.storageType})`);
      }

      if (job.lastRunAt) {
        console.log(`      - Last run: ${job.lastRunAt.toLocaleString()}`);
      }
      if (job.nextRunAt) {
        console.log(`      - Next run: ${job.nextRunAt.toLocaleString()}`);
      }
      console.log('');
    });

    // 4. Check Recent Backup History
    console.log('4️⃣ SON BACKUP SONUÇLARI:');
    const recentBackups = await prisma.backupHistory.findMany({
      take: 5,
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        status: true,
        fileName: true,
        fileSize: true,
        startedAt: true,
        completedAt: true,
        errorMessage: true,
        backupJob: {
          select: {
            name: true
          }
        },
        database: {
          select: {
            name: true,
            agent: {
              select: {
                deviceName: true
              }
            }
          }
        }
      }
    });

    recentBackups.forEach(backup => {
      if (!backup.backupJob || !backup.database) {
        return; // Skip deleted jobs/databases
      }

      const status = backup.status === 'success' ? '✅' : backup.status === 'failed' ? '❌' : '⏳';
      const duration = backup.completedAt
        ? Math.round((backup.completedAt - backup.startedAt) / 1000)
        : null;

      console.log(`   ${status} Backup #${backup.id}: ${backup.database.name}`);
      console.log(`      - Job: ${backup.backupJob.name}`);

      if (backup.database.agent) {
        console.log(`      - Agent: ${backup.database.agent.deviceName}`);
      }

      console.log(`      - Started: ${backup.startedAt.toLocaleString()}`);

      if (backup.completedAt) {
        console.log(`      - Duration: ${duration}s`);
      }

      if (backup.fileName) {
        console.log(`      - File: ${backup.fileName}`);
      }

      if (backup.fileSize) {
        const sizeMB = (Number(backup.fileSize) / 1024 / 1024).toFixed(2);
        console.log(`      - Size: ${sizeMB} MB`);
      }

      if (backup.errorMessage) {
        console.log(`      - Error: ${backup.errorMessage}`);
      }

      console.log('');
    });

    // 5. Validate Flow
    console.log('5️⃣ AKIŞ DOĞRULAMA:');

    const hasOnlineAgent = agents.length > 0;
    const allDatabasesLinked = withoutAgent.length === 0;
    const hasActiveJobs = backupJobs.length > 0;
    const hasRecentSuccess = recentBackups.some(b => b.status === 'success');

    console.log(`   ${hasOnlineAgent ? '✅' : '❌'} Online agent var`);
    console.log(`   ${allDatabasesLinked ? '✅' : '⚠️'} Tüm database'ler agent'a bağlı`);
    console.log(`   ${hasActiveJobs ? '✅' : '❌'} Active backup job var`);
    console.log(`   ${hasRecentSuccess ? '✅' : '❌'} Son backup başarılı`);

    console.log('\n========================================');

    if (hasOnlineAgent && hasActiveJobs && hasRecentSuccess) {
      console.log('🎉 SİSTEM TAM ÇALIŞIR DURUMDA!');
    } else if (!hasOnlineAgent) {
      console.log('⚠️ AGENT OFFLINE - Agent\'ı başlat!');
    } else if (!hasActiveJobs) {
      console.log('⚠️ BACKUP JOB YOK - Frontend\'den job oluştur!');
    } else {
      console.log('⚠️ SİSTEM KISMİ ÇALIŞIR DURUMDA');
    }

    console.log('========================================\n');

    console.log('📋 AKIŞ ÖZETİ:');
    console.log('   Frontend (User triggers backup)');
    console.log('      ↓ HTTP POST /v1/backups/jobs/:id/execute');
    console.log('   Backend (backup.service.js)');
    console.log('      ↓ WebSocket: job:execute');
    console.log('   Agent (backup-executor.js)');
    console.log('      ↓ pg_dump / mysqldump / etc.');
    console.log('   Local Database');
    console.log('      ↓ Backup file (.sql)');
    console.log('   Agent (compression)');
    console.log('      ↓ Backup file (.sql.gz)');
    console.log('   Agent (S3 upload)');
    console.log('      ↓ S3 / Google Drive');
    console.log('   Cloud Storage');
    console.log('      ↓ WebSocket: backup:completed');
    console.log('   Backend (backup history)');
    console.log('      ↓ HTTP GET /v1/backups/history');
    console.log('   Frontend (Shows success)\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testBackupFlow();
