import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8080' : ''),
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response, 
  (error) => {
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
