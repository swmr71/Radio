# Radio アプリ - 認証実装 FAQ / トラブルシューティング

## よくある質問

### Q1: Google ログイン画面が出ない（空白ページ）

**原因:** 環境変数が読み込まれていない

**解決策:**
```bash
# .env ファイルが存在するか確認
ls -la react/.env

# サーバーを再起動
npm run dev

# ターミナル出力で "dotenv loaded" 確認
# ない場合は Node.js の実行ディレクトリを確認
```

### Q2: "Unauthorized" エラーが返される

**原因:** API 呼び出しで認証されていない

**解決策:**
```javascript
// API 呼び出し時に以下を確認:
const res = await fetch('/api/upload', {
  method: 'POST',
  body: formData,
  // credentials を省略しても、同一オリジンなら Cookie は送信される
});
```

### Q3: Google OAuth コールバックで無限リダイレクト

**原因:** リダイレクト URI が一致していない

**解決策:**
1. Google Cloud Console でリダイレクト URI を確認
2. `http://localhost:3001/auth/google/callback` (開発環境)
3. `https://your-domain.com/auth/google/callback` (本番環境)

### Q4: 403 Forbidden エラー（管理者でも削除できない）

**原因:** ロール判定が正しくない

**解決策:**
```bash
# 環境変数を確認
cat react/.env | grep ALLOWED_ADMIN_EMAILS

# メールアドレスが一致しているか確認
# 例: admin@example.com (スペースなし)
```

### Q5: セッションが保持されない

**原因:** Cookie が有効になっていない

**解決策:**
```javascript
// server.js の cookie 設定を確認:
cookie: {
  secure: process.env.NODE_ENV === 'production',  // HTTPS のみ
  httpOnly: true,
  maxAge: 24 * 60 * 60 * 1000
}

// 開発環境で secure: false になっているか確認
```

### Q6: 複数のコンピュータでテストしたい

**原因:** localhost では他のマシンからアクセスできない

**解決策:**
```bash
# サーバーを 0.0.0.0 で起動（既に設定済み）
app.listen(PORT, '0.0.0.0')

# リダイレクト URI を IP アドレスで追加
# http://192.168.x.x:3001/auth/google/callback
```

---

## トラブルシューティング手順

### 1. ログファイルを確認

```bash
# サーバーログ（ターミナル）
npm run dev

# ブラウザのコンソール (F12)
# ネットワークタブで API 呼び出しを確認
```

### 2. データベースをリセット

```bash
# episodes.db を削除して再作成
rm react/episodes.db
npm run dev
```

### 3. キャッシュをクリア

```bash
# ブラウザ: Ctrl+Shift+Delete (Windows) / Cmd+Shift+Delete (Mac)
# または Hard Reload: Ctrl+F5 (Windows) / Cmd+Shift+R (Mac)
```

### 4. 環境変数を再確認

```bash
# Node.js が環境変数を読み込んでいるか確認
node -e "require('dotenv').config(); console.log(process.env.GOOGLE_CLIENT_ID)"

# 出力: xxxxx.apps.googleusercontent.com (正常)
# 出力: undefined (読み込み失敗)
```

---

## 本番環境への対応

### HTTPS 対応

```bash
# リバースプロキシ（Nginx）で HTTPS 化
# 例: Cloudflare Tunnel / オンプレミス Nginx

# リダイレクト URI を更新
GOOGLE_CLIENT_ID=xxxxx
GOOGLE_CLIENT_SECRET=xxxxx
# https://your-domain.com/auth/google/callback
```

### セッションの永続化

```bash
# 現在: メモリ内（サーバー再起動で消失）
# 対応: SQLite ストレージに永続化

npm install connect-sqlite3
```

server.js に以下を追加:
```javascript
import SqliteStore from 'connect-sqlite3';

const store = new SqliteStore({
  db: 'sessions.db',
  dir: './data'
});

app.use(session({
  store,
  // ... 既存の設定
}));
```

### ログレベルの制御

```bash
# 開発環境
NODE_ENV=development npm run dev

# 本番環境
NODE_ENV=production npm start
```

---

## 見た目のカスタマイズ

### ロゴ / テーマカラーを変更

**LoginPage.jsx:**
```jsx
<h1 className="text-3xl font-bold">
  超かぐや姫 ラジオ  {/* ここを変更 */}
</h1>

// 色を変更
className="from-indigo-600 to-indigo-800"  // indigo → 別の色に
// purple, blue, green, red など
```

**UserMenu.jsx:**
```jsx
className="bg-indigo-100 hover:bg-indigo-200 text-indigo-700"
// これらの色を統一して変更
```

### フォント・言語を変更

**index.html:**
```html
<html lang="ja">  <!-- 言語コード -->
  <head>
    <meta charset="UTF-8">
    <!-- フォント設定 -->
    <link href="https://fonts.googleapis.com/css2?family=Kiwi+Maru:wght@400;700&display=swap" rel="stylesheet">
  </head>
</html>
```

---

## セキュリティチェックリスト

- [ ] `.env` ファイルが `.gitignore` に含まれている
- [ ] `SESSION_SECRET` が強力なランダム文字列に変更されている
- [ ] 本番環境で `secure: true` が設定されている
- [ ] HTTPS が有効になっている
- [ ] `ALLOWED_ADMIN_EMAILS` に信頼できるメールアドレスのみを登録している
- [ ] メールアドレスのホワイトリスト（`ALLOWED_VIEWER_EMAILS`）を設定している

---

## パフォーマンス最適化

### キャッシング

```javascript
// API レスポンスをキャッシュ
const cache = new Map();

app.get('/api/episodes', (req, res) => {
  if (cache.has('episodes')) {
    return res.json(cache.get('episodes'));
  }
  
  db.all(..., (err, rows) => {
    cache.set('episodes', rows);
    res.json(rows);
  });
});
```

### クエリ最適化

```javascript
// インデックスを追加
db.run(`
  CREATE INDEX IF NOT EXISTS idx_episodes_uploadedAt
  ON episodes(uploadedAt DESC)
`);
```

---

## 今後の拡張案

- [ ] メール認証（パスワード認証）の追加
- [ ] ロール管理画面（管理者が他のユーザーをロール変更）
- [ ] ソーシャルログイン（GitHub, Discord など）
- [ ] 2FA（二段階認証）
- [ ] API トークン認証（外部 API 連携用）

