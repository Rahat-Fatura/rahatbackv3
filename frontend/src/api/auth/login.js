/** @format */

import axios from "axios";

export const login = (email, password) => {
  // Login için axiosInstance kullanma çünkü zaten token yok
  const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3000';
  console.log('API URL:', apiUrl);
  console.log('Login attempt:', email);
  return axios.post(`${apiUrl}/v1/auth/login`, {
    email,
    password,
  });
};
// export const login = (email, password) => {
//     // return axiosInstance.post(`/auth/login`, {
//     //     email,
//     //     password,
//     // });
//     return new Promise((resolve,reject)=>setTimeout(resolve({
//         data:{tokens:{
//             access:{
//                 token:"eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNzIxNzQwODQwLCJleHAiOjE3MjE3NDQ0NDB9.oPgxCSa_odc2ZnlltEwfI3ozLzxh69qOVSdZBwPEWDM",expires:1721732440
//             }, //Giriş
//             refresh  :{
//                 token:"eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwicm9sZSI6InVzZXIiLCJpYXQiOjE3MjE3Mjg4NDAsImV4cCI6MTcyMTczMjQ0MH0.NCeqvyHm_3lBwMdfhDhouuc1UNaGndP0wcmYVXLSmEU",
//                 expires:1721732440
//             }
//         }}

//     }),2000))
// };
