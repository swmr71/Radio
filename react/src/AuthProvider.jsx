import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // 認証状態をチェック
    fetch('/auth/user')
      .then(res => res.json())
      .then(data => {
        if (data.authenticated) {
          setUser(data.user);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Auth check error:', err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const login = () => {
    window.location.href = '/auth/google';
  };

  const logout = () => {
    window.location.href = '/auth/logout';
  };

  const isAdmin = user?.role === 'admin';
  const isViewer = user?.role === 'viewer';
  const isAuthenticated = !!user;

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      error,
      login,
      logout,
      isAdmin,
      isViewer,
      isAuthenticated,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
