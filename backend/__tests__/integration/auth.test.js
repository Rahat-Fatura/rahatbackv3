const request = require('supertest');
const httpStatus = require('http-status');
const app = require('../../src/app');
const { userModel } = require('../../src/models');
const { tokenService } = require('../../src/services');
const { tokenTypes } = require('../../src/config/tokens');

// Mock the models and services
jest.mock('../../src/models');
jest.mock('../../src/services/user.service');
jest.mock('../../src/services/token.service');

const userService = require('../../src/services/user.service');

describe('Auth Routes', () => {
  let newUser;

  beforeEach(() => {
    jest.clearAllMocks();

    newUser = {
      id: 1,
      name: 'Test User',
      email: 'test@example.com',
      password: 'hashedPassword123',
      role: 'user',
      isEmailVerified: false,
      status: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });

  describe('POST /v1/auth/register', () => {
    it('should return 201 and successfully register user if request data is ok', async () => {
      userService.createUser = jest.fn().mockResolvedValue(newUser);
      tokenService.generateAuthTokens = jest.fn().mockResolvedValue({
        access: { token: 'accessToken', expires: new Date() },
        refresh: { token: 'refreshToken', expires: new Date() },
      });

      const res = await request(app)
        .post('/v1/auth/register')
        .send({
          name: 'Test User',
          email: 'test@example.com',
          password: 'Password123!',
        })
        .expect(httpStatus.CREATED);

      expect(res.body.user).toBeDefined();
      expect(res.body.tokens).toBeDefined();
    });

    it('should return 400 error if email is invalid', async () => {
      await request(app)
        .post('/v1/auth/register')
        .send({
          name: 'Test User',
          email: 'invalidEmail',
          password: 'Password123!',
        })
        .expect(httpStatus.BAD_REQUEST);
    });

    it('should return 400 error if password is too short', async () => {
      await request(app)
        .post('/v1/auth/register')
        .send({
          name: 'Test User',
          email: 'test@example.com',
          password: 'pass',
        })
        .expect(httpStatus.BAD_REQUEST);
    });

    it('should return 400 error if name is missing', async () => {
      await request(app)
        .post('/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'Password123!',
        })
        .expect(httpStatus.BAD_REQUEST);
    });
  });

  describe('POST /v1/auth/login', () => {
    it('should return 200 and login user if credentials are valid', async () => {
      const authService = require('../../src/services/auth.service');
      authService.loginUserWithEmailAndPassword = jest.fn().mockResolvedValue(newUser);
      tokenService.generateAuthTokens = jest.fn().mockResolvedValue({
        access: { token: 'accessToken', expires: new Date() },
        refresh: { token: 'refreshToken', expires: new Date() },
      });

      const res = await request(app)
        .post('/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'Password123!',
        })
        .expect(httpStatus.OK);

      expect(res.body.user).toBeDefined();
      expect(res.body.tokens).toBeDefined();
    });

    it('should return 400 error if email is invalid', async () => {
      await request(app)
        .post('/v1/auth/login')
        .send({
          email: 'invalidEmail',
          password: 'Password123!',
        })
        .expect(httpStatus.BAD_REQUEST);
    });

    it('should return 400 error if password is missing', async () => {
      await request(app)
        .post('/v1/auth/login')
        .send({
          email: 'test@example.com',
        })
        .expect(httpStatus.BAD_REQUEST);
    });
  });

  describe('POST /v1/auth/logout', () => {
    it('should return 204 if logout is successful', async () => {
      const authService = require('../../src/services/auth.service');
      authService.logout = jest.fn().mockResolvedValue();

      await request(app)
        .post('/v1/auth/logout')
        .send({ refreshToken: 'validRefreshToken' })
        .expect(httpStatus.NO_CONTENT);
    });

    it('should return 400 if refresh token is missing', async () => {
      await request(app).post('/v1/auth/logout').send({}).expect(httpStatus.BAD_REQUEST);
    });
  });

  describe('POST /v1/auth/refresh-tokens', () => {
    it('should return 200 and new auth tokens if refresh token is valid', async () => {
      const authService = require('../../src/services/auth.service');
      authService.refreshAuth = jest.fn().mockResolvedValue({
        access: { token: 'newAccessToken', expires: new Date() },
        refresh: { token: 'newRefreshToken', expires: new Date() },
      });

      const res = await request(app)
        .post('/v1/auth/refresh-tokens')
        .send({ refreshToken: 'validRefreshToken' })
        .expect(httpStatus.OK);

      expect(res.body).toHaveProperty('access');
      expect(res.body).toHaveProperty('refresh');
    });

    it('should return 400 if refresh token is missing', async () => {
      await request(app).post('/v1/auth/refresh-tokens').send({}).expect(httpStatus.BAD_REQUEST);
    });
  });

  describe('POST /v1/auth/forgot-password', () => {
    it('should return 204 if forgot password request is successful', async () => {
      tokenService.generateResetPasswordToken = jest.fn().mockResolvedValue('resetToken');
      const emailService = require('../../src/services/email.service');
      emailService.sendResetPasswordEmail = jest.fn().mockResolvedValue();

      await request(app)
        .post('/v1/auth/forgot-password')
        .send({ email: 'test@example.com' })
        .expect(httpStatus.NO_CONTENT);
    });

    it('should return 400 if email is invalid', async () => {
      await request(app)
        .post('/v1/auth/forgot-password')
        .send({ email: 'invalidEmail' })
        .expect(httpStatus.BAD_REQUEST);
    });
  });

  describe('POST /v1/auth/reset-password', () => {
    it('should return 204 if reset password is successful', async () => {
      const authService = require('../../src/services/auth.service');
      authService.resetPassword = jest.fn().mockResolvedValue();

      await request(app)
        .post('/v1/auth/reset-password')
        .query({ token: 'validResetToken' })
        .send({ password: 'NewPassword123!' })
        .expect(httpStatus.NO_CONTENT);
    });

    it('should return 400 if password is too short', async () => {
      await request(app)
        .post('/v1/auth/reset-password')
        .query({ token: 'validResetToken' })
        .send({ password: 'short' })
        .expect(httpStatus.BAD_REQUEST);
    });

    it('should return 400 if token is missing', async () => {
      await request(app)
        .post('/v1/auth/reset-password')
        .send({ password: 'NewPassword123!' })
        .expect(httpStatus.BAD_REQUEST);
    });
  });

  describe('POST /v1/auth/verify-email', () => {
    it('should return 204 if email verification is successful', async () => {
      const authService = require('../../src/services/auth.service');
      authService.verifyEmail = jest.fn().mockResolvedValue();

      await request(app)
        .post('/v1/auth/verify-email')
        .query({ token: 'validVerifyToken' })
        .expect(httpStatus.NO_CONTENT);
    });

    it('should return 400 if token is missing', async () => {
      await request(app).post('/v1/auth/verify-email').expect(httpStatus.BAD_REQUEST);
    });
  });

  describe('2FA Endpoints', () => {
    describe('POST /v1/auth/2fa/generate', () => {
      it('should return 200 and generate 2FA secret', async () => {
        const authService = require('../../src/services/auth.service');
        authService.generate2FASecret = jest.fn().mockResolvedValue({
          secret: 'JBSWY3DPEHPK3PXP',
          qrCode: 'data:image/png;base64,iVBORw0KGgo...',
          otpauthUrl: 'otpauth://totp/...',
        });

        // Mock auth middleware
        const auth = require('../../src/middlewares/auth');
        auth.mockImplementation(() => (req, res, next) => {
          req.user = { userId: 1 };
          next();
        });

        const res = await request(app)
          .post('/v1/auth/2fa/generate')
          .set('Authorization', 'Bearer validToken')
          .expect(httpStatus.OK);

        expect(res.body).toHaveProperty('secret');
        expect(res.body).toHaveProperty('qrCode');
      });
    });
  });
});
