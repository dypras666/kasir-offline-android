import { create } from 'zustand';
import { Storage } from '../services/api';

export const useAuthStore = create((set, get) => ({
  user: null,
  token: null,
  isLoggedIn: false,
  isLoading: true,

  initAuth: async () => {
    try {
      const token = await Storage.getItemAsync('user_token');
      const userStr = await Storage.getItemAsync('user_data');
      if (token && userStr) {
        set({ user: JSON.parse(userStr), token, isLoggedIn: true, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch (e) {
      set({ isLoading: false });
    }
  },

  setAuth: async (user, token, email, password) => {
    try {
      await Storage.setItemAsync('user_token', token);
      await Storage.setItemAsync('user_data', JSON.stringify(user));
      if (email) await Storage.setItemAsync('user_email', email);
      if (password) await Storage.setItemAsync('user_pass', password);
      set({ user, token, isLoggedIn: true });
    } catch (e) {
      console.error('Save auth failed', e);
    }
  },

  logout: async () => {
    try {
      await Storage.deleteItemAsync('user_token');
      await Storage.deleteItemAsync('user_data');
      set({ user: null, token: null, isLoggedIn: false });
    } catch (e) {
      console.error('Logout failed', e);
    }
  }
}));
