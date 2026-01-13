const axios = require('axios');
const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');
const config = require('../config/config');
const { getAgentInfo } = require('../utils/system-info');

const AUTH_FILE = path.join(process.cwd(), '.auth.json');

let authData = {
  isAuthenticated: false,
  token: null,
  user: null,
  agentId: null,
  agentDbId: null,
  backendUrl: null,
};

/**
 * Load auth data from file
 */
function loadAuthData() {
  try {
    if (fs.existsSync(AUTH_FILE)) {
      const data = fs.readFileSync(AUTH_FILE, 'utf8');
      authData = JSON.parse(data);
      logger.info('Auth data loaded from file');
    }
  } catch (error) {
    logger.error('Failed to load auth data:', error);
  }
}

/**
 * Save auth data to file
 */
function saveAuthData() {
  try {
    fs.writeFileSync(AUTH_FILE, JSON.stringify(authData, null, 2), 'utf8');
    logger.info('Auth data saved to file');
  } catch (error) {
    logger.error('Failed to save auth data:', error);
  }
}

/**
 * Login to backend
 * @param {string} email
 * @param {string} password
 * @param {string} backendUrl
 * @returns {Promise<Object>}
 */
async function login(email, password, backendUrl = config.backendUrl) {
  try {
    logger.info(`Logging in to ${backendUrl}...`);

    // Login to get token
    const loginResponse = await axios.post(`${backendUrl}/v1/auth/login`, {
      email,
      password,
    });

    const { tokens, user } = loginResponse.data;
    const token = tokens.access.token;

    logger.info('Login successful, registering/authenticating agent...');

    // Get agent info
    const agentInfo = await getAgentInfo();

    // Try to register agent (or get existing agent if already registered)
    let agent;
    try {
      const registerResponse = await axios.post(
        `${backendUrl}/v1/agents`,
        {
          agentId: agentInfo.agentId,
          deviceName: agentInfo.deviceName,
          hostname: agentInfo.hostname,
          platform: agentInfo.platform,
          version: agentInfo.version,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      agent = registerResponse.data;
      logger.info('Agent registered successfully');
    } catch (registerError) {
      // If agent already exists (409), fetch the existing agent
      if (registerError.response?.status === 409) {
        logger.info('Agent already registered, fetching agent info...');
        const getAgentResponse = await axios.get(`${backendUrl}/v1/agents`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        // Find the agent with matching agentId
        const agents = getAgentResponse.data.results || getAgentResponse.data;
        agent = agents.find(a => a.agentId === agentInfo.agentId);

        if (!agent) {
          throw new Error('Agent not found after registration conflict');
        }
        logger.info('Existing agent found');
      } else {
        throw registerError;
      }
    }

    // Save auth data
    authData = {
      isAuthenticated: true,
      token,
      user,
      agentId: agentInfo.agentId,
      agentDbId: agent.id,
      backendUrl,
    };

    saveAuthData();

    logger.info('Agent registered successfully');

    return {
      success: true,
      token,
      user,
      agentId: agentInfo.agentId,
      agentDbId: agent.id,
    };
  } catch (error) {
    logger.error('Login failed:', error.response?.data || error.message);

    return {
      success: false,
      error: error.response?.data?.message || error.message,
    };
  }
}

/**
 * Logout
 */
function logout() {
  authData = {
    isAuthenticated: false,
    token: null,
    user: null,
    agentId: null,
    agentDbId: null,
    backendUrl: null,
  };

  try {
    if (fs.existsSync(AUTH_FILE)) {
      fs.unlinkSync(AUTH_FILE);
    }
  } catch (error) {
    logger.error('Failed to delete auth file:', error);
  }

  logger.info('Logged out');
}

/**
 * Get auth info
 * @returns {Object}
 */
function getAuthInfo() {
  return { ...authData };
}

/**
 * Check if authenticated
 * @returns {boolean}
 */
function isAuthenticated() {
  return authData.isAuthenticated && authData.token;
}

// Load auth data on startup
loadAuthData();

module.exports = {
  login,
  logout,
  getAuthInfo,
  isAuthenticated,
};
