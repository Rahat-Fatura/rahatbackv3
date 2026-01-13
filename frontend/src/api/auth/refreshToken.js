// /** @format */

import axiosInstance from "../axiosInstance";
export const refreshToken = async (refreshToken) => {
  return await axiosInstance.post(`/auth/refresh-tokens`, {
    refreshToken,
  });
};
