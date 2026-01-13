const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const { authService, userService, tokenService, emailService } = require('../services');

const register = catchAsync(async (req, res) => {
  const user = await userService.createUser(req.body);
  const tokens = await tokenService.generateAuthTokens(user);
  res.status(httpStatus.CREATED).send({ user, tokens });
});

const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const user = await authService.loginUserWithEmailAndPassword(email, password);

  // Check if 2FA is enabled
  if (user.twoFactorEnabled) {
    // Don't send tokens, just indicate 2FA is required
    return res.send({
      requires2FA: true,
      message: '2FA token required'
    });
  }

  const tokens = await tokenService.generateAuthTokens(user);
  res.send({ user, tokens });
});

const logout = catchAsync(async (req, res) => {
  await authService.logout(req.body.refreshToken);
  res.status(httpStatus.NO_CONTENT).send();
});

const refreshTokens = catchAsync(async (req, res) => {
  const tokens = await authService.refreshAuth(req.body.refreshToken);
  res.send({ ...tokens });
});

const forgotPassword = catchAsync(async (req, res) => {
  const resetPasswordToken = await tokenService.generateResetPasswordToken(req.body.email);
  logger.info(resetPasswordToken);
  await emailService.sendResetPasswordEmail(`${req.body.email} <${req.body.email}>`, resetPasswordToken);
  res.status(httpStatus.NO_CONTENT).send();
});

const resetPassword = catchAsync(async (req, res) => {
  await authService.resetPassword(req.query.token, req.body.password);
  res.status(httpStatus.NO_CONTENT).send();
});

const sendVerificationEmail = catchAsync(async (req, res) => {
  const verifyEmailToken = await tokenService.generateVerifyEmailToken(req.user);
  await emailService.sendVerificationEmail(req.user.email, verifyEmailToken);
  res.status(httpStatus.NO_CONTENT).send();
});

const verifyEmail = catchAsync(async (req, res) => {
  await authService.verifyEmail(req.query.token);
  res.status(httpStatus.NO_CONTENT).send();
});

const generate2FA = catchAsync(async (req, res) => {
  const result = await authService.generate2FASecret(req.user.id);
  res.send(result);
});

const enable2FA = catchAsync(async (req, res) => {
  const { token } = req.body;
  await authService.enable2FA(req.user.id, token);
  res.send({ message: '2FA enabled successfully' });
});

const verify2FA = catchAsync(async (req, res) => {
  const { token } = req.body;
  await authService.verify2FAToken(req.user.id, token);
  res.send({ message: '2FA token verified' });
});

const disable2FA = catchAsync(async (req, res) => {
  const { token } = req.body;
  await authService.disable2FA(req.user.id, token);
  res.send({ message: '2FA disabled successfully' });
});

const get2FAStatus = catchAsync(async (req, res) => {
  const user = await userService.getUserById(req.user.id);
  res.send({
    twoFactorEnabled: user.twoFactorEnabled,
    hasSecret: !!user.twoFactorSecret,
  });
});

const loginWith2FA = catchAsync(async (req, res) => {
  const { email, password, token } = req.body;

  // First verify email and password
  const user = await authService.loginUserWithEmailAndPassword(email, password);

  // Check if 2FA is enabled
  if (!user.twoFactorEnabled) {
    throw new ApiError(httpStatus.BAD_REQUEST, '2FA is not enabled for this user');
  }

  // Verify 2FA token
  await authService.verify2FAToken(user.id, token);

  // Generate and send tokens
  const tokens = await tokenService.generateAuthTokens(user);
  res.send({ user, tokens });
});

module.exports = {
  register,
  login,
  logout,
  refreshTokens,
  forgotPassword,
  resetPassword,
  sendVerificationEmail,
  verifyEmail,
  generate2FA,
  enable2FA,
  verify2FA,
  disable2FA,
  get2FAStatus,
  loginWith2FA,
};
