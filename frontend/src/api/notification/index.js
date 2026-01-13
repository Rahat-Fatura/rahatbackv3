import axiosInstance from '../axiosInstance';

export const getNotificationSettings = async () => {
  const response = await axiosInstance.get('/v1/notifications');
  return response.data;
};

export const updateNotificationSettings = async (data) => {
  const response = await axiosInstance.patch('/v1/notifications', data);
  return response.data;
};

export const testEmail = async () => {
  const response = await axiosInstance.post('/v1/notifications/test-email');
  return response.data;
};
