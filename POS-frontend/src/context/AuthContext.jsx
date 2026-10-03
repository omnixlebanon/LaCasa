import LoadingState from '../components/LoadingState.jsx';
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
    const update = event => {
      if (event.key !== 'auth_user') return;
      try { setUser(event.newValue ? JSON.parse(event.newValue) : null); }
      catch { setUser(null); }
    };
    window.addEventListener('storage', update);
    return () => window.removeEventListener('storage', update);
  }, []);

  useEffect(() => {
    if (window.location.pathname === '/POS/login') {
      setLoading(false);
      
      return;
    }
    
    let active = true;
    let checking = false;
    const checkSession = async () => {
      if (checking || !navigator.onLine) { if (active) setLoading(false); return; }
      checking = true;
      try {
        const res = await api.get('/api/auth/me', { withCredentials: true });
        if (!active) return;
        if (res.data.success) {
          setUser(res.data.user);
          localStorage.setItem('auth_user', JSON.stringify(res.data.user));
        } else {
          setUser(null);
          localStorage.removeItem('auth_user');
        }
      } catch (err) {
        // A connection failure does not invalidate the account's offline data.
        if (active && [401, 403, 404].includes(err.response?.status)) {
          setUser(null);
          localStorage.removeItem('auth_user');
        }
      } finally {
        checking = false;
        if (active) setLoading(false);
      }
    };
    void checkSession();
    window.addEventListener('online', checkSession);
    window.addEventListener('focus', checkSession);
    const timer = setInterval(checkSession, 60000);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('online', checkSession);
      window.removeEventListener('focus', checkSession);
    };
  }, []);

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
      {loading ? <LoadingState label="Loading your session..." /> : children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
