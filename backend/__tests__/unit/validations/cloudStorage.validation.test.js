const Joi = require('joi');
const { cloudStorageValidation } = require('../../../src/validations');

describe('CloudStorage Validation', () => {
  describe('createCloudStorage', () => {
    it('should validate valid S3 storage configuration', () => {
      const validData = {
        name: 'My S3 Storage',
        storageType: 's3',
        s3Region: 'us-east-1',
        s3Bucket: 'my-backup-bucket',
        s3AccessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        s3SecretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        isActive: true,
      };

      const { error } = cloudStorageValidation.createCloudStorage.body.validate(validData);
      expect(error).toBeUndefined();
    });

    it('should validate valid Google Drive storage configuration', () => {
      const validData = {
        name: 'My Google Drive',
        storageType: 'google_drive',
        gdRefreshToken: '1//0gWhateverRefreshToken',
        isActive: true,
      };

      const { error } = cloudStorageValidation.createCloudStorage.body.validate(validData);
      expect(error).toBeUndefined();
    });

    it('should require name field', () => {
      const invalidData = {
        storageType: 's3',
      };

      const { error } = cloudStorageValidation.createCloudStorage.body.validate(invalidData);
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('name');
    });

    it('should require s3Region for S3 storage', () => {
      const invalidData = {
        name: 'My S3',
        storageType: 's3',
        s3Bucket: 'my-bucket',
        s3AccessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        s3SecretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      };

      const { error } = cloudStorageValidation.createCloudStorage.body.validate(invalidData);
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('s3Region');
    });

    it('should require gdRefreshToken for Google Drive storage', () => {
      const invalidData = {
        name: 'My Drive',
        storageType: 'google_drive',
      };

      const { error } = cloudStorageValidation.createCloudStorage.body.validate(invalidData);
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('gdRefreshToken');
    });

    it('should validate S3 bucket name format', () => {
      const invalidData = {
        name: 'My S3',
        storageType: 's3',
        s3Region: 'us-east-1',
        s3Bucket: 'Invalid_Bucket_Name', // Uppercase and underscores not allowed
        s3AccessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        s3SecretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      };

      const { error } = cloudStorageValidation.createCloudStorage.body.validate(invalidData);
      expect(error).toBeDefined();
      expect(error.details[0].message).toContain('AWS naming rules');
    });

    it('should validate S3 endpoint URL format', () => {
      const invalidData = {
        name: 'My S3',
        storageType: 's3',
        s3Region: 'us-east-1',
        s3Bucket: 'my-bucket',
        s3AccessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        s3SecretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        s3Endpoint: 'invalid-url', // Missing http:// or https://
      };

      const { error } = cloudStorageValidation.createCloudStorage.body.validate(invalidData);
      expect(error).toBeDefined();
    });

    it('should reject invalid storage type', () => {
      const invalidData = {
        name: 'My Storage',
        storageType: 'dropbox', // Not in enum
      };

      const { error } = cloudStorageValidation.createCloudStorage.body.validate(invalidData);
      expect(error).toBeDefined();
      expect(error.details[0].message).toContain('must be one of');
    });
  });

  describe('updateCloudStorage', () => {
    it('should validate partial update data', () => {
      const validData = {
        name: 'Updated Name',
      };

      const { error } = cloudStorageValidation.updateCloudStorage.body.validate(validData);
      expect(error).toBeUndefined();
    });

    it('should require at least one field', () => {
      const invalidData = {};

      const { error } = cloudStorageValidation.updateCloudStorage.body.validate(invalidData);
      expect(error).toBeDefined();
    });

    it('should validate id param', () => {
      const validParams = { id: '123' };
      const invalidParams = { id: 'abc' };

      const { error: validError } = cloudStorageValidation.updateCloudStorage.params.validate(validParams);
      expect(validError).toBeUndefined();

      const { error: invalidError } = cloudStorageValidation.updateCloudStorage.params.validate(invalidParams);
      expect(invalidError).toBeDefined();
    });
  });

  describe('getCloudStorages', () => {
    it('should validate query filters', () => {
      const validQuery = {
        storageType: 's3',
        isActive: true,
      };

      const { error } = cloudStorageValidation.getCloudStorages.query.validate(validQuery);
      expect(error).toBeUndefined();
    });

    it('should allow empty query', () => {
      const { error } = cloudStorageValidation.getCloudStorages.query.validate({});
      expect(error).toBeUndefined();
    });
  });
});
