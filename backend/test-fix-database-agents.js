const prisma = require('./src/utils/database');

async function fixDatabaseAgents() {
  try {
    // Find all databases without agentId
    const orphanDatabases = await prisma.database.findMany({
      where: {
        agentId: null,
      },
      select: {
        id: true,
        name: true,
        userId: true,
      }
    });

    console.log(`\n=== Found ${orphanDatabases.length} databases without agent ===\n`);

    if (orphanDatabases.length === 0) {
      console.log('✅ All databases are linked to agents!');
      return;
    }

    // Group by userId
    const byUser = {};
    orphanDatabases.forEach(db => {
      if (!byUser[db.userId]) {
        byUser[db.userId] = [];
      }
      byUser[db.userId].push(db);
    });

    // For each user, find their online agent and assign
    for (const [userId, databases] of Object.entries(byUser)) {
      console.log(`\nUser ID: ${userId}`);
      console.log(`  Orphan databases: ${databases.map(d => d.name).join(', ')}`);

      // Find user's online agent
      const agent = await prisma.agent.findFirst({
        where: {
          userId: parseInt(userId),
          status: 'online',
          isActive: true,
        },
        orderBy: {
          lastSeen: 'desc',
        }
      });

      if (!agent) {
        console.log(`  ❌ No online agent found for user ${userId}`);
        continue;
      }

      console.log(`  ✅ Found agent: ${agent.deviceName} (ID: ${agent.id})`);

      // Update all databases for this user
      const result = await prisma.database.updateMany({
        where: {
          userId: parseInt(userId),
          agentId: null,
        },
        data: {
          agentId: agent.id,
        }
      });

      console.log(`  ✅ Updated ${result.count} databases → Agent ${agent.deviceName}`);
    }

    console.log('\n=== Migration completed! ===\n');

    // Show final status
    const allDatabases = await prisma.database.findMany({
      select: {
        id: true,
        name: true,
        agentId: true,
        agent: {
          select: {
            deviceName: true,
            status: true,
          }
        }
      }
    });

    console.log('=== Final Database Status ===\n');
    allDatabases.forEach(db => {
      if (db.agent) {
        console.log(`✅ ${db.name} → ${db.agent.deviceName} (${db.agent.status})`);
      } else {
        console.log(`❌ ${db.name} → NO AGENT`);
      }
    });

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

fixDatabaseAgents();
