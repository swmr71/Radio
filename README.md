# Radio

オンデマンドラジオサイト。音声をアップロードすると AI が自動で文字起こし（話者分離つき）を行い、
再生位置に追従するトランスクリプトとスライドショー付きで聴けます。Google アカウントでログインした
許可済みユーザーだけがアクセスできます。

## 主な機能

| 機能 | 説明 |
| --- | --- |
| 音声配信 | Range リクエスト対応のストリーミング。シーク・途中再生に対応 |
| 続きから再生 | エピソードごとの再生位置をブラウザに保存し、次回そこから再開 |
| AI 文字起こし | AssemblyAI で話者分離つきに変換し、Gemini で日本語を整形 |
| トランスクリプト追従 | 再生位置に合わせて自動スクロール。クリックでその位置へシーク |
| 発言の全文検索 | 文字起こしを横断検索し、一致した発言からその場で再生 |
| スライドショー | ZIP に画像 + JSON を同梱すると、再生時刻に合わせて画像を切り替え |
| プレイリスト / お気に入り | ブラウザローカルに保存 |
| メディアキー対応 | ロック画面・イヤホン・キーボードのメディアキーから操作可能 |
| 権限管理 | admin（アップロード・編集・削除）と viewer（再生のみ） |
| 利用時間制限 | 指定した時間帯の外では API と音声配信を停止 |

## 構成

```
Radio/
├── Dockerfile              # 2ステージビルド（Vite ビルド → 本番依存のみの実行イメージ）
├── docker-compose.yml
├── .env.example            # 環境変数のテンプレート
└── react/
    ├── server.js           # Express バックエンド（API・認証・文字起こしジョブ）
    ├── vite.config.js
    ├── index.html
    └── src/                # React フロントエンド
        ├── main.jsx
        ├── AuthProvider.jsx
        ├── LoginPage.jsx
        ├── RadioApp.jsx        # メインUI（一覧・プレイヤー・アップロード）
        ├── EditEpisodeModal.jsx
        ├── SlideshowDisplay.jsx
        └── usePersistedState.js
```

データは**リポジトリの外**（Docker では `/data` ボリューム）に置かれます:

```
data/
├── episodes.db             # SQLite（エピソードのメタ情報・ユーザー・セッション）
├── audio/                  # アップロードされた音声ファイル
├── uploads/                # ZIP から展開したスライド画像
└── episodes/<id>/
    ├── meta.json           # タイトルと説明（Markdownソース）
    └── transcript.json     # 文字起こし結果
```

保存先は `DATA_DIR` 環境変数で変更できます。

## セットアップ

### 1. 環境変数

```bash
cp .env.example .env
```

`.env` を編集します。最低限 `SESSION_SECRET`、`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、
`ALLOWED_ADMIN_EMAILS` が必要です。各項目の意味は `.env.example` のコメントを参照してください。

`SESSION_SECRET` の生成:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 2. Docker で起動（本番）

```bash
docker compose up -d --build
```

`http://<ホスト>:3301` で公開されます。Google OAuth の「承認済みのリダイレクト URI」には
`https://<公開ドメイン>/auth/google/callback` を登録してください。

状態の確認:

```bash
docker compose ps
```

`healthy` になれば `/api/health` が応答しています。

### 3. ローカル開発

```bash
cd react
npm install
npm run build
node server.js
```

`http://localhost:3001` を開きます。**OAuth 未設定かつ `NODE_ENV` が `production` でない場合**、
ログインを省略して管理者として動作します（`NODE_ENV=production` では自動的に無効化されます）。

フロントエンドをホットリロードで開発する場合は、ターミナルを2つ使います:

```bash
node server.js   # ターミナル1: API（3001番）
npm run dev      # ターミナル2: Vite（3000番、/api と /audio を3001へプロキシ）
```

## キーボードショートカット

| キー | 動作 |
| --- | --- |
| `Space` | 再生 / 一時停止 |
| `←` / `→` | 10秒 戻る / 進む |
| `N` / `P` | 次 / 前のエピソード |
| `Esc` | 拡張プレイヤーを閉じる |

入力欄にフォーカスがあるときは無効になります。

## API

すべて Cookie セッションによる認証が必要です。

| メソッド | パス | 権限 | 説明 |
| --- | --- | --- | --- |
| GET | `/api/health` | 誰でも | ヘルスチェック（利用時間制限の対象外） |
| GET | `/api/time-status` | 誰でも | 現在が利用可能時間内か（同上） |
| GET | `/api/episodes` | ログイン | エピソード一覧 |
| GET | `/api/search?q=` | ログイン | 文字起こしの全文検索（2文字以上） |
| GET | `/api/episodes/:id` | ログイン | 詳細（文字起こし・スライド設定を含む） |
| GET | `/audio/:filename` | ログイン | 音声ストリーミング（Range 対応） |
| POST | `/api/upload` | admin | 音声または ZIP のアップロード（最大500MB） |
| PATCH | `/api/episodes/:id` | admin | タイトル・説明の更新 |
| DELETE | `/api/episodes/:id` | admin | エピソードと関連ファイルの削除 |
| PUT | `/api/episodes/:id/transcript` | admin | 文字起こしの手動修正 |
| POST | `/api/episodes/:id/transcribe` | admin | 文字起こしのやり直し |
| POST | `/api/episodes/:id/slideshow` | admin | スライド設定の更新 |

## スライドショー付き ZIP の形式

ZIP に以下を入れてアップロードします（ファイル名は自由）:

- `.mp3` ファイル 1つ … 音声本体
- `.json` ファイル 1つ … スライド設定
- 画像ファイル … `.jpg` `.jpeg` `.png` `.gif` `.webp`

JSON は配列、または `{ "slides": [...] }` の形式です:

```json
[
  { "start": 0,  "image": "cover.png",    "caption": "オープニング" },
  { "start": 65, "image": "chapter1.png" }
]
```

| キー | 必須 | 説明 |
| --- | --- | --- |
| `image` | ✅ | ZIP 内のファイル名（`./name.png` のような相対パスも可）。アップロード時にサーバー側の公開パスへ書き換えられます |
| `start` | | 表示開始時刻。省略時は 0 |
| `end` | | 表示終了時刻。**省略時は次のスライドが始まるまで**（最後のスライドは終端まで） |
| `caption` | | 画像下部に重ねて表示する説明文 |

時刻は秒でもミリ秒でも構いません。設定全体の最大値が音声の長さ以下なら秒、
それを超えていればミリ秒として解釈されます。

## ライセンス

[MIT](LICENSE)
