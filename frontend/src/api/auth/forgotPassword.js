/** @format */

import axiosInstance from "../axiosInstance";

export const forgotPassword = (email) => {
  return axiosInstance.post(`/auth/forgot-password`, {
    email,
  });
};
