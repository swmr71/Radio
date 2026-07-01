import React, { useState } from 'react';
import { LogOut, User, Shield } from 'lucide-react';
import { useAuth } from './AuthProvider';

export function UserMenu() {
  const { user, logout, isAdmin } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  if (!user) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-700 transition-colors"
        title={`${user.displayName} (${user.role})`}
      >
        <User className="w-5 h-5" />
        <span className="text-sm font-medium">{user.displayName}</span>
        {isAdmin && <Shield className="w-4 h-4 text-indigo-600" />}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg p-4 z-50">
          <div className="mb-4">
            <p className="text-sm text-gray-600">メールアドレス</p>
            <p className="text-sm font-medium text-gray-900">{user.email}</p>
          </div>
          
          <div className="mb-4">
            <p className="text-sm text-gray-600">ロール</p>
            <div className="flex items-center gap-2">
              {isAdmin ? (
                <>
                  <Shield className="w-4 h-4 text-red-500" />
                  <span className="text-sm font-medium text-red-600">管理者</span>
                </>
              ) : (
                <span className="text-sm font-medium text-green-600">一般ユーザー</span>
              )}
            </div>
          </div>

          {isAdmin && (
            <div className="mb-4 p-3 bg-red-50 rounded">
              <p className="text-xs text-red-700">
                管理者権限が有効です。編集・削除・アップロードが可能です。
              </p>
            </div>
          )}

          <button
            onClick={() => {
              setIsOpen(false);
              logout();
            }}
            className="w-full flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 px-4 rounded transition-colors"
          >
            <LogOut className="w-4 h-4" />
            ログアウト
          </button>
        </div>
      )}
    </div>
  );
}
