const prisma = require('../utils/database');

/**
 * Create audit log entry
 * @param {Object} logData
 * @returns {Promise<Object>}
 */
const create = async (logData) => {
  return await prisma.auditLog.create({
    data: logData,
  });
};

/**
 * Find audit logs by user ID
 * @param {number} userId
 * @param {Object} options - Pagination and filtering options
 * @returns {Promise<Array>}
 */
const findByUserId = async (userId, options = {}) => {
  const { page = 1, limit = 50, action, resource, startDate, endDate } = options;
  const skip = (page - 1) * limit;

  const where = {
    userId,
  };

  if (action) {
    where.action = action;
  }

  if (resource) {
    where.resource = resource;
  }

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) {
      where.createdAt.gte = new Date(startDate);
    }
    if (endDate) {
      where.createdAt.lte = new Date(endDate);
    }
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    logs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

/**
 * Find audit logs by action
 * @param {string} action
 * @param {Object} options
 * @returns {Promise<Array>}
 */
const findByAction = async (action, options = {}) => {
  const { page = 1, limit = 50 } = options;
  const skip = (page - 1) * limit;

  return await prisma.auditLog.findMany({
    where: {
      action,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    skip,
    take: limit,
  });
};

/**
 * Find audit logs by resource
 * @param {string} resource
 * @param {number} resourceId
 * @returns {Promise<Array>}
 */
const findByResource = async (resource, resourceId) => {
  return await prisma.auditLog.findMany({
    where: {
      resource,
      resourceId,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
};

/**
 * Get recent audit logs
 * @param {number} limit
 * @returns {Promise<Array>}
 */
const getRecent = async (limit = 100) => {
  return await prisma.auditLog.findMany({
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: limit,
  });
};

/**
 * Delete old audit logs
 * @param {number} days - Delete logs older than this many days
 * @returns {Promise<Object>}
 */
const deleteOlderThan = async (days) => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  return await prisma.auditLog.deleteMany({
    where: {
      createdAt: {
        lt: cutoffDate,
      },
    },
  });
};

/**
 * Get audit log statistics
 * @param {number} userId
 * @returns {Promise<Object>}
 */
const getStats = async (userId) => {
  const where = userId ? { userId } : {};

  const [totalLogs, successCount, failureCount, actionCounts] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.count({
      where: {
        ...where,
        status: 'success',
      },
    }),
    prisma.auditLog.count({
      where: {
        ...where,
        status: 'failed',
      },
    }),
    prisma.auditLog.groupBy({
      by: ['action'],
      where,
      _count: {
        action: true,
      },
      orderBy: {
        _count: {
          action: 'desc',
        },
      },
      take: 10,
    }),
  ]);

  return {
    totalLogs,
    successCount,
    failureCount,
    topActions: actionCounts.map((item) => ({
      action: item.action,
      count: item._count.action,
    })),
  };
};

module.exports = {
  create,
  findByUserId,
  findByAction,
  findByResource,
  getRecent,
  deleteOlderThan,
  getStats,
};
