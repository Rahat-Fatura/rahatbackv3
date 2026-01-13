const prisma = require('../utils/database');

/**
 * Create a new agent
 * @param {Object} agentData
 * @returns {Promise<Object>}
 */
const create = async (agentData) => {
  return await prisma.agent.create({
    data: agentData,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });
};

/**
 * Find agent by ID
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
const findById = async (id) => {
  return await prisma.agent.findUnique({
    where: { id: parseInt(id) },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      databases: {
        select: {
          id: true,
          name: true,
          type: true,
          isActive: true,
        },
      },
    },
  });
};

/**
 * Find agent by agentId (UUID)
 * @param {string} agentId
 * @returns {Promise<Object|null>}
 */
const findByAgentId = async (agentId) => {
  return await prisma.agent.findUnique({
    where: { agentId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });
};

/**
 * Find all agents for a user
 * @param {number} userId
 * @param {Object} filters
 * @returns {Promise<Array>}
 */
const findByUserId = async (userId, filters = {}) => {
  const where = {
    userId: parseInt(userId),
  };

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.isActive !== undefined) {
    where.isActive = filters.isActive === 'true' || filters.isActive === true;
  }

  return await prisma.agent.findMany({
    where,
    include: {
      databases: {
        select: {
          id: true,
          name: true,
          type: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
};

/**
 * Find first online agent for a user
 * @param {number} userId
 * @returns {Promise<Object|null>}
 */
const findFirstOnlineByUserId = async (userId) => {
  return await prisma.agent.findFirst({
    where: {
      userId: parseInt(userId),
      status: 'online',
      isActive: true,
    },
    orderBy: {
      lastSeen: 'desc',
    },
  });
};

/**
 * Update agent
 * @param {number} id
 * @param {Object} updateData
 * @returns {Promise<Object>}
 */
const update = async (id, updateData) => {
  return await prisma.agent.update({
    where: { id: parseInt(id) },
    data: updateData,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });
};

/**
 * Update agent status
 * @param {string} agentId
 * @param {string} status - 'online' or 'offline'
 * @returns {Promise<Object>}
 */
const updateStatus = async (agentId, status) => {
  return await prisma.agent.update({
    where: { agentId },
    data: {
      status,
      lastSeen: new Date(),
    },
  });
};

/**
 * Update agent last seen timestamp
 * @param {string} agentId
 * @returns {Promise<Object>}
 */
const updateLastSeen = async (agentId) => {
  return await prisma.agent.update({
    where: { agentId },
    data: {
      lastSeen: new Date(),
    },
  });
};

/**
 * Delete agent
 * @param {number} id
 * @returns {Promise<Object>}
 */
const deleteAgent = async (id) => {
  return await prisma.agent.delete({
    where: { id: parseInt(id) },
  });
};

/**
 * Check if agent belongs to user
 * @param {number} agentId
 * @param {number} userId
 * @returns {Promise<boolean>}
 */
const belongsToUser = async (agentId, userId) => {
  const agent = await prisma.agent.findFirst({
    where: {
      id: parseInt(agentId),
      userId: parseInt(userId),
    },
  });
  return !!agent;
};

/**
 * Get agent statistics for a user
 * @param {number} userId
 * @returns {Promise<Object>}
 */
const getStats = async (userId) => {
  const [total, online, offline] = await Promise.all([
    prisma.agent.count({
      where: { userId: parseInt(userId) },
    }),
    prisma.agent.count({
      where: {
        userId: parseInt(userId),
        status: 'online',
      },
    }),
    prisma.agent.count({
      where: {
        userId: parseInt(userId),
        status: 'offline',
      },
    }),
  ]);

  return {
    total,
    online,
    offline,
  };
};

module.exports = {
  create,
  findById,
  findByAgentId,
  findByUserId,
  findFirstOnlineByUserId,
  update,
  updateStatus,
  updateLastSeen,
  deleteAgent,
  belongsToUser,
  getStats,
};
