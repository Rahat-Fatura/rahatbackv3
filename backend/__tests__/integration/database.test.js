const request = require('supertest');
const httpStatus = require('http-status');
const app = require('../../src/app');
const { databaseModel } = require('../../src/models');

jest.mock('../../src/models');
jest.mock('../../src/middlewares/auth', () => ({
  __esModule: true,
  default: () => (req, res, next) => {
    req.user = { userId: 1, role: 'user' };
    next();
  },
}));

const databaseService = require('../../src/services/database.service');

describe('Database Routes', () => {
  let mockDatabase;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDatabase = {
      id: 1,
      userId: 1,
      name: 'Test Database',
      type: 'postgresql',
      host: 'localhost',
      port: 5432,
      username: 'testuser',
      database: 'testdb',
      sslEnabled: false,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });

  describe('POST /v1/databases', () => {
    it('should return 201 and successfully create database if data is ok', async () => {
      databaseService.createDatabase = jest.fn().mockResolvedValue(mockDatabase);

      const res = await request(app)
        .post('/v1/databases')
        .set('Authorization', 'Bearer validToken')
        .send({
          name: 'Test Database',
          type: 'postgresql',
          host: 'localhost',
          port: 5432,
          username: 'testuser',
          password: 'testpass',
          database: 'testdb',
        })
        .expect(httpStatus.CREATED);

      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('Test Database');
    });

    it('should return 400 if database type is invalid', async () => {
      await request(app)
        .post('/v1/databases')
        .set('Authorization', 'Bearer validToken')
        .send({
          name: 'Test Database',
          type: 'invalid_type',
          host: 'localhost',
          port: 5432,
          username: 'testuser',
          password: 'testpass',
          database: 'testdb',
        })
        .expect(httpStatus.BAD_REQUEST);
    });

    it('should return 400 if required fields are missing', async () => {
      await request(app)
        .post('/v1/databases')
        .set('Authorization', 'Bearer validToken')
        .send({
          name: 'Test Database',
          type: 'postgresql',
        })
        .expect(httpStatus.BAD_REQUEST);
    });
  });

  describe('GET /v1/databases', () => {
    it('should return 200 and list of databases', async () => {
      databaseService.getUserDatabases = jest.fn().mockResolvedValue([mockDatabase]);

      const res = await request(app)
        .get('/v1/databases')
        .set('Authorization', 'Bearer validToken')
        .expect(httpStatus.OK);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
    });

    it('should return 200 and empty array if no databases found', async () => {
      databaseService.getUserDatabases = jest.fn().mockResolvedValue([]);

      const res = await request(app)
        .get('/v1/databases')
        .set('Authorization', 'Bearer validToken')
        .expect(httpStatus.OK);

      expect(res.body).toEqual([]);
    });
  });

  describe('GET /v1/databases/:databaseId', () => {
    it('should return 200 and database object if database exists', async () => {
      databaseService.getDatabaseById = jest.fn().mockResolvedValue(mockDatabase);

      const res = await request(app)
        .get('/v1/databases/1')
        .set('Authorization', 'Bearer validToken')
        .expect(httpStatus.OK);

      expect(res.body).toHaveProperty('id');
      expect(res.body.id).toBe(1);
    });

    it('should return 404 if database not found', async () => {
      databaseService.getDatabaseById = jest.fn().mockRejectedValue(
        new (require('../../src/utils/ApiError'))(httpStatus.NOT_FOUND, 'Database not found')
      );

      await request(app)
        .get('/v1/databases/999')
        .set('Authorization', 'Bearer validToken')
        .expect(httpStatus.NOT_FOUND);
    });
  });

  describe('PATCH /v1/databases/:databaseId', () => {
    it('should return 200 and updated database', async () => {
      const updatedDatabase = { ...mockDatabase, name: 'Updated Database' };
      databaseService.updateDatabase = jest.fn().mockResolvedValue(updatedDatabase);

      const res = await request(app)
        .patch('/v1/databases/1')
        .set('Authorization', 'Bearer validToken')
        .send({ name: 'Updated Database' })
        .expect(httpStatus.OK);

      expect(res.body.name).toBe('Updated Database');
    });

    it('should return 404 if database not found', async () => {
      databaseService.updateDatabase = jest.fn().mockRejectedValue(
        new (require('../../src/utils/ApiError'))(httpStatus.NOT_FOUND, 'Database not found')
      );

      await request(app)
        .patch('/v1/databases/999')
        .set('Authorization', 'Bearer validToken')
        .send({ name: 'Updated Database' })
        .expect(httpStatus.NOT_FOUND);
    });
  });

  describe('DELETE /v1/databases/:databaseId', () => {
    it('should return 204 if database is successfully deleted', async () => {
      databaseService.deleteDatabase = jest.fn().mockResolvedValue(mockDatabase);

      await request(app)
        .delete('/v1/databases/1')
        .set('Authorization', 'Bearer validToken')
        .expect(httpStatus.NO_CONTENT);
    });

    it('should return 404 if database not found', async () => {
      databaseService.deleteDatabase = jest.fn().mockRejectedValue(
        new (require('../../src/utils/ApiError'))(httpStatus.NOT_FOUND, 'Database not found')
      );

      await request(app)
        .delete('/v1/databases/999')
        .set('Authorization', 'Bearer validToken')
        .expect(httpStatus.NOT_FOUND);
    });
  });

  describe('POST /v1/databases/:databaseId/test', () => {
    it('should return 200 if connection test is successful', async () => {
      databaseService.testDatabaseConnection = jest.fn().mockResolvedValue({
        success: true,
        message: 'Connection successful',
      });

      const res = await request(app)
        .post('/v1/databases/1/test')
        .set('Authorization', 'Bearer validToken')
        .expect(httpStatus.OK);

      expect(res.body.success).toBe(true);
    });

    it('should return 404 if database not found', async () => {
      databaseService.testDatabaseConnection = jest.fn().mockRejectedValue(
        new (require('../../src/utils/ApiError'))(httpStatus.NOT_FOUND, 'Database not found')
      );

      await request(app)
        .post('/v1/databases/999/test')
        .set('Authorization', 'Bearer validToken')
        .expect(httpStatus.NOT_FOUND);
    });
  });

  describe('POST /v1/databases/test-connection', () => {
    it('should return 200 if connection test with credentials is successful', async () => {
      databaseService.testConnectionWithCredentials = jest.fn().mockResolvedValue({
        success: true,
        message: 'Connection successful',
      });

      const res = await request(app)
        .post('/v1/databases/test-connection')
        .set('Authorization', 'Bearer validToken')
        .send({
          type: 'postgresql',
          host: 'localhost',
          port: 5432,
          username: 'testuser',
          password: 'testpass',
          database: 'testdb',
        })
        .expect(httpStatus.OK);

      expect(res.body.success).toBe(true);
    });

    it('should return 400 if required fields are missing', async () => {
      await request(app)
        .post('/v1/databases/test-connection')
        .set('Authorization', 'Bearer validToken')
        .send({
          type: 'postgresql',
          host: 'localhost',
        })
        .expect(httpStatus.BAD_REQUEST);
    });
  });
});
