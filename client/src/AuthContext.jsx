import { createContext, useContext, useEffect, useState } from 'react';
import api from './api';
import { connectRealtime, disconnectRealtime } from './realtime';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('peerza_user'));
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem('peerza_token'));
  const [loading, setLoading] = useState(true);

  // Validate session on initial load
  useEffect(() => {
    let alive = true;
    const storedToken = localStorage.getItem('peerza_token');

    if (!storedToken) {
      setAuth(null);
      setToken(null);
      setLoading(false);
      return;
    }

    api
      .get('/auth/me')
      .then(({ data }) => {
        if (!alive) return;
        setAuth(data.user);
        setToken(storedToken);
        localStorage.setItem('peerza_user', JSON.stringify(data.user));
        connectRealtime();
      })
      .catch(() => {
        if (!alive) return;
        localStorage.removeItem('peerza_token');
        localStorage.removeItem('peerza_user');
        setAuth(null);
        setToken(null);
        disconnectRealtime();
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const login = (newToken, newUser) => {
    localStorage.setItem('peerza_token', newToken);
    localStorage.setItem('peerza_user', JSON.stringify(newUser));
    setToken(newToken);
    setAuth(newUser);
    connectRealtime();
  };

  const logout = () => {
    localStorage.removeItem('peerza_token');
    localStorage.removeItem('peerza_user');
    setToken(null);
    setAuth(null);
    try {
      disconnectRealtime();
    } catch {}
  };

  const onUserUpdated = (updatedUser) => {
    setAuth(updatedUser);
    localStorage.setItem('peerza_user', JSON.stringify(updatedUser));
  };

  return (
    <AuthContext.Provider value={{ auth, token, loading, login, logout, onUserUpdated }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
