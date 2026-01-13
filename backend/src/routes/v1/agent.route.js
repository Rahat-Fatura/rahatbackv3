const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const agentController = require('../../controllers/agent.controller');
const { agentValidation } = require('../../validations');

const router = express.Router();

// Agent registration and management
router
  .route('/')
  .post(auth(), validate(agentValidation.registerAgent), agentController.registerAgent)
  .get(auth(), validate(agentValidation.getAgents), agentController.getAgents);

router
  .route('/:agentId')
  .get(auth(), validate(agentValidation.getAgent), agentController.getAgent)
  .patch(auth(), validate(agentValidation.updateAgent), agentController.updateAgent)
  .delete(auth(), validate(agentValidation.deleteAgent), agentController.deleteAgent);

// Heartbeat endpoint
router.post('/heartbeat', auth(), validate(agentValidation.heartbeat), agentController.heartbeat);

// Statistics
router.get('/stats', auth(), agentController.getAgentStats);

module.exports = router;
