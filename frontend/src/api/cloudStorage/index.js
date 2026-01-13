import axiosInstance from '../axiosInstance';

// Cloud Storage CRUD
export const getCloudStorages = async (filters = {}) => {
  const response = await axiosInstance.get('/v1/cloud-storage', { params: filters });
  return response.data;
};

export const getCloudStorageById = async (id) => {
  const response = await axiosInstance.get(`/v1/cloud-storage/${id}`);
  return response.data;
};

export const createCloudStorage = async (data) => {
  const response = await axiosInstance.post('/v1/cloud-storage', data);
  return response.data;
};

export const updateCloudStorage = async (id, data) => {
  const response = await axiosInstance.patch(`/v1/cloud-storage/${id}`, data);
  return response.data;
};

export const deleteCloudStorage = async (id) => {
  const response = await axiosInstance.delete(`/v1/cloud-storage/${id}`);
  return response.data;
};

export const testConnection = async (id) => {
  const response = await axiosInstance.post(`/v1/cloud-storage/${id}/test`);
  return response.data;
};

export const setAsDefault = async (id) => {
  const response = await axiosInstance.post(`/v1/cloud-storage/${id}/set-default`);
  return response.data;
};

export const listFiles = async (id) => {
  const response = await axiosInstance.get(`/v1/cloud-storage/${id}/files`);
  return response.data;
};

// Google Drive OAuth
export const getGoogleDriveAuthUrl = async () => {
  const response = await axiosInstance.get('/v1/cloud-storage/google-drive/auth-url');
  return response.data;
};

export const googleDriveCallback = async (code) => {
  const response = await axiosInstance.get('/v1/cloud-storage/google-drive/callback', {
    params: { code },
  });
  return response.data;
};
