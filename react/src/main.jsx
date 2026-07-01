import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider, useAuth } from './AuthProvider';
import { LoginPage } from './LoginPage';
import RadioApp from './RadioApp';
import './index.css';

function AppWrapper() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-indigo-600 flex items-center justify-center">
        <div className="text-white text-xl">読み込み中...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return <RadioApp />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <AppWrapper />
    </AuthProvider>
  </React.StrictMode>
);
