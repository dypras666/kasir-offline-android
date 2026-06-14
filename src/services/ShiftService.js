import { api } from './api';

export const ShiftService = {
  getCurrentShift: async () => {
    try {
      const response = await api.get('/api/v1/shifts/current');
      return response.data?.data || response.data || null;
    } catch (error) {
      if (error?.response?.status === 404) {
        return null;
      }
      throw error;
    }
  },

  openShift: async ({ initial_cash, branch_id }) => {
    const response = await api.post('/api/v1/shifts/open', {
      initial_cash,
      branch_id,
    });
    return response.data?.data || response.data;
  },

  getCurrentShiftSummary: async () => {
    const response = await api.get('/api/v1/shifts/current/summary');
    return response.data?.data || response.data;
  },

  closeShift: async ({ actual_cash }) => {
    const response = await api.post('/api/v1/shifts/close', {
      actual_cash,
    });
    return response.data?.data || response.data;
  },

  getShiftHistory: async () => {
    const response = await api.get('/api/v1/shifts/history');
    return response.data?.data || response.data;
  },
};
