/**
 * Link database to agent
 * Usage: node test-link-db.js <database_id> <agent_id>
 */

const prisma = require('./src/utils/database');

async function linkDatabase() {
  const databaseId = parseInt(process.argv[2]);
  const agentId = parseInt(process.argv[3]);

  if (!databaseId || !agentId) {
    console.error('❌ Usage: node test-link-db.js <database_id> <agent_id>');
    console.log('Example: node test-link-db.js 10 24');
    process.exit(1);
  }

  try {
    console.log(`\n🔗 Linking database ${databaseId} to agent ${agentId}...`);

    // Update database
    const result = await prisma.database.update({
      where: { id: databaseId },
      data: { agentId },
      include: {
        agent: {
          select: {
            agentId: true,
            deviceName: true,
            status: true,
          },
        },
      },
    });

    console.log('\n✅ Database linked successfully!');
    console.log('========================================');
    console.log(`Database: ${result.name} (${result.type})`);
    console.log(`Host: ${result.host}`);
    console.log(`Agent: ${result.agent.deviceName}`);
    console.log(`Agent UUID: ${result.agent.agentId}`);
    console.log(`Agent Status: ${result.agent.status}`);
    console.log('========================================\n');

    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
    await prisma.$disconnect();
    process.exit(1);
  }
}

linkDatabase();
