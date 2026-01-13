const httpStatus = require('http-status');
const { agentModel } = require('../models');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const crypto = require('crypto');

/**
 * Register a new agent
 * @param {number} userId
 * @param {Object} agentData
 * @returns {Promise<Object>}
 */
const registerAgent = async (userId, agentData) => {
  // Check if agent with same agentId already exists
  // (1 PC = 1 Agent principle: machine ID-based)
  const existingAgent = await agentModel.findByAgentId(agentData.agentId);

  if (existingAgent) {
    // Verify userId matches (security check)
    if (existingAgent.userId !== userId) {
      throw new ApiError(
        httpStatus.CONFLICT,
        `This PC is already registered to another user. Each PC can only be used by one account.`
      );
    }

    // Agent already exists for this PC and same user
    // Update it instead of creating new (re-registration from same PC)
    const updatedAgent = await agentModel.update(existingAgent.id, {
      deviceName: agentData.deviceName,
      hostname: agentData.hostname,
      platform: agentData.platform,
      version: agentData.version,
      status: 'online',
      lastSeen: new Date(),
    });

    logger.info(`Agent re-registered (updated): ${updatedAgent.agentId} for user ${userId}`);
    return updatedAgent;
  }

  // Create new agent
  const agent = await agentModel.create({
    userId,
    agentId: agentData.agentId,
    deviceName: agentData.deviceName,
    hostname: agentData.hostname,
    platform: agentData.platform,
    version: agentData.version,
    status: 'online',
    lastSeen: new Date(),
  });

  logger.info(`Agent registered: ${agent.agentId} for user ${userId}`);

  return agent;
};

/**
 * Authenticate agent
 * @param {string} agentId
 * @param {number} userId
 * @returns {Promise<Object>}
 */
const authenticateAgent = async (agentId, userId) => {
  const agent = await agentModel.findByAgentId(agentId);

  if (!agent) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Agent not found');
  }

  if (agent.userId !== userId) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Agent does not belong to this user');
  }

  if (!agent.isActive) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Agent is disabled');
  }

  // Update status to online
  await agentModel.updateStatus(agentId, 'online');

  logger.info(`Agent authenticated: ${agentId}`);

  return agent;
};

/**
 * Get agent by ID
 * @param {number} id
 * @param {number} userId
 * @returns {Promise<Object>}
 */
const getAgentById = async (id, userId) => {
  const agent = await agentModel.findById(id);

  if (!agent) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Agent not found');
  }

  if (agent.userId !== userId) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied');
  }

  return agent;
};

/**
 * Get all agents for a user
 * @param {number} userId
 * @param {Object} filters
 * @returns {Promise<Array>}
 */
const getUserAgents = async (userId, filters = {}) => {
  return await agentModel.findByUserId(userId, filters);
};

/**
 * Update agent
 * @param {number} id
 * @param {number} userId
 * @param {Object} updateData
 * @returns {Promise<Object>}
 */
const updateAgent = async (id, userId, updateData) => {
  const agent = await getAgentById(id, userId);

  // Don't allow updating critical fields
  delete updateData.userId;
  delete updateData.agentId;

  const updatedAgent = await agentModel.update(id, updateData);

  logger.info(`Agent updated: ${agent.agentId}`);

  return updatedAgent;
};

/**
 * Delete agent
 * @param {number} id
 * @param {number} userId
 * @returns {Promise<void>}
 */
const deleteAgent = async (id, userId) => {
  const agent = await getAgentById(id, userId);

  await agentModel.deleteAgent(id);

  logger.info(`Agent deleted: ${agent.agentId}`);
};

/**
 * Update agent status
 * @param {string} agentId
 * @param {string} status
 * @returns {Promise<Object>}
 */
const updateAgentStatus = async (agentId, status) => {
  return await agentModel.updateStatus(agentId, status);
};

/**
 * Heartbeat - update agent last seen
 * @param {string} agentId
 * @returns {Promise<Object>}
 */
const heartbeat = async (agentId) => {
  return await agentModel.updateLastSeen(agentId);
};

/**
 * Get agent statistics
 * @param {number} userId
 * @returns {Promise<Object>}
 */
const getAgentStats = async (userId) => {
  return await agentModel.getStats(userId);
};

/**
 * Generate unique agent ID
 * @returns {string}
 */
const generateAgentId = () => {
  return crypto.randomUUID();
};

module.exports = {
  registerAgent,
  authenticateAgent,
  getAgentById,
  getUserAgents,
  updateAgent,
  deleteAgent,
  updateAgentStatus,
  heartbeat,
  getAgentStats,
  generateAgentId,
};
