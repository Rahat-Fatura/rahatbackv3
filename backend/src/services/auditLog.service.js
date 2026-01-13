const httpStatus = require('http-status');
const { auditLogModel } = require('../models');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');

/**
 * Log an audit action
 * @param {Object} logData
 * @returns {Promise<Object>}
 */
const logAction = async (logData) => {
  try {
    const auditLog = await auditLogModel.create({
      userId: logData.userId || null,
      action: logData.action,
      resource: logData.resource || null,
      resourceId: logData.resourceId || null,
      details: logData.details ? JSON.stringify(logData.details) : null,
      ipAddress: logData.ipAddress || null,
      userAgent: logData.userAgent || null,
      status: logData.status || 'success',
      errorMessage: logData.errorMessage || null,
    });

    logger.info(
      `Audit log created: ${logData.action} by user ${logData.userId || 'anonymous'} - ${logData.status || 'success'}`
    );

    return auditLog;
  } catch (error) {
    // Don't throw error, just log it - audit logging should never break the main flow
    logger.error(`Failed to create audit log: ${error.message}`);
    return null;
  }
};

/**
 * Get audit logs for a user
 * @param {number} userId
 * @param {Object} filters
 * @returns {Promise<Object>}
 */
const getUserAuditLogs = async (userId, filters = {}) => {
  return await auditLogModel.findByUserId(userId, filters);
};

/**
 * Get audit logs by action type
 * @param {string} action
 * @param {Object} options
 * @returns {Promise<Array>}
 */
const getAuditLogsByAction = async (action, options = {}) => {
  return await auditLogModel.findByAction(action, options);
};

/**
 * Get audit logs for a specific resource
 * @param {string} resource
 * @param {number} resourceId
 * @returns {Promise<Array>}
 */
const getResourceAuditLogs = async (resource, resourceId) => {
  return await auditLogModel.findByResource(resource, resourceId);
};

/**
 * Get recent audit logs
 * @param {number} limit
 * @returns {Promise<Array>}
 */
const getRecentAuditLogs = async (limit = 100) => {
  return await auditLogModel.getRecent(limit);
};

/**
 * Get audit log statistics
 * @param {number} userId - Optional, if not provided returns global stats
 * @returns {Promise<Object>}
 */
const getAuditLogStats = async (userId = null) => {
  return await auditLogModel.getStats(userId);
};

/**
 * Clean up old audit logs
 * @param {number} days - Delete logs older than this many days
 * @returns {Promise<Object>}
 */
const cleanupOldLogs = async (days = 90) => {
  try {
    const result = await auditLogModel.deleteOlderThan(days);
    logger.info(`Cleaned up ${result.count} audit logs older than ${days} days`);
    return result;
  } catch (error) {
    logger.error(`Failed to cleanup old audit logs: ${error.message}`);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to cleanup audit logs');
  }
};

module.exports = {
  logAction,
  getUserAuditLogs,
  getAuditLogsByAction,
  getResourceAuditLogs,
  getRecentAuditLogs,
  getAuditLogStats,
  cleanupOldLogs,
};
