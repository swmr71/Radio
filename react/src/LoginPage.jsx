import React from 'react';
import { LogIn, Music } from 'lucide-react';
import { useAuth } from './AuthProvider';

export function LoginPage() {
  const { login } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 to-indigo-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full">
        <div className="flex justify-center mb-6">
          <div className="bg-indigo-100 p-4 rounded-full">
            <Music className="w-8 h-8 text-indigo-600" />
          </div>
        </div>
        
        <h1 className="text-3xl font-bold text-center text-gray-900 mb-2">
          超かぐや姫 ラジオ
        </h1>
        <p className="text-center text-gray-600 mb-8">
          Google アカウントでログインして楽しむ
        </p>

        <button
          onClick={login}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
        >
          <LogIn className="w-5 h-5" />
          Google でログイン
        </button>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <p className="text-sm text-gray-600 text-center">
            <strong>管理者アカウント：</strong> 全ての機能が利用可能
          </p>
          <p className="text-sm text-gray-600 text-center mt-2">
            <strong>一般ユーザー：</strong> 視聴・検索のみ
          </p>
        </div>
      </div>
    </div>
  );
}
