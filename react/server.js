import express from 'express';
import multer from 'multer';
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { AssemblyAI } from 'assemblyai';
import AdmZip from 'adm-zip';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import session from 'express-session';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3001;

// プロキシを許可
app.enable('trust proxy'); 

// ============ 認証設定 ============
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET || 'your-secret-key-change-this';
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

// ディレクトリ設定
const audioDir = path.join(__dirname, 'audio');
const uploadsDir = path.join(__dirname, 'uploads');
const dbPath = path.join(__dirname, 'episodes.db');

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
});

// ============ Express ミドルウェア設定 ============
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));
app.use('/uploads', express.static(uploadsDir));

// Session 設定
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
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

      // 💡 ワイルドカード（*）を判定するための関数
      const matchWildcard = (text, pattern) => {
        // * 以外の特殊文字をエスケープし、* を正規表現の「.*（任意の文字列）」に変換
        const regexStr = '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$';
        return new RegExp(regexStr, 'i').test(text); // 'i' をつけて大文字小文字を区別しない
      };

      // .includes の代わりに .some() を使ってワイルドカード対応の判定をする
      const isAdmin = ALLOWED_ADMIN_EMAILS.some(pattern => matchWildcard(email, pattern));
      const isViewer = ALLOWED_VIEWER_EMAILS.some(pattern => matchWildcard(email, pattern));

      if (isAdmin) {
        role = 'admin';
      } else if (!isViewer && ALLOWED_VIEWER_EMAILS.length > 0) {
        // viewer リストが設定されている場合、ホワイトリスト外は拒否
        return done(null, false, { message: 'Email not allowed' });
      }

      // ユーザーを DB に保存または更新
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
async function startTranscription(episodeId, filepath) {
  if (!aaiClient) return;

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
      text: u.text,
      start: u.start,
      end: u.end
    })) || [];

    db.run(
      'UPDATE episodes SET transcript = ?, transcriptStatus = ? WHERE id = ?',
      [JSON.stringify(utterances), 'completed', episodeId],
      (err) => {
        if (err) console.error('[Transcript] DB Update Error:', err.message);
        else console.log(`[Transcript] Successfully completed for episode ID: ${episodeId}`);
      }
    );

  } catch (error) {
    console.error(`[Transcript] Error on episode ID ${episodeId}:`, error.message);
    db.run('UPDATE episodes SET transcriptStatus = ? WHERE id = ?', ['failed', episodeId]);
  }
}

// ============ ストリーミング対応：Range Request ハンドラ ============
app.get('/audio/:filename', (req, res) => {
  const filename = req.params.filename;
  const filepath = path.join(audioDir, filename);

  if (!path.resolve(filepath).startsWith(path.resolve(audioDir))) {
    return res.status(403).json({ error: 'Access denied' });
  }

  fs.stat(filepath, (err, stats) => {
    if (err || !stats.isFile()) {
      return res.status(404).json({ error: 'File not found' });
    }

    const fileSize = stats.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize) {
        res.status(416).set('Content-Range', `bytes */${fileSize}`).end();
        return;
      }

      const chunksize = end - start + 1;

      res.status(206);
      res.set('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.set('Accept-Ranges', 'bytes');
      res.set('Content-Length', chunksize);
      res.set('Content-Type', 'audio/mpeg');
      
      fs.createReadStream(filepath, { start, end }).pipe(res);
    } else {
      res.set('Accept-Ranges', 'bytes');
      res.set('Content-Length', fileSize);
      res.set('Content-Type', 'audio/mpeg');
      
      fs.createReadStream(filepath).pipe(res);
    }
  });
});

// ============ API Endpoints ============

// GET /api/episodes - すべてのエピソード取得
app.get('/api/episodes', (req, res) => {
  db.all(
    'SELECT id, title, description, filename, uploadedAt, transcriptStatus, slideshowConfig FROM episodes ORDER BY uploadedAt DESC',
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      const parsedRows = rows.map(row => ({
        ...row,
        slideshowConfig: row.slideshowConfig ? JSON.parse(row.slideshowConfig) : null
      }));
      res.json(parsedRows);
    }
  );
});

// POST /api/upload - エピソードアップロード（管理者のみ）
app.post('/api/upload', isAdmin, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { title, description } = req.body;
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
      [title, description || '', audioFilename, slideshowConfig ? JSON.stringify(slideshowConfig) : null],
      function (err) {
        if (err) {
          const audioPath = path.join(audioDir, audioFilename);
          if (fs.existsSync(audioPath)) {
            fs.unlinkSync(audioPath);
          }
          return res.status(500).json({ error: err.message });
        }

        res.json({
          id: this.lastID,
          title,
          description,
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

// DELETE /api/episodes/:id - エピソード削除（管理者のみ）
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

      res.json({ message: 'Episode deleted' });
    });
  });
});

// GET /api/episodes/:id - 特定エピソード取得
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

      if (row.transcript) {
        try {
          row.transcript = JSON.parse(row.transcript);
        } catch (e) {
          row.transcript = [];
        }
      }

      if (row.slideshowConfig) {
        try {
          row.slideshowConfig = JSON.parse(row.slideshowConfig);
        } catch (e) {
          row.slideshowConfig = null;
        }
      }

      res.json(row);
    }
  );
});

// PATCH /api/episodes/:id - エピソード情報更新（管理者のみ）
app.patch('/api/episodes/:id', isAdmin, (req, res) => {
  const { id } = req.params;
  const { title, description } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  db.run(
    'UPDATE episodes SET title = ?, description = ? WHERE id = ?',
    [title, description || '', id],
    (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'Episode updated' });
    }
  );
});

// PUT /api/episodes/:id/transcript - 文字起こし編集（管理者のみ）
app.put('/api/episodes/:id/transcript', isAdmin, (req, res) => {
  const { id } = req.params;
  const { transcript } = req.body;

  if (!Array.isArray(transcript)) {
    return res.status(400).json({ error: 'Transcript must be an array' });
  }

  db.run(
    'UPDATE episodes SET transcript = ?, transcriptStatus = ? WHERE id = ?',
    [JSON.stringify(transcript), 'completed', id],
    (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'Transcript updated' });
    }
  );
});

// POST /api/episodes/:id/slideshow - スライドショー設定更新（管理者のみ）
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

// SPA用のフォールバック
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// エラーハンドリング
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: err.message });
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
