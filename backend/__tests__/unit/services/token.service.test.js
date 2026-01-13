// Mock dependencies FIRST before any imports
jest.mock('../../../src/models');
jest.mock('../../../src/services/user.service');
jest.mock('jsonwebtoken');
jest.mock('moment');

// Import after mocks
const tokenService = require('../../../src/services/token.service');
const { tokenModel } = require('../../../src/models');
const userService = require('../../../src/services/user.service');
const jwt = require('jsonwebtoken');
const moment = require('moment');
const ApiError = require('../../../src/utils/ApiError');
const { generateFakeUser } = require('../../utils/testHelpers');
const { tokenTypes } = require('../../../src/config/tokens');
const httpStatus = require('http-status');

describe('Token Service', () => {
  let mockMoment;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup moment mock
    mockMoment = {
      unix: jest.fn().mockReturnValue(1234567890),
      add: jest.fn().mockReturnThis(),
      toDate: jest.fn().mockReturnValue(new Date('2025-01-01')),
      toISOString: jest.fn().mockReturnValue('2025-01-01T00:00:00.000Z'),
    };

    moment.mockReturnValue(mockMoment);
    moment.unix = jest.fn().mockReturnValue(mockMoment);
  });

  describe('generateToken', () => {
    const userId = 1;
    const type = tokenTypes.ACCESS;

    it('should generate token successfully', () => {
      const expectedToken = 'generated.jwt.token';
      jwt.sign.mockReturnValue(expectedToken);

      const result = tokenService.generateToken(userId, mockMoment, type);

      expect(jwt.sign).toHaveBeenCalledWith(
        {
          sub: userId,
          iat: 1234567890,
          exp: 1234567890,
          type,
        },
        expect.any(String)
      );
      expect(result).toBe(expectedToken);
    });

    it('should use custom secret if provided', () => {
      const customSecret = 'custom-secret-key';
      jwt.sign.mockReturnValue('token');

      tokenService.generateToken(userId, mockMoment, type, customSecret);

      expect(jwt.sign).toHaveBeenCalledWith(expect.any(Object), customSecret);
    });
  });

  describe('saveToken', () => {
    const token = 'test.token.value';
    const userId = 1;
    const type = tokenTypes.REFRESH;

    it('should save token successfully', async () => {
      const mockTokenDoc = {
        id: 1,
        token,
        userId,
        type,
        blacklisted: false,
        expiresAt: new Date('2025-01-01'),
      };

      tokenModel.createToken.mockResolvedValue(mockTokenDoc);

      const result = await tokenService.saveToken(token, userId, mockMoment, type);

      expect(tokenModel.createToken).toHaveBeenCalledWith(userId, '2025-01-01T00:00:00.000Z', type, token, false);
      expect(result).toEqual(mockTokenDoc);
    });

    it('should save token as blacklisted if specified', async () => {
      const mockTokenDoc = { id: 1, token, userId, type, blacklisted: true };
      tokenModel.createToken.mockResolvedValue(mockTokenDoc);

      await tokenService.saveToken(token, userId, mockMoment, type, true);

      expect(tokenModel.createToken).toHaveBeenCalledWith(userId, expect.any(String), type, token, true);
    });
  });

  describe('findToken', () => {
    const whereParams = { token: 'test.token', type: tokenTypes.REFRESH, blacklisted: false };

    it('should find token successfully', async () => {
      const mockTokenDoc = { id: 1, ...whereParams };
      tokenModel.findToken.mockResolvedValue(mockTokenDoc);

      const result = await tokenService.findToken(whereParams);

      expect(tokenModel.findToken).toHaveBeenCalledWith(whereParams);
      expect(result).toEqual(mockTokenDoc);
    });

    it('should return null if token not found', async () => {
      tokenModel.findToken.mockResolvedValue(null);

      const result = await tokenService.findToken(whereParams);

      expect(result).toBeNull();
    });
  });

  describe('verifyToken', () => {
    const token = 'test.jwt.token';
    const type = tokenTypes.ACCESS;
    const userId = 1;

    it('should verify token successfully', async () => {
      const payload = { sub: userId, type, iat: 1234567890, exp: 9999999999 };
      const mockTokenDoc = { id: 1, token, userId, type, blacklisted: false };

      jwt.verify.mockReturnValue(payload);
      tokenModel.findToken.mockResolvedValue(mockTokenDoc);

      const result = await tokenService.verifyToken(token, type);

      expect(jwt.verify).toHaveBeenCalledWith(token, expect.any(String));
      expect(tokenModel.findToken).toHaveBeenCalledWith({
        token,
        type,
        userId,
        blacklisted: false,
      });
      expect(result).toEqual(mockTokenDoc);
    });

    it('should throw error if token not found in database', async () => {
      const payload = { sub: userId, type };
      jwt.verify.mockReturnValue(payload);
      tokenModel.findToken.mockResolvedValue(null);

      await expect(tokenService.verifyToken(token, type)).rejects.toThrow('Token bulunamadı');
    });

    it('should throw error if JWT verification fails', async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(tokenService.verifyToken(token, type)).rejects.toThrow('Invalid token');
    });
  });

  describe('generateAuthTokens', () => {
    const mockUser = generateFakeUser({ id: 1, role: 'user' });

    it('should generate auth tokens successfully', async () => {
      const accessToken = 'access.token.value';
      const refreshToken = 'refresh.token.value';

      jwt.sign.mockReturnValueOnce(accessToken).mockReturnValueOnce(refreshToken);
      tokenModel.createToken.mockResolvedValue({ id: 1, token: refreshToken });

      const result = await tokenService.generateAuthTokens(mockUser);

      expect(jwt.sign).toHaveBeenCalledTimes(2);
      expect(tokenModel.createToken).toHaveBeenCalledWith(
        mockUser.id,
        expect.any(String),
        tokenTypes.REFRESH,
        refreshToken,
        false
      );
      expect(result).toHaveProperty('access');
      expect(result).toHaveProperty('refresh');
      expect(result.access.token).toBe(accessToken);
      expect(result.refresh.token).toBe(refreshToken);
    });

    it('should include user role in tokens', async () => {
      jwt.sign.mockReturnValue('token');
      tokenModel.createToken.mockResolvedValue({ id: 1 });

      await tokenService.generateAuthTokens(mockUser);

      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: mockUser.id,
          role: mockUser.role,
        }),
        expect.any(String)
      );
    });

    it('should save refresh token to database', async () => {
      jwt.sign.mockReturnValue('token');
      tokenModel.createToken.mockResolvedValue({ id: 1 });

      await tokenService.generateAuthTokens(mockUser);

      expect(tokenModel.createToken).toHaveBeenCalled();
    });
  });

  describe('generateResetPasswordToken', () => {
    const email = 'test@example.com';
    const mockUser = generateFakeUser({ email });

    it('should generate reset password token successfully', async () => {
      const resetToken = 'reset.password.token';

      userService.getUserByEmail.mockResolvedValue(mockUser);
      jwt.sign.mockReturnValue(resetToken);
      tokenModel.createToken.mockResolvedValue({ id: 1, token: resetToken });

      const result = await tokenService.generateResetPasswordToken(email);

      expect(userService.getUserByEmail).toHaveBeenCalledWith(email);
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: mockUser.id,
          type: tokenTypes.RESET_PASSWORD,
        }),
        expect.any(String)
      );
      expect(tokenModel.createToken).toHaveBeenCalledWith(
        mockUser.id,
        expect.any(String),
        tokenTypes.RESET_PASSWORD,
        resetToken,
        false
      );
      expect(result).toBe(resetToken);
    });

    it('should throw error if user not found', async () => {
      userService.getUserByEmail.mockResolvedValue(null);

      await expect(tokenService.generateResetPasswordToken(email)).rejects.toThrow(ApiError);
      await expect(tokenService.generateResetPasswordToken(email)).rejects.toThrow(
        'Bu e-posta adresi ile kayıtlı kullanıcı bulunamadı'
      );
    });
  });

  describe('generateVerifyEmailToken', () => {
    const mockUser = generateFakeUser();

    it('should generate verify email token successfully', async () => {
      const verifyToken = 'verify.email.token';

      jwt.sign.mockReturnValue(verifyToken);
      tokenModel.createToken.mockResolvedValue({ id: 1, token: verifyToken });

      const result = await tokenService.generateVerifyEmailToken(mockUser);

      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: mockUser.id,
          type: tokenTypes.VERIFY_EMAIL,
        }),
        expect.any(String)
      );
      expect(tokenModel.createToken).toHaveBeenCalledWith(
        mockUser.id,
        expect.any(String),
        tokenTypes.VERIFY_EMAIL,
        verifyToken,
        false
      );
      expect(result).toBe(verifyToken);
    });
  });

  describe('deleteToken', () => {
    const tokenId = 1;

    it('should delete token successfully', async () => {
      const mockTokenDoc = { id: tokenId, token: 'deleted.token' };
      tokenModel.deleteToken.mockResolvedValue(mockTokenDoc);

      const result = await tokenService.deleteToken(tokenId);

      expect(tokenModel.deleteToken).toHaveBeenCalledWith(tokenId);
      expect(result).toEqual(mockTokenDoc);
    });
  });

  describe('deleteTokens', () => {
    const userId = 1;

    it('should delete all tokens for user', async () => {
      const mockTokens = [
        { id: 1, token: 'token1', userId },
        { id: 2, token: 'token2', userId },
      ];
      tokenModel.deleteTokens.mockResolvedValue(mockTokens);

      const result = await tokenService.deleteTokens(userId);

      expect(tokenModel.deleteTokens).toHaveBeenCalledWith(userId, {});
      expect(result).toEqual(mockTokens);
    });

    it('should delete tokens with specific criteria', async () => {
      const whereParams = { type: tokenTypes.REFRESH };
      tokenModel.deleteTokens.mockResolvedValue([]);

      await tokenService.deleteTokens(userId, whereParams);

      expect(tokenModel.deleteTokens).toHaveBeenCalledWith(userId, whereParams);
    });

    it('should handle empty result', async () => {
      tokenModel.deleteTokens.mockResolvedValue([]);

      const result = await tokenService.deleteTokens(userId);

      expect(result).toEqual([]);
    });
  });
});
