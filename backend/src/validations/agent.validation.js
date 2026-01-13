const Joi = require('joi');

const registerAgent = {
  body: Joi.object().keys({
    agentId: Joi.string().uuid().required(),
    deviceName: Joi.string().required(),
    hostname: Joi.string().required(),
    platform: Joi.string().valid('win32', 'darwin', 'linux').required(),
    version: Joi.string().required(),
  }),
};

const getAgents = {
  query: Joi.object().keys({
    status: Joi.string().valid('online', 'offline'),
    isActive: Joi.boolean(),
  }),
};

const getAgent = {
  params: Joi.object().keys({
    agentId: Joi.number().integer().required(),
  }),
};

const updateAgent = {
  params: Joi.object().keys({
    agentId: Joi.number().integer().required(),
  }),
  body: Joi.object()
    .keys({
      deviceName: Joi.string(),
      isActive: Joi.boolean(),
    })
    .min(1),
};

const deleteAgent = {
  params: Joi.object().keys({
    agentId: Joi.number().integer().required(),
  }),
};

const heartbeat = {
  body: Joi.object().keys({
    agentId: Joi.string().uuid().required(),
  }),
};

module.exports = {
  registerAgent,
  getAgents,
  getAgent,
  updateAgent,
  deleteAgent,
  heartbeat,
};
