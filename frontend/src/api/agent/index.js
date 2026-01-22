import axiosInstance from '../axiosInstance';

export const getAgents = async (filters = {}) => {
  const response = await axiosInstance.get('/v1/agents', { params: filters });
  return response.data;
};

export const getAgentStats = async () => {
  const response = await axiosInstance.get('/v1/agents/stats');
  return response.data;
};

export const hasOnlineAgent = async () => {
  try {
    const agents = await getAgents({ status: 'online' });
    return agents && agents.length > 0;
  } catch (error) {
    return false;
  }
};
