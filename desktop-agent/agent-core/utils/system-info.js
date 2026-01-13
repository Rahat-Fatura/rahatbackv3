const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { machineIdSync } = require('node-machine-id');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');

const AGENT_ID_FILE = path.join(process.cwd(), '.agent-id');

/**
 * Get or create agent ID (machine-based, consistent per PC)
 * @returns {string}
 */
function getOrCreateAgentId() {
  try {
    // Use machine ID (hardware-based, same for this PC always)
    // This ensures 1 Agent = 1 PC principle
    const machineId = machineIdSync();

    // Convert machine ID to proper UUID format
    // Machine ID is typically 32-char hex string, convert to UUID format
    // Format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    const cleanId = machineId.replace(/-/g, '').toLowerCase(); // Remove any existing dashes
    const agentId = `${cleanId.substring(0, 8)}-${cleanId.substring(8, 12)}-${cleanId.substring(12, 16)}-${cleanId.substring(16, 20)}-${cleanId.substring(20, 32)}`;

    // Save to file for reference (optional, since machine ID is deterministic)
    try {
      fs.writeFileSync(AGENT_ID_FILE, agentId, 'utf8');
    } catch (err) {
      // Ignore write errors (file is just for reference)
    }

    return agentId;
  } catch (error) {
    console.error('Failed to get machine ID, falling back to file-based ID:', error);

    // Fallback: Try to read existing agent ID
    if (fs.existsSync(AGENT_ID_FILE)) {
      const agentId = fs.readFileSync(AGENT_ID_FILE, 'utf8').trim();
      if (agentId) {
        return agentId;
      }
    }

    // Last resort: generate new UUID and save
    const agentId = uuidv4();
    fs.writeFileSync(AGENT_ID_FILE, agentId, 'utf8');
    return agentId;
  }
}

/**
 * Get agent information
 * @returns {Promise<Object>}
 */
async function getAgentInfo() {
  const agentId = getOrCreateAgentId();

  return {
    agentId,
    deviceName: os.hostname(),
    hostname: os.hostname(),
    platform: os.platform(),
    version: config.agentVersion,
    arch: os.arch(),
    cpus: os.cpus().length,
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    uptime: os.uptime(),
  };
}

/**
 * Get system stats
 * @returns {Object}
 */
function getSystemStats() {
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    uptime: os.uptime(),
    loadAverage: os.loadavg(),
  };
}

module.exports = {
  getOrCreateAgentId,
  getAgentInfo,
  getSystemStats,
};
