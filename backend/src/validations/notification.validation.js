const Joi = require('joi');

const updateSettings = {
  body: Joi.object()
    .keys({
      emailEnabled: Joi.boolean(),
      dailySummaryEnabled: Joi.boolean(),
      dailySummaryTime: Joi.string()
        .pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
        .messages({
          'string.pattern.base': 'Daily summary time must be in HH:MM format (e.g., 09:00)',
        }),
      recipientEmail: Joi.string()
        .email({ tlds: { allow: false } })
        .allow(null, '')
        .messages({
          'string.email': 'Recipient email must be a valid email address',
        }),
      notifyOnSuccess: Joi.boolean(),
      notifyOnFailure: Joi.boolean(),
      isActive: Joi.boolean(),
      // Allow but ignore these fields from frontend
      id: Joi.any().strip(),
      userId: Joi.any().strip(),
      createdAt: Joi.any().strip(),
      updatedAt: Joi.any().strip(),
    })
    .min(1) // At least one field must be provided
    .messages({
      'object.min': 'At least one setting field must be provided',
    }),
};

const getSettings = {
  // No validation needed - just GET request with auth
};

const testEmail = {
  // No validation needed - just POST request with auth
};

module.exports = {
  updateSettings,
  getSettings,
  testEmail,
};
