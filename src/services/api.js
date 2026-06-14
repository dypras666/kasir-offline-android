import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const Storage = Platform.OS === 'web' ? {
  getItemAsync: async (key) => localStorage.getItem(key),
  setItemAsync: async (key, val) => localStorage.setItem(key, String(val)),
  deleteItemAsync: async (key) => localStorage.removeItem(key),
} : SecureStore;

const API_URL = 'http://192.168.1.18:8085';

// Axios instance with auto JWT interceptor
const api = axios.create({ timeout: 10000 });

api.interceptors.request.use(async (config) => {
  try {
    const token = await Storage.getItemAsync('user_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (e) {
    // ignore
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      // Token expired — optionally trigger logout
      Storage.deleteItemAsync('user_token').catch(() => {});
      Storage.deleteItemAsync('user_data').catch(() => {});
    }
    return Promise.reject(error);
  }
);

export const getBaseUrl = async () => {
  const savedMode = await Storage.getItemAsync('server_mode');
  if (savedMode === 'local') {
    const savedIp = await Storage.getItemAsync('local_server_ip');
    return `http://${savedIp}`;
  }
  return API_URL;
};

export { api };

export const login = async (email, password) => {
  const baseUrl = await getBaseUrl();
  const response = await axios.post(`${baseUrl}/auth/login`, {
    email,
    password,
    device_name: Platform.OS === 'android' ? 'Android-Expo' : 'iOS-Expo',
  });
  return response.data;
};

export const saveAuthData = async (token, user, email, password) => {
  await Storage.setItemAsync('user_token', token);
  await Storage.setItemAsync('user_data', JSON.stringify(user));
  await Storage.setItemAsync('user_email', email);
  if (password) await Storage.setItemAsync('user_pass', password);
};

export const removeAuthData = async () => {
  await Storage.deleteItemAsync('user_token');
  await Storage.deleteItemAsync('user_data');
};
