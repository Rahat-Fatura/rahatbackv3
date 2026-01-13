import axiosInstance from '../axiosInstance';

export const getDatabases = async (filters = {}) => {
  const response = await axiosInstance.get('/v1/databases', { params: filters });
  return response.data;
};

export const getDatabaseById = async (id) => {
  const response = await axiosInstance.get(`/v1/databases/${id}`);
  return response.data;
};

export const createDatabase = async (data) => {
  const response = await axiosInstance.post('/v1/databases', data);
  return response.data;
};

export const updateDatabase = async (id, data) => {
  const response = await axiosInstance.patch(`/v1/databases/${id}`, data);
  return response.data;
};

export const deleteDatabase = async (id) => {
  const response = await axiosInstance.delete(`/v1/databases/${id}`);
  return response.data;
};

export const testConnection = async (id) => {
  const response = await axiosInstance.post(`/v1/databases/${id}/test`);
  return response.data;
};

export const testConnectionWithCredentials = async (data) => {
  const response = await axiosInstance.post('/v1/databases/test-connection', data);
  return response.data;
};

export const getDatabaseSize = async (id) => {
  const response = await axiosInstance.get(`/v1/databases/${id}/size`);
  return response.data;
};
