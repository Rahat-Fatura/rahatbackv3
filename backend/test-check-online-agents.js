/**
 * Check online agents in WebSocket
 */

const { websocketService } = require('./src/services');

setTimeout(() => {
  console.log('\n📡 Online Agents:');
  console.log('========================================');

  const onlineAgents = websocketService.getOnlineAgents();
  const count = websocketService.getOnlineAgentsCount();

  console.log(`Total online: ${count}`);
  console.log('');

  if (count === 0) {
    console.log('❌ No agents connected!');
    console.log('');
    console.log('🔧 Troubleshooting:');
    console.log('   1. Check if desktop agent is running');
    console.log('   2. Check desktop agent logs for connection errors');
    console.log('   3. Restart desktop agent if needed');
  } else {
    onlineAgents.forEach((agentId) => {
      const isOnline = websocketService.isAgentOnline(agentId);
      console.log(`✅ ${agentId} - ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
    });
  }

  console.log('========================================\n');
  process.exit(0);
}, 2000);

console.log('\n⏳ Checking WebSocket connections...\n');
