import { createContext, useState, useEffect, useContext } from 'react';
import api from '/src/api.js';
const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const localUser = localStorage.getItem('auth_user');
    try {
      return localUser ? JSON.parse(localUser) : null
    } catch (error) {
      return null
    }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      setLoading(false);
      return;
    }
    if (window.location.pathname === '/POS/login') {
      setLoading(false);
      
      return;
    }
    
    const checkSession = async () => {
      try {
        const res = await api.get('/api/auth/me', { withCredentials: true });
        if (res.data.success) {
          setUser(res.data.user);
          localStorage.setItem('auth_user', JSON.stringify(res.data.user));
        } else {
          setUser(null);
          localStorage.removeItem('auth_user');
        }
      } catch (err) {
        setUser(null);
        localStorage.removeItem('auth_user');
      } finally {
        setLoading(false);
      }
    };
    checkSession();
  }, [user]);

  const login = async (username, password) => {
    try {
      const res = await api.post('/api/auth/login', { username, password }, { withCredentials: true });
      if (res.data.success) {
        setUser(res.data.user);
        localStorage.setItem('auth_user', JSON.stringify(res.data.user));
        return { success: true };
      }
    } catch (err) {
      return {
        success: false,
        message: err.response?.data?.message || "Something went wrong"
      };
    }
  };


  const logout = async () => {
    try {
      await api.post('/api/auth/logout', {}, { withCredentials: true });
    } catch (err) {
      console.error("Logout network request failed", err);
    } finally {
      setUser(null);
      localStorage.removeItem('auth_user');
      document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    }
  };


  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
