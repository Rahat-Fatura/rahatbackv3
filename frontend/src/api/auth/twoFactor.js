import axios from "axios";
import axiosInstance from "../axiosInstance";

const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3000';

// Login with 2FA (no auth required)
export const loginWith2FA = (email, password, token) => {
  return axios.post(`${apiUrl}/v1/auth/login-2fa`, {
    email,
    password,
    token,
  });
};

// Get 2FA status (requires auth)
export const get2FAStatus = () => {
  return axiosInstance.get(`/v1/auth/2fa/status`);
};

// Generate 2FA secret and QR code (requires auth)
export const generate2FA = () => {
  return axiosInstance.post(`/v1/auth/2fa/generate`);
};

// Enable 2FA (requires auth)
export const enable2FA = (token) => {
  return axiosInstance.post(`/v1/auth/2fa/enable`, {
    token,
  });
};

// Verify 2FA token (requires auth)
export const verify2FA = (token) => {
  return axiosInstance.post(`/v1/auth/2fa/verify`, {
    token,
  });
};

// Disable 2FA (requires auth)
export const disable2FA = (token) => {
  return axiosInstance.post(`/v1/auth/2fa/disable`, {
    token,
  });
};
