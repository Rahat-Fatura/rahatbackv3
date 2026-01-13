import axiosInstance from '../axiosInstance';

// Backup Jobs
export const getBackupJobs = async (filters = {}) => {
  const response = await axiosInstance.get('/v1/backups/jobs', { params: filters });
  return response.data;
};

export const getBackupJobById = async (id) => {
  const response = await axiosInstance.get(`/v1/backups/jobs/${id}`);
  return response.data;
};

export const createBackupJob = async (data) => {
  const response = await axiosInstance.post('/v1/backups/jobs', data);
  return response.data;
};

export const updateBackupJob = async (id, data) => {
  const response = await axiosInstance.patch(`/v1/backups/jobs/${id}`, data);
  return response.data;
};

export const deleteBackupJob = async (id) => {
  const response = await axiosInstance.delete(`/v1/backups/jobs/${id}`);
  return response.data;
};

export const runBackupJob = async (id) => {
  const response = await axiosInstance.post(`/v1/backups/jobs/${id}/run`);
  return response.data;
};

// Backup History
export const getBackupHistory = async (filters = {}) => {
  const response = await axiosInstance.get('/v1/backups/history', { params: filters });
  return response.data;
};

export const getBackupHistoryById = async (id) => {
  const response = await axiosInstance.get(`/v1/backups/history/${id}`);
  return response.data;
};

export const downloadBackup = async (id) => {
  const response = await axiosInstance.get(`/v1/backups/history/${id}/download`, {
    responseType: 'blob',
  });
  return response.data;
};

export const deleteBackup = async (id) => {
  const response = await axiosInstance.delete(`/v1/backups/history/${id}`);
  return response.data;
};

export const restoreBackup = async (id) => {
  const response = await axiosInstance.post(`/v1/backups/history/${id}/restore`);
  return response.data;
};

export const getBackupStats = async () => {
  const response = await axiosInstance.get('/v1/backups/stats');
  return response.data;
};

export const verifyBackup = async (id, verificationLevel = 'BASIC') => {
  const response = await axiosInstance.post(`/v1/backups/history/${id}/verify`, {
    verificationLevel,
  });
  return response.data;
};
