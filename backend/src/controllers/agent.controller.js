const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { agentService } = require('../services');

/**
 * Register a new agent
 */
const registerAgent = catchAsync(async (req, res) => {
  const agent = await agentService.registerAgent(req.user.id, req.body);
  res.status(httpStatus.CREATED).send(agent);
});

/**
 * Get all agents for current user
 */
const getAgents = catchAsync(async (req, res) => {
  const filters = {
    status: req.query.status,
    isActive: req.query.isActive,
  };
  const agents = await agentService.getUserAgents(req.user.id, filters);
  res.send(agents);
});

/**
 * Get agent by ID
 */
const getAgent = catchAsync(async (req, res) => {
  const agent = await agentService.getAgentById(parseInt(req.params.agentId), req.user.id);
  res.send(agent);
});

/**
 * Update agent
 */
const updateAgent = catchAsync(async (req, res) => {
  const agent = await agentService.updateAgent(parseInt(req.params.agentId), req.user.id, req.body);
  res.send(agent);
});

/**
 * Delete agent
 */
const deleteAgent = catchAsync(async (req, res) => {
  await agentService.deleteAgent(parseInt(req.params.agentId), req.user.id);
  res.status(httpStatus.NO_CONTENT).send();
});

/**
 * Heartbeat - update last seen
 */
const heartbeat = catchAsync(async (req, res) => {
  const agent = await agentService.heartbeat(req.body.agentId);
  res.send(agent);
});

/**
 * Get agent statistics
 */
const getAgentStats = catchAsync(async (req, res) => {
  const stats = await agentService.getAgentStats(req.user.id);
  res.send(stats);
});

module.exports = {
  registerAgent,
  getAgents,
  getAgent,
  updateAgent,
  deleteAgent,
  heartbeat,
  getAgentStats,
};
