const Joi = require('joi');

const createCloudStorage = {
  body: Joi.object().keys({
    name: Joi.string()
      .required()
      .min(2)
      .max(100)
      .pattern(/^[a-zA-Z0-9\s\-_]+$/)
      .messages({
        'string.pattern.base': 'Storage name can only contain letters, numbers, spaces, hyphens and underscores',
      }),
    storageType: Joi.string()
      .required()
      .valid('local', 's3', 'google_drive', 'ftp', 'azure')
      .messages({
        'any.only': 'Storage type must be one of: local, s3, google_drive, ftp, azure',
      }),
    isActive: Joi.boolean().optional().default(true),
    isDefault: Joi.boolean().optional().default(false),

    // AWS S3 Configuration
    s3Region: Joi.string()
      .when('storageType', {
        is: 's3',
        then: Joi.string().required().min(2).max(50),
        otherwise: Joi.optional().allow(null, ''),
      })
      .messages({
        'any.required': 'S3 region is required for S3 storage type',
      }),
    s3Bucket: Joi.string()
      .when('storageType', {
        is: 's3',
        then: Joi.string()
          .required()
          .min(3)
          .max(63)
          .pattern(/^[a-z0-9][a-z0-9\-]*[a-z0-9]$/)
          .messages({
            'string.pattern.base': 'S3 bucket name must follow AWS naming rules',
          }),
        otherwise: Joi.optional().allow(null, ''),
      })
      .messages({
        'any.required': 'S3 bucket name is required for S3 storage type',
      }),
    s3AccessKeyId: Joi.string()
      .when('storageType', {
        is: 's3',
        then: Joi.string().required().min(16).max(128),
        otherwise: Joi.optional().allow(null, ''),
      })
      .messages({
        'any.required': 'S3 access key ID is required for S3 storage type',
      }),
    s3SecretAccessKey: Joi.string()
      .when('storageType', {
        is: 's3',
        then: Joi.string().required().min(40).max(128),
        otherwise: Joi.optional().allow(null, ''),
      })
      .messages({
        'any.required': 'S3 secret access key is required for S3 storage type',
      }),
    s3Endpoint: Joi.string()
      .optional()
      .allow(null, '')
      .uri()
      .pattern(/^https?:\/\//)
      .messages({
        'string.uri': 'S3 endpoint must be a valid URL',
        'string.pattern.base': 'S3 endpoint must start with http:// or https://',
      }),

    // Google Drive Configuration
    gdRefreshToken: Joi.string()
      .when('storageType', {
        is: 'google_drive',
        then: Joi.string().required().min(20),
        otherwise: Joi.optional().allow(null, ''),
      })
      .messages({
        'any.required': 'Google Drive refresh token is required for Google Drive storage type',
      }),
    gdFolderId: Joi.string()
      .optional()
      .allow(null, '')
      .min(10)
      .max(100),
  }),
};

const updateCloudStorage = {
  params: Joi.object().keys({
    id: Joi.number().integer().required(),
  }),
  body: Joi.object()
    .keys({
      name: Joi.string()
        .min(2)
        .max(100)
        .pattern(/^[a-zA-Z0-9\s\-_]+$/),
      storageType: Joi.string()
        .valid('local', 's3', 'google_drive', 'ftp', 'azure')
        .messages({
          'any.only': 'Storage type must be one of: local, s3, google_drive, ftp, azure',
        }),
      isActive: Joi.boolean(),
      isDefault: Joi.boolean(),

      // AWS S3 Configuration
      s3Region: Joi.string().min(2).max(50).allow(null, ''),
      s3Bucket: Joi.string()
        .min(3)
        .max(63)
        .pattern(/^[a-z0-9][a-z0-9\-]*[a-z0-9]$/)
        .allow(null, ''),
      s3AccessKeyId: Joi.string().min(16).max(128).allow(null, ''),
      s3SecretAccessKey: Joi.string().min(40).max(128).allow(null, ''),
      s3Endpoint: Joi.string()
        .allow(null, '')
        .uri()
        .pattern(/^https?:\/\//),

      // Google Drive Configuration
      gdRefreshToken: Joi.string().min(20).allow(null, ''),
      gdFolderId: Joi.string()
        .allow(null, '')
        .min(10)
        .max(100),
    })
    .min(1), // At least one field must be provided
};

const getCloudStorage = {
  params: Joi.object().keys({
    id: Joi.number().integer().required(),
  }),
};

const deleteCloudStorage = {
  params: Joi.object().keys({
    id: Joi.number().integer().required(),
  }),
};

const testConnection = {
  params: Joi.object().keys({
    id: Joi.number().integer().required(),
  }),
};

const setAsDefault = {
  params: Joi.object().keys({
    id: Joi.number().integer().required(),
  }),
};

const listFiles = {
  params: Joi.object().keys({
    id: Joi.number().integer().required(),
  }),
};

const getCloudStorages = {
  query: Joi.object().keys({
    storageType: Joi.string().valid('local', 's3', 'google_drive', 'ftp', 'azure'),
    isActive: Joi.alternatives().try(
      Joi.boolean(),
      Joi.string().valid('true', 'false')
    ),
  }),
};

module.exports = {
  createCloudStorage,
  updateCloudStorage,
  getCloudStorage,
  deleteCloudStorage,
  testConnection,
  setAsDefault,
  listFiles,
  getCloudStorages,
};
