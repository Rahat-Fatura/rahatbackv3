const { auditLogService } = require('../services');

/**
 * Map route patterns to audit actions and resources
 */
const routeToActionMap = {
  // Authentication
  'POST /v1/auth/login': { action: 'LOGIN', resource: 'auth' },
  'POST /v1/auth/logout': { action: 'LOGOUT', resource: 'auth' },
  'POST /v1/auth/register': { action: 'REGISTER', resource: 'auth' },
  'POST /v1/auth/forgot-password': { action: 'PASSWORD_RESET', resource: 'auth' },
  'POST /v1/auth/reset-password': { action: 'PASSWORD_RESET', resource: 'auth' },

  // Databases
  'POST /v1/databases': { action: 'DATABASE_CREATE', resource: 'database' },
  'PATCH /v1/databases/:id': { action: 'DATABASE_UPDATE', resource: 'database' },
  'DELETE /v1/databases/:id': { action: 'DATABASE_DELETE', resource: 'database' },
  'POST /v1/databases/:id/test': { action: 'DATABASE_TEST', resource: 'database' },

  // Backup Jobs
  'POST /v1/backups/jobs': { action: 'BACKUP_JOB_CREATE', resource: 'backup_job' },
  'PATCH /v1/backups/jobs/:id': { action: 'BACKUP_JOB_UPDATE', resource: 'backup_job' },
  'DELETE /v1/backups/jobs/:id': { action: 'BACKUP_JOB_DELETE', resource: 'backup_job' },
  'POST /v1/backups/jobs/:id/run': { action: 'BACKUP_JOB_RUN', resource: 'backup_job' },

  // Backup History
  'DELETE /v1/backups/history/:id': { action: 'BACKUP_DELETE', resource: 'backup' },
  'GET /v1/backups/history/:id/download': { action: 'BACKUP_DOWNLOAD', resource: 'backup' },
  'POST /v1/backups/history/:id/restore': { action: 'BACKUP_RESTORE', resource: 'backup' },

  // Cloud Storage
  'POST /v1/cloud-storage': { action: 'CLOUD_STORAGE_CREATE', resource: 'cloud_storage' },
  'PATCH /v1/cloud-storage/:id': { action: 'CLOUD_STORAGE_UPDATE', resource: 'cloud_storage' },
  'DELETE /v1/cloud-storage/:id': { action: 'CLOUD_STORAGE_DELETE', resource: 'cloud_storage' },
  'POST /v1/cloud-storage/:id/test': { action: 'CLOUD_STORAGE_TEST', resource: 'cloud_storage' },

  // Notifications
  'PATCH /v1/notifications': { action: 'NOTIFICATION_UPDATE', resource: 'notification' },
  'POST /v1/notifications/test-email': { action: 'NOTIFICATION_TEST', resource: 'notification' },

  // Users (Admin)
  'POST /v1/users': { action: 'USER_CREATE', resource: 'user' },
  'PATCH /v1/users/:id': { action: 'USER_UPDATE', resource: 'user' },
  'DELETE /v1/users/:id': { action: 'USER_DELETE', resource: 'user' },
};

/**
 * Get client IP address from request
 */
const getClientIp = (req) => {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.connection?.socket?.remoteAddress ||
    null
  );
};

/**
 * Extract resource ID from request params
 */
const getResourceId = (req, idParam = 'id') => {
  const id = req.params[idParam] || req.params.jobId || req.params.historyId || req.params.databaseId;
  return id ? parseInt(id, 10) : null;
};

/**
 * Normalize route path by replacing parameter values with :id
 */
const normalizeRoute = (path) => {
  // Replace numeric IDs with :id placeholder
  return path.replace(/\/\d+/g, '/:id');
};

/**
 * Audit logging middleware
 * Logs important user actions for compliance and security
 */
const auditLogger = () => {
  return async (req, res, next) => {
    // Skip audit logging for GET requests (except download) and health checks
    if ((req.method === 'GET' && !req.path.includes('download')) || req.path === '/health') {
      return next();
    }

    // Normalize route for matching
    const routeKey = `${req.method} ${normalizeRoute(req.path)}`;

    // Check if this route should be audited
    const auditConfig = routeToActionMap[routeKey];

    if (!auditConfig) {
      // Route not in audit map, skip logging
      return next();
    }

    // Store original res.send and res.json
    const originalSend = res.send;
    const originalJson = res.json;
    let responseBody;

    // Intercept response
    res.send = function (body) {
      responseBody = body;
      res.send = originalSend; // Restore original
      return res.send(body);
    };

    res.json = function (body) {
      responseBody = body;
      res.json = originalJson; // Restore original
      return res.json(body);
    };

    // Wait for response to finish
    res.on('finish', async () => {
      try {
        const status = res.statusCode >= 200 && res.statusCode < 400 ? 'success' : 'failed';

        // Parse response body if it's a string
        let parsedResponse;
        try {
          parsedResponse = typeof responseBody === 'string' ? JSON.parse(responseBody) : responseBody;
        } catch {
          parsedResponse = null;
        }

        const logData = {
          userId: req.user?.id || null,
          action: auditConfig.action,
          resource: auditConfig.resource,
          resourceId: getResourceId(req),
          details: {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            // Don't log sensitive data like passwords
            body: req.body
              ? {
                  ...req.body,
                  password: req.body.password ? '***' : undefined,
                  s3SecretAccessKey: req.body.s3SecretAccessKey ? '***' : undefined,
                }
              : undefined,
          },
          ipAddress: getClientIp(req),
          userAgent: req.headers['user-agent'] || null,
          status,
          errorMessage: status === 'failed' && parsedResponse?.message ? parsedResponse.message : null,
        };

        // Log asynchronously without blocking response
        auditLogService.logAction(logData).catch((error) => {
          console.error('Failed to create audit log:', error);
        });
      } catch (error) {
        console.error('Audit logging middleware error:', error);
        // Don't throw - audit logging should never break the app
      }
    });

    next();
  };
};

module.exports = auditLogger;
