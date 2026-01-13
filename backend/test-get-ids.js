/**
 * Quick script to get Agent and Database IDs for testing
 */

const prisma = require('./src/utils/database');

async function getIds() {
  try {
    console.log('\n📋 AGENTS:');
    console.log('========================================');
    const agents = await prisma.agent.findMany({
      select: {
        id: true,
        agentId: true,
        deviceName: true,
        status: true,
        user: {
          select: {
            email: true,
          },
        },
      },
    });

    agents.forEach((agent) => {
      console.log(`ID: ${agent.id} | UUID: ${agent.agentId}`);
      console.log(`Device: ${agent.deviceName} | Status: ${agent.status}`);
      console.log(`User: ${agent.user.email}`);
      console.log('---');
    });

    console.log('\n🗄️  DATABASES:');
    console.log('========================================');
    const databases = await prisma.database.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        host: true,
        agentId: true,
        user: {
          select: {
            email: true,
          },
        },
      },
    });

    databases.forEach((db) => {
      console.log(`ID: ${db.id} | Name: ${db.name}`);
      console.log(`Type: ${db.type} | Host: ${db.host}`);
      console.log(`Agent ID: ${db.agentId || 'NOT LINKED'}`);
      console.log(`User: ${db.user.email}`);
      console.log('---');
    });

    console.log('\n✅ Now run this SQL to link database to agent:');
    console.log('========================================');

    if (agents.length > 0 && databases.length > 0) {
      const agent = agents[0];
      const db = databases[0];

      console.log(`UPDATE "Database" SET "agentId" = ${agent.id} WHERE id = ${db.id};`);
      console.log('\nOr use this Node.js command:');
      console.log(`node test-link-db.js ${db.id} ${agent.id}`);
    } else {
      console.log('❌ No agents or databases found. Please create them first.');
    }

    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

getIds();
