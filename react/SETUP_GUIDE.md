# Radio アプリ - Google OAuth 認証実装ガイド

## 概要

このガイドでは、Radio アプリに Google OAuth 2.0 認証と ロールベース権限管理（admin/viewer）を追加する手順を説明します。

## ファイル構成

```
react/
├── server.js                    # 認証ミドルウェア + API 統合版
├── package.json                # 認証ライブラリ追加版
├── .env.example                # 環境変数テンプレート
├── .env                         # 実際の設定（Git 無視）
├── src/
│   ├── main.jsx                # エントリーポイント（認証プロバイダー統合）
│   ├── AuthProvider.jsx        # 認証状態管理 Context
│   ├── LoginPage.jsx           # ログイン画面
│   ├── UserMenu.jsx            # ユーザーメニュー
│   ├── EditEpisodeModal.jsx    # エピソード編集画面
│   └── RadioApp.jsx            # メインアプリ（権限制御版に修正）
└── vite.config.js
```

## セットアップ手順

### 1. Google Cloud Console での OAuth 設定

1. [Google Cloud Console](https://console.cloud.google.com) にアクセス
2. **新しいプロジェクト** を作成 (例: "clusters-radio")
3. **OAuth 2.0 クライアント ID** を作成:
   - API ライブラリから「Google+ API」を有効化
   - 認証情報 → OAuth 同意画面を設定
   - 認可されたリダイレクト URI に以下を追加:
     ```
     http://localhost:3001/auth/google/callback
     https://your-domain.com/auth/google/callback  # 本番環境
     ```
4. クライアント ID とクライアント シークレットをコピー

### 2. 環境変数の設定

```bash
# プロジェクトルートで実行
cp .env.example .env
```

`.env` ファイルを編集:

```env
# Google OAuth 2.0 設定
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxxxxxxxxxxx

# セッション暗号化キー（任意の長い文字列）
SESSION_SECRET=super-secret-random-key-12345

# 管理者メールアドレス（カンマ区切り）
ALLOWED_ADMIN_EMAILS=your-email@example.com,admin@clusters-prj.com

# 視聴者メールアドレス（カンマ区切り）
# 空白の場合は全てのメールアドレスを許可
ALLOWED_VIEWER_EMAILS=

# AssemblyAI API キー
ASSEMBLYAI_API_KEY=your-assemblyai-key

# Node 環境
NODE_ENV=development
```

### 3. 依存パッケージをインストール

```bash
cd react
npm install
```

新しく追加されるパッケージ:
- `passport` - 認証ミドルウェア
- `passport-google-oauth20` - Google OAuth Strategy
- `express-session` - セッション管理
- `dotenv` - 環境変数管理

### 4. ファイル更新・統合

#### a) server.js を置き換え
```bash
cp /path/to/new/server.js react/server.js
```

#### b) 認証関連コンポーネントを追加
```bash
cp /path/to/AuthProvider.jsx react/src/
cp /path/to/LoginPage.jsx react/src/
cp /path/to/UserMenu.jsx react/src/
cp /path/to/EditEpisodeModal.jsx react/src/
```

#### c) main.jsx を置き換え（認証プロバイダー統合）
```bash
cp /path/to/main.jsx react/src/
```

#### d) RadioApp.jsx を修正（権限制御を統合）

以下の修正を手動で apply してください:

**インポート追加（先頭に）:**
```javascript
import { useAuth } from './AuthProvider';
import { UserMenu } from './UserMenu';
import { EditEpisodeModal } from './EditEpisodeModal';
```

**useState に以下を追加:**
```javascript
const [showEditModal, setShowEditModal] = useState(false);
const [editingEpisode, setEditingEpisode] = useState(null);
```

**useAuth フック を使用:**
```javascript
const { isAdmin, logout } = useAuth();
```

**アップロードエンドポイント (handleUpload) の修正:**
```javascript
const handleUpload = async () => {
  if (!isAdmin) {
    alert('管理者のみアップロード可能です');
    return;
  }
  // ... 既存のアップロード処理
};
```

**削除エンドポイント (handleDeleteEpisode) の修正:**
```javascript
const handleDeleteEpisode = async (id) => {
  if (!isAdmin) {
    alert('管理者のみ削除可能です');
    return;
  }
  // ... 既存の削除処理
};
```

**Sidebar にユーザーメニューを追加:**
```jsx
<div className="p-4 border-b border-gray-300 flex items-center justify-between">
  {sidebarOpen && <h1>RBSラジオ</h1>}
  <UserMenu />
</div>
```

**アップロード UI を管理者のみに制限:**
```jsx
{isAdmin && currentPage === 'upload' && (
  <div className="...">
    {/* アップロードUI */}
  </div>
)}
```

**エピソード一覧に編集・削除ボタンを追加:**
```jsx
{isAdmin && (
  <div className="flex gap-2">
    <button
      onClick={() => {
        setEditingEpisode(episode);
        setShowEditModal(true);
      }}
    >
      編集
    </button>
    <button onClick={() => handleDeleteEpisode(episode.id)}>
      削除
    </button>
  </div>
)}
```

**編集モーダルを追加:**
```jsx
{showEditModal && editingEpisode && (
  <EditEpisodeModal
    episode={editingEpisode}
    onClose={() => setShowEditModal(false)}
    onSave={() => {
      fetchEpisodes();
      setShowEditModal(false);
    }}
  />
)}
```

### 5. ビルド・実行

**開発モード:**
```bash
cd react
npm run dev
```

**本番ビルド:**
```bash
npm run build
NODE_ENV=production npm start
```

## 機能説明

### 認証フロー

1. ユーザーが初回アクセス → LoginPage（Google ログインボタン）
2. Google OAuth で認証 → `/auth/google/callback` でシリアライズ
3. `.env` の `ALLOWED_ADMIN_EMAILS` / `ALLOWED_VIEWER_EMAILS` でロール判定
4. セッションを作成して RadioApp に遷移

### ロール権限

| 機能 | Admin | Viewer |
|------|-------|--------|
| 再生・検索 | ✅ | ✅ |
| プレイリスト | ✅ | ✅ |
| ファイルアップロード | ✅ | ❌ |
| エピソード情報編集 | ✅ | ❌ |
| 文字起こし編集 | ✅ | ❌ |
| 画像・スライドショー編集 | ✅ | ❌ |
| エピソード削除 | ✅ | ❌ |

### API 権限制御

```
認証なし:
  GET /api/episodes
  GET /api/episodes/:id
  GET /audio/:filename

認証必須（isAuthenticated）:
  特になし（今後の拡張用）

管理者のみ（isAdmin）:
  POST /api/upload
  DELETE /api/episodes/:id
  PATCH /api/episodes/:id
  PUT /api/episodes/:id/transcript
  POST /api/episodes/:id/slideshow
```

## トラブルシューティング

### Google ログインが失敗する
- クライアント ID / シークレットが正しいか確認
- リダイレクト URI が一致しているか確認
- `.env` ファイルが正しく読み込まれているか確認（ターミナルに `dotenv loaded` と出ているか）

### セッションが保持されない
- `SESSION_SECRET` が設定されているか確認
- Cookie の secure フラグが本番環境で設定されているか確認

### 403 エラーが出る（権限なし）
- ログインメールが `ALLOWED_ADMIN_EMAILS` または `ALLOWED_VIEWER_EMAILS` に含まれているか確認
- `ALLOWED_VIEWER_EMAILS` が空の場合、全メールアドレスが許可されます

## その他

- `.env` ファイルは **Git に commit しないでください** (`.gitignore` に追加済みが望ましい)
- 本番環境では `NODE_ENV=production` と HTTPS を設定してください
- セッションを SQLite ストレージに永続化したい場合は `connect-sqlite3` を使用してください

