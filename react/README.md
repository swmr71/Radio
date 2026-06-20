# オンデマンドラジオ - セットアップガイド

## ファイル構成

```
your-project/
├── package.json          # 依存関係
├── vite.config.js       # Viteの設定
├── index.html           # HTMLエントリーポイント
├── server.js            # Node.js/Expressバックエンド
├── src/
│   ├── main.jsx         # Reactエントリーポイント
│   └── RadioApp.jsx     # メインUIコンポーネント
├── audio/               # アップロード音声ファイル格納（自動生成）
├── episodes.db          # SQLiteデータベース（自動生成）
└── dist/                # ビルド済みフロントエンド（npm run buildで生成）
```

## セットアップ手順

### 1. 依存関係をインストール

```bash
npm install
```

### 2. フロントエンドをビルド（本番用）

```bash
npm run build
```

### 3. サーバーを起動

```bash
npm start
```

または開発モード（ファイル監視対応）：

```bash
npm run dev
```

## 開発時の推奨セットアップ

開発時は**2つのターミナル**で実行：

**ターミナル1（フロント開発サーバー）:**
```bash
npm install
npx vite
```

**ターミナル2（バックエンドサーバー）:**
```bash
npm run dev
```

その後、`http://localhost:5173` (Viteのデフォルトポート) にアクセス。

## API エンドポイント

### GET /api/episodes
すべてのエピソードを取得
```json
[
  {
    "id": 1,
    "title": "第1話 - はじめてのエピソード",
    "description": "初めてのエピソード説明",
    "filename": "episode-1234567890.mp3",
    "uploadedAt": "2024-01-15T10:30:00Z"
  }
]
```

### POST /api/upload
音声ファイルをアップロード

**Request (form-data):**
- `file` (file) - 音声ファイル（MP3, WAV, OGGなど）
- `title` (string) - エピソードのタイトル
- `description` (string) - エピソード説明（任意）

**Response:**
```json
{
  "id": 1,
  "title": "新しいエピソード",
  "description": "説明",
  "filename": "episode-1234567890.mp3",
  "uploadedAt": "2024-01-15T10:30:00Z"
}
```

### GET /api/episodes/:id
特定のエピソード情報を取得

### DELETE /api/episodes/:id
エピソードを削除（ファイルも自動削除）

## 機能

- ✅ **音声ファイルアップロード** - MP3, WAV, OGG, MP4などをサポート
- ✅ **エピソード管理** - タイトルと説明を設定
- ✅ **再生機能** - ブラウザ内での音声再生
- ✅ **削除機能** - エピソード削除時にファイルも自動削除
- ✅ **一覧表示** - アップロード順（新着順）に表示
- ✅ **プレイヤーUI** - 専用プレイヤーウィジェット

## トラブルシューティング

### audioディレクトリのパーミッションエラー
```bash
chmod -R 755 audio/
```

### SQLiteエラーが出る場合
```bash
rm episodes.db  # DBを削除して再作成
```

### ポートが既に使用されている場合
```javascript
// server.js内の PORT 番号を変更
const PORT = 3001;  // 別のポート番号に変更
```

## 拡張可能性

今後追加できる機能：
- ユーザー認証（JWT）
- エピソードへのコメント機能
- 再生履歴・続きから再生
- ユーザー別のプレイリスト
- メタデータ編集（アップロード後の編集）
- オーディオビジュアライザー
- 字幕・トランスクリプト対応

## ライセンス

MIT
