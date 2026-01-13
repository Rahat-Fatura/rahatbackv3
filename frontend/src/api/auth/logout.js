/** @format */

import axiosInstance from "../axiosInstance";
import { cookies } from "../../utils/cookie/index";

export const logout = () => {
  // const refreshToken = cookies.get("jwt-refresh");

  // if (refreshToken) {
  //     axiosInstance.post(`/auth/logout`, {
  //         refreshToken,
  //     });
  // }

  cookies.remove("jwt-access", { path: "/" });
  cookies.remove("jwt-access-expires", { path: "/" });
  cookies.remove("jwt-refresh", { path: "/" });
  cookies.remove("jwt-refresh-expires", { path: "/" });

  console.log("Logged out - cookies cleared");
  window.location.href = "/login";
};
