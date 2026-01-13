const Joi = require('joi');

const createDatabase = {
  body: Joi.object().keys({
    name: Joi.string()
      .required()
      .min(2)
      .max(100)
      .pattern(/^[a-zA-Z0-9\s\-_]+$/)
      .messages({
        'string.pattern.base': 'Database name can only contain letters, numbers, spaces, hyphens and underscores',
      }),
    type: Joi.string()
      .required()
      .valid('postgresql', 'mysql', 'mongodb', 'mssql', 'mariadb')
      .messages({
        'any.only': 'Database type must be one of: postgresql, mysql, mongodb, mssql, mariadb',
      }),
    host: Joi.string()
      .required()
      .pattern(/^[a-zA-Z0-9\.\-]+$/)
      .max(255)
      .messages({
        'string.pattern.base': 'Host can only contain letters, numbers, dots and hyphens',
      }),
    port: Joi.number()
      .required()
      .integer()
      .min(1)
      .max(65535)
      .messages({
        'number.min': 'Port must be between 1 and 65535',
        'number.max': 'Port must be between 1 and 65535',
      }),
    username: Joi.string()
      .required()
      .min(1)
      .max(100)
      .pattern(/^[a-zA-Z0-9_\-@\.]+$/)
      .messages({
        'string.pattern.base': 'Username contains invalid characters',
      }),
    password: Joi.string()
      .required()
      .min(1)
      .max(500), // Allow long passwords but limit to prevent abuse
    database: Joi.string()
      .required()
      .min(1)
      .max(100)
      .pattern(/^[a-zA-Z0-9_\-]+$/)
      .messages({
        'string.pattern.base': 'Database name can only contain letters, numbers, underscores and hyphens',
      }),
    connectionString: Joi.string()
      .optional()
      .max(2000)
      .allow('', null),
    sslEnabled: Joi.boolean().optional().default(false),
    isActive: Joi.boolean().optional().default(true),
  }),
};

const updateDatabase = {
  params: Joi.object().keys({
    databaseId: Joi.number().integer().required(),
  }),
  body: Joi.object()
    .keys({
      name: Joi.string()
        .min(2)
        .max(100)
        .pattern(/^[a-zA-Z0-9\s\-_]+$/),
      host: Joi.string()
        .pattern(/^[a-zA-Z0-9\.\-]+$/)
        .max(255),
      port: Joi.number().integer().min(1).max(65535),
      username: Joi.string()
        .min(1)
        .max(100)
        .pattern(/^[a-zA-Z0-9_\-@\.]+$/),
      password: Joi.string().min(1).max(500),
      database: Joi.string()
        .min(1)
        .max(100)
        .pattern(/^[a-zA-Z0-9_\-]+$/),
      connectionString: Joi.string().max(2000).allow('', null),
      sslEnabled: Joi.boolean(),
      isActive: Joi.boolean(),
    })
    .min(1), // At least one field must be provided
};

const getDatabase = {
  params: Joi.object().keys({
    databaseId: Joi.number().integer().required(),
  }),
};

const deleteDatabase = {
  params: Joi.object().keys({
    databaseId: Joi.number().integer().required(),
  }),
};

const testConnection = {
  params: Joi.object().keys({
    databaseId: Joi.number().integer().required(),
  }),
};

const testConnectionWithCredentials = {
  body: Joi.object().keys({
    name: Joi.string().optional().allow(''),
    type: Joi.string()
      .required()
      .valid('postgresql', 'mysql', 'mongodb', 'mssql', 'mariadb'),
    host: Joi.string()
      .required()
      .pattern(/^[a-zA-Z0-9\.\-]+$/)
      .max(255),
    port: Joi.number().required().integer().min(1).max(65535),
    username: Joi.string()
      .required()
      .min(1)
      .max(100)
      .pattern(/^[a-zA-Z0-9_\-@\.]+$/),
    password: Joi.string().required().min(1).max(500),
    database: Joi.string()
      .required()
      .min(1)
      .max(100)
      .pattern(/^[a-zA-Z0-9_\-]+$/),
    connectionString: Joi.string().max(2000).allow('', null),
    sslEnabled: Joi.boolean().default(false),
    isActive: Joi.boolean().optional(),
  }),
};

const getDatabases = {
  query: Joi.object().keys({
    type: Joi.string().valid('postgresql', 'mysql', 'mongodb', 'mssql', 'mariadb'),
    isActive: Joi.boolean(),
  }),
};

const getDatabaseSize = {
  params: Joi.object().keys({
    databaseId: Joi.number().integer().required(),
  }),
};

module.exports = {
  createDatabase,
  updateDatabase,
  getDatabase,
  deleteDatabase,
  testConnection,
  testConnectionWithCredentials,
  getDatabases,
  getDatabaseSize,
};
