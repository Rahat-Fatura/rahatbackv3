const httpStatus = require('http-status');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const tokenService = require('./token.service');
const userService = require('./user.service');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const { tokenTypes } = require('../config/tokens');
/**
 * Login with username and password
 * @param {string} email
 * @param {string} password
 * @returns {Promise<import("@prisma/client").User>}
 */
const loginUserWithEmailAndPassword = async (email, password) => {
  const user = await userService.getUserByEmail(email);
  if (!user || !(await userService.isPasswordMatch(password, user))) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Kullanıcı adı veya şifre hatalı');
  }
  return user;
};

/**
 * Logout
 * @param {string} refreshToken
 * @returns {Promise}
 */
const logout = async (refreshToken) => {
  const refreshTokenDoc = await tokenService.findToken({
    token: refreshToken,
    type: tokenTypes.REFRESH,
    blacklisted: false,
  });
  if (!refreshTokenDoc) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Böyle bir token bulunamadı');
  }
  await tokenService.deleteToken(refreshTokenDoc.id);
};

/**
 * Refresh auth tokens
 * @param {string} refreshToken
 * @returns {Promise<Object>}
 */
const refreshAuth = async (refreshToken) => {
  try {
    const refreshTokenDoc = await tokenService.verifyToken(refreshToken, tokenTypes.REFRESH);
    const user = await userService.getUserById(refreshTokenDoc.userId);
    if (!user) {
      throw new Error();
    }
    await tokenService.deleteToken(refreshTokenDoc.id);
    return tokenService.generateAuthTokens(user);
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Lütfen tekrar giriş yapın');
  }
};

/**
 * Reset password
 * @param {string} resetPasswordToken
 * @param {string} newPassword
 * @returns {Promise}
 */
const resetPassword = async (resetPasswordToken, newPassword) => {
  try {
    const resetPasswordTokenDoc = await tokenService.verifyToken(resetPasswordToken, tokenTypes.RESET_PASSWORD);
    const user = await userService.getUserById(resetPasswordTokenDoc.userId);
    if (!user) {
      throw new Error();
    }
    await userService.updateUserById(user.id, { password: newPassword });
    await tokenService.deleteTokens(user.id, { type: tokenTypes.RESET_PASSWORD });
  } catch (error) {
    logger.error(error);
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Şifre sıfırlama başarısız oldu');
  }
};

/**
 * Verify email
 * @param {string} verifyEmailToken
 * @returns {Promise}
 */
const verifyEmail = async (verifyEmailToken) => {
  try {
    const verifyEmailTokenDoc = await tokenService.verifyToken(verifyEmailToken, tokenTypes.VERIFY_EMAIL);
    const user = await userService.getUserById(verifyEmailTokenDoc.userId);
    if (!user) {
      throw new Error();
    }
    await tokenService.deleteTokens(user.id, { type: tokenTypes.VERIFY_EMAIL });
    await userService.updateUserById(user.id, { isEmailVerified: true });
  } catch (error) {
    logger.error(error);
    throw new ApiError(httpStatus.UNAUTHORIZED, 'e-Posta doğrulama başarısız oldu');
  }
};

/**
 * Generate 2FA secret for user
 * @param {number} userId
 * @returns {Promise<Object>}
 */
const generate2FASecret = async (userId) => {
  const user = await userService.getUserById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  // Generate secret
  const secret = speakeasy.generateSecret({
    name: `Rahat Backup (${user.email})`,
    issuer: 'Rahat Backup System',
  });

  // Generate QR code data URL
  const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

  // Save secret to user (but don't enable 2FA yet)
  await userService.updateUserById(userId, {
    twoFactorSecret: secret.base32,
  });

  return {
    secret: secret.base32,
    qrCode: qrCodeUrl,
    otpauthUrl: secret.otpauth_url,
  };
};

/**
 * Verify 2FA token and enable 2FA
 * @param {number} userId
 * @param {string} token
 * @returns {Promise<boolean>}
 */
const enable2FA = async (userId, token) => {
  const user = await userService.getUserById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  if (!user.twoFactorSecret) {
    throw new ApiError(httpStatus.BAD_REQUEST, '2FA secret not generated yet. Call generate first.');
  }

  // Verify the token
  const verified = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: 'base32',
    token: token,
    window: 2, // Allow 2 time steps before and after for clock drift
  });

  if (!verified) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid 2FA token');
  }

  // Enable 2FA
  await userService.updateUserById(userId, {
    twoFactorEnabled: true,
  });

  logger.info(`2FA enabled for user ${userId}`);
  return true;
};

/**
 * Verify 2FA token
 * @param {number} userId
 * @param {string} token
 * @returns {Promise<boolean>}
 */
const verify2FAToken = async (userId, token) => {
  const user = await userService.getUserById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  if (!user.twoFactorEnabled || !user.twoFactorSecret) {
    throw new ApiError(httpStatus.BAD_REQUEST, '2FA is not enabled for this user');
  }

  const verified = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: 'base32',
    token: token,
    window: 2,
  });

  if (!verified) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid 2FA token');
  }

  return true;
};

/**
 * Disable 2FA for user
 * @param {number} userId
 * @param {string} token - Current 2FA token for verification
 * @returns {Promise<boolean>}
 */
const disable2FA = async (userId, token) => {
  const user = await userService.getUserById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  if (!user.twoFactorEnabled) {
    throw new ApiError(httpStatus.BAD_REQUEST, '2FA is not enabled');
  }

  // Verify current token before disabling
  const verified = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: 'base32',
    token: token,
    window: 2,
  });

  if (!verified) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid 2FA token');
  }

  // Disable 2FA and clear secret
  await userService.updateUserById(userId, {
    twoFactorEnabled: false,
    twoFactorSecret: null,
  });

  logger.info(`2FA disabled for user ${userId}`);
  return true;
};

module.exports = {
  loginUserWithEmailAndPassword,
  logout,
  refreshAuth,
  resetPassword,
  verifyEmail,
  generate2FASecret,
  enable2FA,
  verify2FAToken,
  disable2FA,
};
