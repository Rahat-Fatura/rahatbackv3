// Mock dependencies FIRST before any imports
jest.mock('../../../src/services/user.service');
jest.mock('../../../src/services/token.service');
jest.mock('speakeasy');
jest.mock('qrcode');
jest.mock('../../../src/config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

// Import after mocks
const authService = require('../../../src/services/auth.service');
const userService = require('../../../src/services/user.service');
const tokenService = require('../../../src/services/token.service');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const ApiError = require('../../../src/utils/ApiError');
const { generateFakeUser } = require('../../utils/testHelpers');
const { tokenTypes } = require('../../../src/config/tokens');
const httpStatus = require('http-status');

describe('Auth Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loginUserWithEmailAndPassword', () => {
    const email = 'test@example.com';
    const password = 'password123';

    it('should login user successfully with correct credentials', async () => {
      const mockUser = generateFakeUser({ email, password: 'hashedPassword' });

      userService.getUserByEmail.mockResolvedValue(mockUser);
      userService.isPasswordMatch.mockResolvedValue(true);

      const result = await authService.loginUserWithEmailAndPassword(email, password);

      expect(userService.getUserByEmail).toHaveBeenCalledWith(email);
      expect(userService.isPasswordMatch).toHaveBeenCalledWith(password, mockUser);
      expect(result).toEqual(mockUser);
    });

    it('should throw error if user not found', async () => {
      userService.getUserByEmail.mockResolvedValue(null);

      await expect(authService.loginUserWithEmailAndPassword(email, password)).rejects.toThrow(ApiError);
      await expect(authService.loginUserWithEmailAndPassword(email, password)).rejects.toThrow('Kullanıcı adı veya şifre hatalı');
    });

    it('should throw error if password does not match', async () => {
      const mockUser = generateFakeUser({ email });

      userService.getUserByEmail.mockResolvedValue(mockUser);
      userService.isPasswordMatch.mockResolvedValue(false);

      await expect(authService.loginUserWithEmailAndPassword(email, password)).rejects.toThrow(ApiError);
      await expect(authService.loginUserWithEmailAndPassword(email, password)).rejects.toThrow('Kullanıcı adı veya şifre hatalı');
    });
  });

  describe('logout', () => {
    const refreshToken = 'valid-refresh-token';

    it('should logout user successfully', async () => {
      const mockTokenDoc = {
        id: 1,
        token: refreshToken,
        type: tokenTypes.REFRESH,
        blacklisted: false,
      };

      tokenService.findToken.mockResolvedValue(mockTokenDoc);
      tokenService.deleteToken.mockResolvedValue(true);

      await authService.logout(refreshToken);

      expect(tokenService.findToken).toHaveBeenCalledWith({
        token: refreshToken,
        type: tokenTypes.REFRESH,
        blacklisted: false,
      });
      expect(tokenService.deleteToken).toHaveBeenCalledWith(mockTokenDoc.id);
    });

    it('should throw error if refresh token not found', async () => {
      tokenService.findToken.mockResolvedValue(null);

      await expect(authService.logout(refreshToken)).rejects.toThrow(ApiError);
      await expect(authService.logout(refreshToken)).rejects.toThrow('Böyle bir token bulunamadı');
    });
  });

  describe('refreshAuth', () => {
    const refreshToken = 'valid-refresh-token';
    const userId = 1;

    it('should refresh auth tokens successfully', async () => {
      const mockUser = generateFakeUser({ id: userId });
      const mockTokenDoc = { id: 1, userId, token: refreshToken };
      const mockAuthTokens = {
        access: { token: 'new-access-token', expires: new Date() },
        refresh: { token: 'new-refresh-token', expires: new Date() },
      };

      tokenService.verifyToken.mockResolvedValue(mockTokenDoc);
      userService.getUserById.mockResolvedValue(mockUser);
      tokenService.deleteToken.mockResolvedValue(true);
      tokenService.generateAuthTokens.mockResolvedValue(mockAuthTokens);

      const result = await authService.refreshAuth(refreshToken);

      expect(tokenService.verifyToken).toHaveBeenCalledWith(refreshToken, tokenTypes.REFRESH);
      expect(userService.getUserById).toHaveBeenCalledWith(userId);
      expect(tokenService.deleteToken).toHaveBeenCalledWith(mockTokenDoc.id);
      expect(tokenService.generateAuthTokens).toHaveBeenCalledWith(mockUser);
      expect(result).toEqual(mockAuthTokens);
    });

    it('should throw error if token verification fails', async () => {
      tokenService.verifyToken.mockRejectedValue(new Error('Invalid token'));

      await expect(authService.refreshAuth(refreshToken)).rejects.toThrow(ApiError);
      await expect(authService.refreshAuth(refreshToken)).rejects.toThrow('Lütfen tekrar giriş yapın');
    });

    it('should throw error if user not found', async () => {
      const mockTokenDoc = { id: 1, userId, token: refreshToken };

      tokenService.verifyToken.mockResolvedValue(mockTokenDoc);
      userService.getUserById.mockResolvedValue(null);

      await expect(authService.refreshAuth(refreshToken)).rejects.toThrow(ApiError);
      await expect(authService.refreshAuth(refreshToken)).rejects.toThrow('Lütfen tekrar giriş yapın');
    });
  });

  describe('resetPassword', () => {
    const resetPasswordToken = 'reset-token';
    const newPassword = 'newPassword123';
    const userId = 1;

    it('should reset password successfully', async () => {
      const mockUser = generateFakeUser({ id: userId });
      const mockTokenDoc = { id: 1, userId, token: resetPasswordToken };

      tokenService.verifyToken.mockResolvedValue(mockTokenDoc);
      userService.getUserById.mockResolvedValue(mockUser);
      userService.updateUserById.mockResolvedValue(mockUser);
      tokenService.deleteTokens.mockResolvedValue(true);

      await authService.resetPassword(resetPasswordToken, newPassword);

      expect(tokenService.verifyToken).toHaveBeenCalledWith(resetPasswordToken, tokenTypes.RESET_PASSWORD);
      expect(userService.getUserById).toHaveBeenCalledWith(userId);
      expect(userService.updateUserById).toHaveBeenCalledWith(userId, { password: newPassword });
      expect(tokenService.deleteTokens).toHaveBeenCalledWith(userId, { type: tokenTypes.RESET_PASSWORD });
    });

    it('should throw error if token verification fails', async () => {
      tokenService.verifyToken.mockRejectedValue(new Error('Invalid token'));

      await expect(authService.resetPassword(resetPasswordToken, newPassword)).rejects.toThrow(ApiError);
      await expect(authService.resetPassword(resetPasswordToken, newPassword)).rejects.toThrow('Şifre sıfırlama başarısız oldu');
    });

    it('should throw error if user not found', async () => {
      const mockTokenDoc = { id: 1, userId, token: resetPasswordToken };

      tokenService.verifyToken.mockResolvedValue(mockTokenDoc);
      userService.getUserById.mockResolvedValue(null);

      await expect(authService.resetPassword(resetPasswordToken, newPassword)).rejects.toThrow(ApiError);
    });
  });

  describe('verifyEmail', () => {
    const verifyEmailToken = 'verify-email-token';
    const userId = 1;

    it('should verify email successfully', async () => {
      const mockUser = generateFakeUser({ id: userId, isEmailVerified: false });
      const mockTokenDoc = { id: 1, userId, token: verifyEmailToken };

      tokenService.verifyToken.mockResolvedValue(mockTokenDoc);
      userService.getUserById.mockResolvedValue(mockUser);
      tokenService.deleteTokens.mockResolvedValue(true);
      userService.updateUserById.mockResolvedValue({ ...mockUser, isEmailVerified: true });

      await authService.verifyEmail(verifyEmailToken);

      expect(tokenService.verifyToken).toHaveBeenCalledWith(verifyEmailToken, tokenTypes.VERIFY_EMAIL);
      expect(userService.getUserById).toHaveBeenCalledWith(userId);
      expect(tokenService.deleteTokens).toHaveBeenCalledWith(userId, { type: tokenTypes.VERIFY_EMAIL });
      expect(userService.updateUserById).toHaveBeenCalledWith(userId, { isEmailVerified: true });
    });

    it('should throw error if token verification fails', async () => {
      tokenService.verifyToken.mockRejectedValue(new Error('Invalid token'));

      await expect(authService.verifyEmail(verifyEmailToken)).rejects.toThrow(ApiError);
      await expect(authService.verifyEmail(verifyEmailToken)).rejects.toThrow('e-Posta doğrulama başarısız oldu');
    });

    it('should throw error if user not found', async () => {
      const mockTokenDoc = { id: 1, userId, token: verifyEmailToken };

      tokenService.verifyToken.mockResolvedValue(mockTokenDoc);
      userService.getUserById.mockResolvedValue(null);

      await expect(authService.verifyEmail(verifyEmailToken)).rejects.toThrow(ApiError);
    });
  });

  describe('generate2FASecret', () => {
    const userId = 1;

    it('should generate 2FA secret successfully', async () => {
      const mockUser = generateFakeUser({ id: userId, email: 'test@example.com' });
      const mockSecret = {
        base32: 'JBSWY3DPEHPK3PXP',
        otpauth_url: 'otpauth://totp/Rahat%20Backup%20(test@example.com)?secret=JBSWY3DPEHPK3PXP&issuer=Rahat%20Backup%20System',
      };
      const mockQRCode = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA';

      userService.getUserById.mockResolvedValue(mockUser);
      speakeasy.generateSecret.mockReturnValue(mockSecret);
      QRCode.toDataURL.mockResolvedValue(mockQRCode);
      userService.updateUserById.mockResolvedValue({ ...mockUser, twoFactorSecret: mockSecret.base32 });

      const result = await authService.generate2FASecret(userId);

      expect(userService.getUserById).toHaveBeenCalledWith(userId);
      expect(speakeasy.generateSecret).toHaveBeenCalledWith({
        name: `Rahat Backup (${mockUser.email})`,
        issuer: 'Rahat Backup System',
      });
      expect(QRCode.toDataURL).toHaveBeenCalledWith(mockSecret.otpauth_url);
      expect(userService.updateUserById).toHaveBeenCalledWith(userId, {
        twoFactorSecret: mockSecret.base32,
      });
      expect(result).toEqual({
        secret: mockSecret.base32,
        qrCode: mockQRCode,
        otpauthUrl: mockSecret.otpauth_url,
      });
    });

    it('should throw error if user not found', async () => {
      userService.getUserById.mockResolvedValue(null);

      await expect(authService.generate2FASecret(userId)).rejects.toThrow(ApiError);
      await expect(authService.generate2FASecret(userId)).rejects.toThrow('User not found');
    });
  });

  describe('enable2FA', () => {
    const userId = 1;
    const token = '123456';

    it('should enable 2FA successfully with valid token', async () => {
      const mockUser = generateFakeUser({
        id: userId,
        twoFactorSecret: 'JBSWY3DPEHPK3PXP',
        twoFactorEnabled: false,
      });

      userService.getUserById.mockResolvedValue(mockUser);
      speakeasy.totp.verify.mockReturnValue(true);
      userService.updateUserById.mockResolvedValue({ ...mockUser, twoFactorEnabled: true });

      const result = await authService.enable2FA(userId, token);

      expect(userService.getUserById).toHaveBeenCalledWith(userId);
      expect(speakeasy.totp.verify).toHaveBeenCalledWith({
        secret: mockUser.twoFactorSecret,
        encoding: 'base32',
        token: token,
        window: 2,
      });
      expect(userService.updateUserById).toHaveBeenCalledWith(userId, {
        twoFactorEnabled: true,
      });
      expect(result).toBe(true);
    });

    it('should throw error if user not found', async () => {
      userService.getUserById.mockResolvedValue(null);

      await expect(authService.enable2FA(userId, token)).rejects.toThrow(ApiError);
      await expect(authService.enable2FA(userId, token)).rejects.toThrow('User not found');
    });

    it('should throw error if 2FA secret not generated yet', async () => {
      const mockUser = generateFakeUser({ id: userId, twoFactorSecret: null });

      userService.getUserById.mockResolvedValue(mockUser);

      await expect(authService.enable2FA(userId, token)).rejects.toThrow(ApiError);
      await expect(authService.enable2FA(userId, token)).rejects.toThrow('2FA secret not generated yet');
    });

    it('should throw error if token is invalid', async () => {
      const mockUser = generateFakeUser({
        id: userId,
        twoFactorSecret: 'JBSWY3DPEHPK3PXP',
      });

      userService.getUserById.mockResolvedValue(mockUser);
      speakeasy.totp.verify.mockReturnValue(false);

      await expect(authService.enable2FA(userId, token)).rejects.toThrow(ApiError);
      await expect(authService.enable2FA(userId, token)).rejects.toThrow('Invalid 2FA token');
    });
  });

  describe('verify2FAToken', () => {
    const userId = 1;
    const token = '123456';

    it('should verify 2FA token successfully', async () => {
      const mockUser = generateFakeUser({
        id: userId,
        twoFactorSecret: 'JBSWY3DPEHPK3PXP',
        twoFactorEnabled: true,
      });

      userService.getUserById.mockResolvedValue(mockUser);
      speakeasy.totp.verify.mockReturnValue(true);

      const result = await authService.verify2FAToken(userId, token);

      expect(userService.getUserById).toHaveBeenCalledWith(userId);
      expect(speakeasy.totp.verify).toHaveBeenCalledWith({
        secret: mockUser.twoFactorSecret,
        encoding: 'base32',
        token: token,
        window: 2,
      });
      expect(result).toBe(true);
    });

    it('should throw error if user not found', async () => {
      userService.getUserById.mockResolvedValue(null);

      await expect(authService.verify2FAToken(userId, token)).rejects.toThrow(ApiError);
      await expect(authService.verify2FAToken(userId, token)).rejects.toThrow('User not found');
    });

    it('should throw error if 2FA is not enabled', async () => {
      const mockUser = generateFakeUser({
        id: userId,
        twoFactorEnabled: false,
        twoFactorSecret: null,
      });

      userService.getUserById.mockResolvedValue(mockUser);

      await expect(authService.verify2FAToken(userId, token)).rejects.toThrow(ApiError);
      await expect(authService.verify2FAToken(userId, token)).rejects.toThrow('2FA is not enabled for this user');
    });

    it('should throw error if token is invalid', async () => {
      const mockUser = generateFakeUser({
        id: userId,
        twoFactorSecret: 'JBSWY3DPEHPK3PXP',
        twoFactorEnabled: true,
      });

      userService.getUserById.mockResolvedValue(mockUser);
      speakeasy.totp.verify.mockReturnValue(false);

      await expect(authService.verify2FAToken(userId, token)).rejects.toThrow(ApiError);
      await expect(authService.verify2FAToken(userId, token)).rejects.toThrow('Invalid 2FA token');
    });
  });

  describe('disable2FA', () => {
    const userId = 1;
    const token = '123456';

    it('should disable 2FA successfully with valid token', async () => {
      const mockUser = generateFakeUser({
        id: userId,
        twoFactorSecret: 'JBSWY3DPEHPK3PXP',
        twoFactorEnabled: true,
      });

      userService.getUserById.mockResolvedValue(mockUser);
      speakeasy.totp.verify.mockReturnValue(true);
      userService.updateUserById.mockResolvedValue({
        ...mockUser,
        twoFactorEnabled: false,
        twoFactorSecret: null,
      });

      const result = await authService.disable2FA(userId, token);

      expect(userService.getUserById).toHaveBeenCalledWith(userId);
      expect(speakeasy.totp.verify).toHaveBeenCalledWith({
        secret: mockUser.twoFactorSecret,
        encoding: 'base32',
        token: token,
        window: 2,
      });
      expect(userService.updateUserById).toHaveBeenCalledWith(userId, {
        twoFactorEnabled: false,
        twoFactorSecret: null,
      });
      expect(result).toBe(true);
    });

    it('should throw error if user not found', async () => {
      userService.getUserById.mockResolvedValue(null);

      await expect(authService.disable2FA(userId, token)).rejects.toThrow(ApiError);
      await expect(authService.disable2FA(userId, token)).rejects.toThrow('User not found');
    });

    it('should throw error if 2FA is not enabled', async () => {
      const mockUser = generateFakeUser({
        id: userId,
        twoFactorEnabled: false,
      });

      userService.getUserById.mockResolvedValue(mockUser);

      await expect(authService.disable2FA(userId, token)).rejects.toThrow(ApiError);
      await expect(authService.disable2FA(userId, token)).rejects.toThrow('2FA is not enabled');
    });

    it('should throw error if token is invalid', async () => {
      const mockUser = generateFakeUser({
        id: userId,
        twoFactorSecret: 'JBSWY3DPEHPK3PXP',
        twoFactorEnabled: true,
      });

      userService.getUserById.mockResolvedValue(mockUser);
      speakeasy.totp.verify.mockReturnValue(false);

      await expect(authService.disable2FA(userId, token)).rejects.toThrow(ApiError);
      await expect(authService.disable2FA(userId, token)).rejects.toThrow('Invalid 2FA token');
    });
  });
});
