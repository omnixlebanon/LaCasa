import axios from 'axios';
import { beginRequest } from './requestActivity.js';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8080' : ''),
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (config.method === 'get') config.finishLoading = beginRequest();
  return config;
});

api.interceptors.response.use(
  (response) => {
    response.config.finishLoading?.();
    return response;
  },
  (error) => {
    error.config?.finishLoading?.();
    if (error.response?.status === 401) {
      console.warn("Session expired or unauthorized. Redirecting to login...");
      
      localStorage.removeItem('token'); 
      window.location.href = '/POS/login'; 
    }
    return Promise.reject(error);
  }
);
export default api;
export const apiAssetUrl = path => path?.startsWith('/api/')
  ? `${(api.defaults.baseURL || '').replace(/\/$/, '')}${path}` : path;
