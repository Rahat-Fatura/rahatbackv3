const prisma = require('./src/utils/database');

async function checkDatabaseAgents() {
  try {
    const databases = await prisma.database.findMany({
      where: { userId: 3 },
      select: {
        id: true,
        name: true,
        host: true,
        agentId: true,
        agent: {
          select: {
            id: true,
            deviceName: true,
            status: true,
          }
        }
      }
    });

    console.log('\n=== USER DATABASES ===');
    databases.forEach(db => {
      console.log(`\nDatabase: ${db.name} (ID: ${db.id})`);
      console.log(`  Host: ${db.host}`);
      console.log(`  AgentID: ${db.agentId || 'NULL ❌'}`);
      if (db.agent) {
        console.log(`  Agent: ${db.agent.deviceName} (${db.agent.status})`);
      } else {
        console.log(`  Agent: NOT LINKED ❌`);
      }
    });

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabaseAgents();
