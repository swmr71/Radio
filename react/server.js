import express from 'express';
import multer from 'multer';
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { AssemblyAI } from 'assemblyai';
import { GoogleGenAI } from '@google/genai'; // 💡 Google Gen AI SDKを追加
import AdmZip from 'adm-zip';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import session from 'express-session';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3001;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// プロキシを許可
app.enable('trust proxy'); 

// ============ 認証設定 ============
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
// 本番でシークレット未設定のまま起動すると、既知の固定値でセッションCookieを
// 偽造できてしまう（= 誰でも admin になりうる）。起動時に落とす。
if (IS_PRODUCTION && !process.env.SESSION_SECRET) {
  console.error('❌ FATAL: SESSION_SECRET must be set when NODE_ENV=production.');
  process.exit(1);
}
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-only-insecure-secret';
const ALLOWED_ADMIN_EMAILS = (process.env.ALLOWED_ADMIN_EMAILS || '').split(',').filter(Boolean);
const ALLOWED_VIEWER_EMAILS = (process.env.ALLOWED_VIEWER_EMAILS || '').split(',').filter(Boolean);

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.warn('⚠️ WARNING: Google OAuth credentials not set. Authentication will be disabled.');
}

// AssemblyAI初期化
const aaiApiKey = process.env.ASSEMBLYAI_API_KEY;
if (!aaiApiKey) {
  console.warn('⚠️ WARNING: ASSEMBLYAI_API_KEY is not set. Transcription will be skipped.');
}
const aaiClient = aaiApiKey ? new AssemblyAI({ apiKey: aaiApiKey }) : null;

// 💡 Google AI Studio (Gemini API / Gemma 4) 初期化
const geminiApiKey = process.env.GEMINI_API_KEY;
if (!geminiApiKey) {
  console.warn('⚠️ WARNING: GEMINI_API_KEY is not set. Gemma text refinement will be skipped.');
}
const geminiClient = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

// ディレクトリ設定
// 既定は ../../data（Docker では /data のボリューム）。ローカル開発など
// リポジトリ外に書き込みたくない場合は DATA_DIR で差し替えられる。
const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(__dirname, '../../data');

const audioDir = path.join(dataDir, 'audio');
const uploadsDir = path.join(dataDir, 'uploads');
const dbPath = path.join(dataDir, 'episodes.db');
const episodesDir = path.join(dataDir, 'episodes');

if (!fs.existsSync(episodesDir)) {
  fs.mkdirSync(episodesDir, { recursive: true });
}

if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
}

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// multer 設定
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, audioDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `episode-${timestamp}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const mimetype = file.mimetype;
    if (mimetype.startsWith('audio/') || mimetype === 'application/zip' || mimetype === 'application/x-zip-compressed') {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only audio files or ZIP archives are allowed.'));
    }
  },
  limits: {
    fileSize: 500 * 1024 * 1024,
  },
});

// SQLite3 設定
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS episodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      filename TEXT NOT NULL UNIQUE,
      uploadedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      duration INTEGER DEFAULT 0,
      transcript TEXT,
      transcriptStatus TEXT DEFAULT 'none',
      slideshowConfig TEXT
    )
  `);

  // セッション永続化テーブル（下の SQLiteSessionStore が使用）
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      expiresAt INTEGER NOT NULL
    )
  `);

  // ユーザー情報テーブル
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      googleId TEXT UNIQUE NOT NULL,
      email TEXT NOT NULL UNIQUE,
      displayName TEXT,
      role TEXT CHECK(role IN ('admin', 'viewer')) DEFAULT 'viewer',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 一覧は uploadedAt DESC で引くのでインデックスを張る
  db.run('CREATE INDEX IF NOT EXISTS idx_episodes_uploadedAt ON episodes (uploadedAt DESC)');
  db.run('CREATE INDEX IF NOT EXISTS idx_sessions_expiresAt ON sessions (expiresAt)');

  // 文字起こし中にプロセスが落ちると transcriptStatus が pending/processing のまま
  // 残り、フロントが永久に5秒ポーリングを続けてしまう。起動時に failed へ倒す。
  db.run(
    "UPDATE episodes SET transcriptStatus = 'failed' WHERE transcriptStatus IN ('pending', 'processing')",
    function (err) {
      if (err) {
        console.error('[Startup] Failed to reset stale transcript status:', err.message);
      } else if (this.changes > 0) {
        console.warn(`⚠️ Reset ${this.changes} interrupted transcription job(s) to "failed".`);
      }
    }
  );
});

// ============ Express ミドルウェア設定 ============
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));
app.use('/uploads', express.static(uploadsDir));

// ============ セッションストア（SQLite） ============
// 既定の MemoryStore はプロセス再起動で全セッションが消える。docker-compose 側が
// restart: always なので、コンテナが落ちるたび全員ログアウトになっていた。
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

class SQLiteSessionStore extends session.Store {
  constructor(database) {
    super();
    this.db = database;
    // 期限切れセッションの定期削除（1時間毎）
    this.cleanupTimer = setInterval(() => this.cleanup(), 60 * 60 * 1000);
    this.cleanupTimer.unref();
  }

  cleanup() {
    this.db.run('DELETE FROM sessions WHERE expiresAt <= ?', [Date.now()], (err) => {
      if (err) console.error('[Session] cleanup failed:', err.message);
    });
  }

  #expiry(sess) {
    const cookieExpires = sess?.cookie?.expires;
    if (cookieExpires) return new Date(cookieExpires).getTime();
    return Date.now() + SESSION_TTL_MS;
  }

  get(sid, callback) {
    this.db.get('SELECT data, expiresAt FROM sessions WHERE sid = ?', [sid], (err, row) => {
      if (err) return callback(err);
      if (!row) return callback(null, null);
      if (row.expiresAt <= Date.now()) {
        return this.destroy(sid, () => callback(null, null));
      }
      try {
        callback(null, JSON.parse(row.data));
      } catch (parseErr) {
        callback(parseErr);
      }
    });
  }

  set(sid, sess, callback = () => {}) {
    let data;
    try {
      data = JSON.stringify(sess);
    } catch (err) {
      return callback(err);
    }
    this.db.run(
      'INSERT INTO sessions (sid, data, expiresAt) VALUES (?, ?, ?) ' +
        'ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expiresAt = excluded.expiresAt',
      [sid, data, this.#expiry(sess)],
      callback
    );
  }

  touch(sid, sess, callback = () => {}) {
    this.db.run('UPDATE sessions SET expiresAt = ? WHERE sid = ?', [this.#expiry(sess), sid], callback);
  }

  destroy(sid, callback = () => {}) {
    this.db.run('DELETE FROM sessions WHERE sid = ?', [sid], callback);
  }

  length(callback) {
    this.db.get('SELECT COUNT(*) AS count FROM sessions WHERE expiresAt > ?', [Date.now()], (err, row) => {
      if (err) return callback(err);
      callback(null, row.count);
    });
  }

  clear(callback = () => {}) {
    this.db.run('DELETE FROM sessions', callback);
  }
}

const sessionStore = new SQLiteSessionStore(db);
sessionStore.cleanup();

// Session 設定
app.use(session({
  store: sessionStore,
  name: 'radio.sid',
  secret: SESSION_SECRET,
  resave: false,
  // 未ログインの訪問者ごとにセッションを作らない（メモリストアの肥大化を防ぐ）
  saveUninitialized: false,
  rolling: true,
  cookie: {
    secure: IS_PRODUCTION,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24時間
  }
}));

// Passport 初期化
app.use(passport.initialize());
app.use(passport.session());

// Google OAuth Strategy
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy(
    {
      clientID: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL: '/auth/google/callback',
      proxy: true,
    },
    async (accessToken, refreshToken, profile, done) => {
      const email = profile.emails[0].value;
      const displayName = profile.displayName;
      const googleId = profile.id;

      // ロール判定
      let role = 'viewer';

      // ワイルドカード（*）を判定するための関数
      const matchWildcard = (text, pattern) => {
        const regexStr = '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$';
        return new RegExp(regexStr, 'i').test(text);
      };

      const isAdmin = ALLOWED_ADMIN_EMAILS.some(pattern => matchWildcard(email, pattern));
      const isViewer = ALLOWED_VIEWER_EMAILS.some(pattern => matchWildcard(email, pattern));

      if (isAdmin) {
        role = 'admin';
      } else if (!isViewer && ALLOWED_VIEWER_EMAILS.length > 0) {
        return done(null, false, { message: 'Email not allowed' });
      }

      db.run(
        'INSERT OR REPLACE INTO users (googleId, email, displayName, role) VALUES (?, ?, ?, ?)',
        [googleId, email, displayName, role],
        function(err) {
          if (err) {
            return done(err);
          }
          const user = { googleId, email, displayName, role };
          done(null, user);
        }
      );
    }
  ));

  passport.serializeUser((user, done) => {
    done(null, user.googleId);
  });

  passport.deserializeUser((googleId, done) => {
    db.get('SELECT * FROM users WHERE googleId = ?', [googleId], (err, user) => {
      if (err) return done(err);
      done(null, user);
    });
  });
}

// ============ 認証ミドルウェア ============
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

const isAdmin = (req, res, next) => {
  if (req.isAuthenticated() && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Forbidden: Admin role required' });
  }
};

// ============ 利用時間制限ミドルウェア ============
const checkTimeRestriction = (req, res, next) => {
  const timeRange = process.env.ALLOWED_TIME_RANGE; 
  const restrictionMessage = process.env.RESTRICTED_MESSAGE || '現在はシステム利用時間外です。';

  if (!timeRange) {
    return next();
  }

  if (!req.path.startsWith('/api') && !req.path.startsWith('/audio')) {
    return next();
  }

  const now = new Date();
  const jstFormatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  });
  
  const parts = jstFormatter.formatToParts(now);
  const hour = Number(parts.find(p => p.type === 'hour').value);
  const minute = Number(parts.find(p => p.type === 'minute').value);

  const currentMinutes = hour * 60 + minute;

  const [startStr, endStr] = timeRange.split('-');
  const [startH, startM] = startStr.split(':').map(Number);
  const [endH, endM] = endStr.split(':').map(Number);

  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  let isAllowed = false;

  if (startMinutes <= endMinutes) {
    if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
      isAllowed = true;
    }
  } else {
    if (currentMinutes >= startMinutes || currentMinutes <= endMinutes) {
      isAllowed = true;
    }
  }

  if (!isAllowed) {
    return res.status(403).json({ 
      error: restrictionMessage, 
      isTimeRestricted: true 
    });
  }

  next();
};

app.use(checkTimeRestriction);

// ============ 認証エンドポイント ============
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    res.redirect('/');
  }
);

app.get('/auth/user', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({
      authenticated: true,
      user: {
        googleId: req.user.googleId,
        email: req.user.email,
        displayName: req.user.displayName,
        role: req.user.role,
      },
    });
  } else {
    res.json({ authenticated: false });
  }
});

app.get('/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.redirect('/');
  });
});

// ============ バックグラウンド文字起こし関数 ============
// 実行中のジョブ（同一エピソードの二重起動を防ぐ）
const runningTranscriptions = new Set();

async function startTranscription(episodeId, filepath) {
  if (!aaiClient) return;

  const key = String(episodeId);
  if (runningTranscriptions.has(key)) {
    console.warn(`[Transcript] Job for episode ${episodeId} is already running; skipped.`);
    return;
  }
  runningTranscriptions.add(key);

  db.run('UPDATE episodes SET transcriptStatus = ? WHERE id = ?', ['processing', episodeId]);
  console.log(`[Transcript] Started processing for episode ID: ${episodeId}`);

  try {
    const transcript = await aaiClient.transcripts.transcribe({
      audio: filepath,
      speaker_labels: true,
      language_code: 'ja',
    });

    const utterances = transcript.utterances?.map(u => ({
      speaker: u.speaker,
      text: u.text ? u.text.replace(/\s+/g, '') : '',
      start: u.start,
      end: u.end
    })) || [];

    if (geminiClient && utterances.length > 0) {
      console.log(`[Transcript] Total utterances found: ${utterances.length}. Starting Gemma refinement...`);

      const chunkSize = 30;
      const totalChunks = Math.ceil(utterances.length / chunkSize);

      for (let i = 0; i < utterances.length; i += chunkSize) {
        const currentChunkNum = Math.floor(i / chunkSize) + 1;
        console.log(`[Transcript] 🤖 Gemma Refinement: Processing chunk ${currentChunkNum} / ${totalChunks}...`);

        const chunk = utterances.slice(i, i + chunkSize);
        const inputData = chunk.map((u, index) => ({ id: i + index, text: u.text }));

        try {
          const response = await geminiClient.models.generateContent({
            model: 'gemma-4-26b-a4b-it',
            config: { responseMimeType: 'application/json' },
            contents: `以下のJSON配列に含まれる各オブジェクトの "text" を自然な日本語に修正してください。
- 配列構造、要素数、id は変更しない
- text だけ修正する
- 有効なJSONのみ返す

${JSON.stringify(inputData)}`
          });

          if (response?.text) {
            let jsonStr = response.text.trim();
            if (jsonStr.startsWith('```json')) {
              jsonStr = jsonStr.replace(/^```json/, '').replace(/```$/, '').trim();
            } else if (jsonStr.startsWith('```')) {
              jsonStr = jsonStr.replace(/^```/, '').replace(/```$/, '').trim();
            }

            const refinedChunk = JSON.parse(jsonStr);
            if (Array.isArray(refinedChunk)) {
              refinedChunk.forEach((item) => {
                if (item && typeof item.id === 'number' && utterances[item.id]) {
                  utterances[item.id].text = item.text || '';
                }
              });
            }
          }

          console.log(`[Transcript] ✅ Chunk ${currentChunkNum} / ${totalChunks} completed.`);
        } catch (geminiError) {
          console.error(`[Transcript] ❌ Gemma refinement failed for chunk ${currentChunkNum}:`, geminiError.message);
        }
      }
    }

    // transcript はファイル保存、DBはステータスのみ
    try {
      const transcriptPath = getTranscriptPath(episodeId);
      writeJsonAtomic(transcriptPath, utterances);

      db.run(
        'UPDATE episodes SET transcriptStatus = ? WHERE id = ?',
        ['completed', episodeId],
        (err) => {
          if (err) console.error('[Transcript] DB Update Error:', err.message);
          else console.log(`[Transcript] ✨ Successfully completed for episode ID: ${episodeId}`);
        }
      );
    } catch (fileErr) {
      console.error('[Transcript] File Save Error:', fileErr.message);
      db.run('UPDATE episodes SET transcriptStatus = ? WHERE id = ?', ['failed', episodeId]);
    }

  } catch (error) {
    console.error(`[Transcript] ❌ Global Error on episode ID ${episodeId}:`, error.message);
    db.run('UPDATE episodes SET transcriptStatus = ? WHERE id = ?', ['failed', episodeId]);
  } finally {
    runningTranscriptions.delete(key);
  }
}

// ============ ルートパラメータ検証 ============
// :id はエピソードの主キー（正の整数）のみ許可する。
// これを通さないと `..` などが getEpisodeDir() に渡り、data/episodes の外へ
// 書き込み・削除できてしまう。
app.param('id', (req, res, next, value) => {
  if (!/^[1-9]\d*$/.test(value)) {
    return res.status(400).json({ error: 'Invalid episode id' });
  }
  next();
});

// ============ ストリーミング対応：Range Request ハンドラ ============
const AUDIO_MIME_TYPES = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.aac': 'audio/aac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/opus',
  '.flac': 'audio/flac',
  '.webm': 'audio/webm',
};

app.get('/audio/:filename', (req, res) => {
  const filename = req.params.filename;
  const filepath = path.join(audioDir, filename);

  // path.relative() で比較する。startsWith() だけだと "…/audio-backup" のような
  // 兄弟ディレクトリが接頭辞一致で通ってしまう。
  const relative = path.relative(audioDir, filepath);
  if (relative.startsWith('..') || path.isAbsolute(relative) || relative.includes(path.sep)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const contentType = AUDIO_MIME_TYPES[path.extname(filename).toLowerCase()] || 'application/octet-stream';

  fs.stat(filepath, (err, stats) => {
    if (err || !stats.isFile()) {
      return res.status(404).json({ error: 'File not found' });
    }

    const fileSize = stats.size;
    const range = req.headers.range;

    res.set('Accept-Ranges', 'bytes');
    res.set('Content-Type', contentType);
    // 音声ファイルは内容不変（更新時は新しいファイル名になる）ため長期キャッシュ可
    res.set('Cache-Control', 'private, max-age=86400');
    res.set('Last-Modified', stats.mtime.toUTCString());

    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (!match || (!match[1] && !match[2])) {
        return res.status(416).set('Content-Range', `bytes */${fileSize}`).end();
      }

      let start;
      let end;
      if (match[1]) {
        start = parseInt(match[1], 10);
        end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
      } else {
        // suffix range: 末尾 N バイト
        start = Math.max(fileSize - parseInt(match[2], 10), 0);
        end = fileSize - 1;
      }

      end = Math.min(end, fileSize - 1);

      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= fileSize) {
        return res.status(416).set('Content-Range', `bytes */${fileSize}`).end();
      }

      res.status(206);
      res.set('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.set('Content-Length', end - start + 1);

      fs.createReadStream(filepath, { start, end }).pipe(res);
    } else {
      res.set('Content-Length', fileSize);

      fs.createReadStream(filepath).pipe(res);
    }
  });
});

// ============ API Endpoints ============

app.get('/api/episodes', (req, res) => {
  db.all(
    'SELECT id, title, description, filename, uploadedAt, transcriptStatus FROM episodes ORDER BY uploadedAt DESC',
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(rows);
    }
  );
});

app.post('/api/upload', isAdmin, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { title, description } = req.body;
  const descriptionMarkdown = typeof description === 'string' ? description : '';
  const descriptionPlain = stripMarkdown(descriptionMarkdown);
  const uploadedFilePath = path.join(audioDir, req.file.filename);
  const isZip = req.file.mimetype === 'application/zip' || req.file.mimetype === 'application/x-zip-compressed';

  if (!title) {
    fs.unlinkSync(uploadedFilePath);
    return res.status(400).json({ error: 'Title is required' });
  }

  try {
    let audioFilename = req.file.filename;
    let slideshowConfig = null;
    const episodeTimestamp = Date.now();

    if (isZip) {
      const { mp3File, jsonConfig, imageFiles } = extractZipAndGetConfig(uploadedFilePath);

      if (!mp3File) {
        fs.unlinkSync(uploadedFilePath);
        return res.status(400).json({ error: 'No MP3 file found in ZIP' });
      }

      audioFilename = `episode-${episodeTimestamp}.mp3`;
      const audioFilePath = path.join(audioDir, audioFilename);
      fs.writeFileSync(audioFilePath, mp3File.data);

      const imageMap = {};
      
      if (imageFiles.length > 0) {
        for (const imgFile of imageFiles) {
          const ext = path.extname(imgFile.originalName);
          const baseName = path.basename(imgFile.originalName, ext).replace(/[^a-z0-9_-]/gi, '_');
          const newImageFilename = `episode-${episodeTimestamp}-${baseName}${ext}`;
          const imagePath = path.join(uploadsDir, newImageFilename);
          const normalizedOriginalName = imgFile.originalName.replace(/\\/g, '/');
          const originalBaseName = path.basename(normalizedOriginalName);
          const publicPath = `/uploads/${newImageFilename}`;
          
          fs.writeFileSync(imagePath, imgFile.data);
          
          imageMap[normalizedOriginalName] = publicPath;
          imageMap[originalBaseName] = publicPath;
          imageMap[`./${originalBaseName}`] = publicPath;
          
          console.log(`[Upload] Image extracted: ${newImageFilename}`);
        }
      }

      if (jsonConfig) {
        slideshowConfig = normalizeSlideshowConfig(jsonConfig, imageMap);
        if (slideshowConfig) {
          console.log(`[Upload] Slideshow config loaded with ${slideshowConfig.length} slides`);
        }
      }

      fs.unlinkSync(uploadedFilePath);
      console.log(`[Upload] ZIP extracted: ${audioFilename}`);
    }

    db.run(
      "INSERT INTO episodes (title, description, filename, transcriptStatus, slideshowConfig) VALUES (?, ?, ?, 'pending', ?)",
      [title, descriptionPlain, audioFilename, slideshowConfig ? JSON.stringify(slideshowConfig) : null],
      function (err) {
        if (err) {
          const audioPath = path.join(audioDir, audioFilename);
          if (fs.existsSync(audioPath)) {
            fs.unlinkSync(audioPath);
          }
          return res.status(500).json({ error: err.message });
        }

        // meta.json 保存（Markdownソース保持）
        try {
          ensureEpisodeDir(this.lastID);
          writeJsonAtomic(getMetaPath(this.lastID), {
            title,
            descriptionMarkdown,
            descriptionPlain,
            updatedAt: new Date().toISOString()
          });
        } catch (metaErr) {
          console.error('[Upload] meta.json save failed:', metaErr.message);
        }

        res.json({
          id: this.lastID,
          title,
          description: descriptionPlain,
          descriptionMarkdown,
          filename: audioFilename,
          uploadedAt: new Date().toISOString(),
          transcriptStatus: 'pending',
          slideshowConfig: slideshowConfig || null
        });

        if (aaiClient) {
          const audioFilePath = path.join(audioDir, audioFilename);
          startTranscription(this.lastID, audioFilePath);
        }
      }
    );
  } catch (error) {
    console.error('Upload error:', error.message);
    if (fs.existsSync(uploadedFilePath)) {
      fs.unlinkSync(uploadedFilePath);
    }
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/episodes/:id', isAdmin, (req, res) => {
  const { id } = req.params;

  db.get('SELECT filename FROM episodes WHERE id = ?', [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Episode not found' });
    }

    const filePath = path.join(audioDir, row.filename);

    db.run('DELETE FROM episodes WHERE id = ?', [id], (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      fs.unlink(filePath, (unlinkErr) => {
        if (unlinkErr && unlinkErr.code !== 'ENOENT') {
          console.error('Failed to delete file:', unlinkErr);
        }
      });

      // 追加: エピソード個別データ削除
      try {
        fs.rmSync(getEpisodeDir(id), { recursive: true, force: true });
      } catch (rmErr) {
        console.error('Failed to delete episode dir:', rmErr.message);
      }

      res.json({ message: 'Episode deleted' });
    });
  });
});

app.get('/api/episodes/:id', (req, res) => {
  const { id } = req.params;

  db.get(
    'SELECT * FROM episodes WHERE id = ?',
    [id],
    (err, row) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (!row) {
        return res.status(404).json({ error: 'Episode not found' });
      }

      if (row.slideshowConfig) {
        try {
          row.slideshowConfig = JSON.parse(row.slideshowConfig);
        } catch (e) {
          row.slideshowConfig = null;
        }
      }

      const meta = readJsonSafe(getMetaPath(id), null);
      const transcript = readJsonSafe(getTranscriptPath(id), []);

      const merged = {
        ...row,
        title: meta?.title ?? row.title,
        description: meta?.descriptionPlain ?? row.description,
        descriptionMarkdown: meta?.descriptionMarkdown ?? row.description ?? '',
        transcript
      };

      res.json(merged);
    }
  );
});

app.patch('/api/episodes/:id', isAdmin, (req, res) => {
  const { id } = req.params;
  const { title, description } = req.body; // description はMarkdownソースとして扱う

  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  const descriptionMarkdown = typeof description === 'string' ? description : '';
  const descriptionPlain = stripMarkdown(descriptionMarkdown);

  db.run(
    'UPDATE episodes SET title = ?, description = ? WHERE id = ?',
    [title, descriptionPlain, id],
    (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      try {
        ensureEpisodeDir(id);
        const prev = readJsonSafe(getMetaPath(id), {}) || {};
        writeJsonAtomic(getMetaPath(id), {
          ...prev,
          title,
          descriptionMarkdown,
          descriptionPlain,
          updatedAt: new Date().toISOString()
        });
      } catch (metaErr) {
        console.error('[PATCH] meta.json save failed:', metaErr.message);
      }

      res.json({ message: 'Episode updated' });
    }
  );
});

app.put('/api/episodes/:id/transcript', isAdmin, (req, res) => {
  const { id } = req.params;
  const { transcript } = req.body;

  if (!Array.isArray(transcript)) {
    return res.status(400).json({ error: 'Transcript must be an array' });
  }

  try {
    ensureEpisodeDir(id);
    writeJsonAtomic(getTranscriptPath(id), transcript);
  } catch (fileErr) {
    return res.status(500).json({ error: fileErr.message });
  }

  db.run(
    'UPDATE episodes SET transcriptStatus = ? WHERE id = ?',
    ['completed', id],
    (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'Transcript updated' });
    }
  );
});

// 文字起こしのやり直し（API障害やプロセス再起動で failed になったエピソード用）
app.post('/api/episodes/:id/transcribe', isAdmin, (req, res) => {
  const { id } = req.params;

  if (!aaiClient) {
    return res.status(503).json({ error: 'ASSEMBLYAI_API_KEY が未設定のため文字起こしを実行できません' });
  }

  db.get('SELECT filename, transcriptStatus FROM episodes WHERE id = ?', [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Episode not found' });
    }
    if (row.transcriptStatus === 'processing' || runningTranscriptions.has(String(id))) {
      return res.status(409).json({ error: '既に文字起こし処理中です' });
    }

    const audioFilePath = path.join(audioDir, row.filename);
    if (!fs.existsSync(audioFilePath)) {
      return res.status(404).json({ error: '音声ファイルが見つかりません' });
    }

    db.run('UPDATE episodes SET transcriptStatus = ? WHERE id = ?', ['pending', id], (updateErr) => {
      if (updateErr) {
        return res.status(500).json({ error: updateErr.message });
      }
      res.json({ message: 'Transcription restarted', transcriptStatus: 'pending' });
      startTranscription(id, audioFilePath);
    });
  });
});

app.post('/api/episodes/:id/slideshow', isAdmin, (req, res) => {
  const { id } = req.params;
  const { slideshowConfig } = req.body;

  db.run(
    'UPDATE episodes SET slideshowConfig = ? WHERE id = ?',
    [slideshowConfig ? JSON.stringify(slideshowConfig) : null, id],
    (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'Slideshow config updated' });
    }
  );
});

function getEpisodeDir(id) {
  const safeId = String(id);
  if (!/^[1-9]\d*$/.test(safeId)) {
    throw new Error(`Invalid episode id: ${safeId}`);
  }
  return path.join(episodesDir, safeId);
}

function getMetaPath(id) {
  return path.join(getEpisodeDir(id), 'meta.json');
}

function getTranscriptPath(id) {
  return path.join(getEpisodeDir(id), 'transcript.json');
}

function ensureEpisodeDir(id) {
  const dir = getEpisodeDir(id);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath, value) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.tmp-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf-8');
  fs.renameSync(tmp, filePath);
}

// 軽量なMarkdown→プレーン変換（一覧キャッシュ用）
function stripMarkdown(md = '') {
  return String(md)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~]/g, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============ ユーティリティ関数 ============
function extractZipAndGetConfig(zipFilePath) {
  try {
    const zip = new AdmZip(zipFilePath);
    const entries = zip.getEntries();

    let mp3File = null;
    let jsonConfig = null;
    const imageFiles = [];

    for (const entry of entries) {
      const filename = entry.name.toLowerCase();
      
      if (filename.endsWith('.mp3') && !mp3File) {
        mp3File = {
          name: entry.name,
          data: entry.getData()
        };
      }
      else if (filename.endsWith('.json') && !jsonConfig) {
        try {
          jsonConfig = JSON.parse(entry.getData().toString('utf-8'));
        } catch (e) {
          console.warn('Failed to parse JSON from ZIP:', e.message);
        }
      }
      else if (
        !entry.isDirectory &&
        (filename.endsWith('.jpg') ||
          filename.endsWith('.jpeg') ||
          filename.endsWith('.png') ||
          filename.endsWith('.gif') ||
          filename.endsWith('.webp'))
      ) {
        imageFiles.push({
          originalName: entry.name,
          data: entry.getData()
        });
      }
    }

    return { mp3File, jsonConfig, imageFiles };
  } catch (error) {
    console.error('ZIP extraction error:', error.message);
    throw error;
  }
}

function normalizeSlideshowConfig(rawConfig, imageMap) {
  const slides = Array.isArray(rawConfig)
    ? rawConfig
    : Array.isArray(rawConfig?.slides)
    ? rawConfig.slides
    : rawConfig && typeof rawConfig === 'object'
    ? [rawConfig]
    : null;

  if (!slides) return null;

  const imageMapEntries = Object.entries(imageMap);

  const resolveImagePath = (imageRef) => {
    if (typeof imageRef !== 'string' || !imageRef.trim()) {
      return null;
    }

    const normalized = imageRef.replace(/\\/g, '/').trim();
    const baseName = path.basename(normalized);
    const candidates = [normalized, baseName, `./${baseName}`];

    for (const key of candidates) {
      if (imageMap[key]) {
        return imageMap[key];
      }
    }

    const lowered = normalized.toLowerCase();
    for (const [key, mappedPath] of imageMapEntries) {
      if (key.toLowerCase() === lowered) {
        return mappedPath;
      }
    }

    return normalized;
  };

  return slides.map((slide) => ({
    ...slide,
    image: resolveImagePath(slide.image ?? slide.imagePath ?? slide.src ?? slide.url),
  }));
}

// API/認証系の未定義ルートは SPA の index.html ではなく JSON 404 を返す
// （fetch 側が HTML を JSON.parse して意味不明なエラーになるのを防ぐ）
app.use(['/api', '/auth', '/audio', '/uploads'], (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// SPA用のフォールバック
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// エラーハンドリング
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  let status = err.status || err.statusCode || 500;
  let message = err.message;

  // multer のエラーをクライアントが解釈できるステータスへ変換する
  if (err instanceof multer.MulterError) {
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'ファイルサイズが上限（500MB）を超えています';
    }
  } else if (/Invalid file type/.test(message || '')) {
    status = 400;
  }

  console.error(`Error: ${req.method} ${req.originalUrl} -> ${status}: ${err.message}`);

  // 500 系の詳細（スタックやパス）はクライアントへ出さない
  if (status >= 500 && IS_PRODUCTION) {
    message = 'Internal server error';
  }

  res.status(status).json({ error: message });
});

// サーバー起動
app.listen(PORT, '0.0.0.0', () => {
  console.log(`📻 Radio server running on port ${PORT} (0.0.0.0)`);
  console.log(`📁 Audio files stored in: ${audioDir}`);
  console.log(`💾 Database: ${dbPath}`);
  console.log(`🔐 Google OAuth: ${GOOGLE_CLIENT_ID ? 'Enabled' : 'Disabled'}`);
});

process.on('SIGINT', () => {
  console.log('Shutting down...');
  db.close();
  process.exit(0);
});
