import express from 'express';
import multer from 'multer';
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3001;

// ディレクトリ設定
const audioDir = path.join(__dirname, 'audio');
const dbPath = path.join(__dirname, 'episodes.db');

// audioディレクトリが存在しない場合は作成
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
}

// multer設定
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
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid audio file type'));
    }
  },
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB
  },
});

// SQLite3設定
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS episodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      filename TEXT NOT NULL UNIQUE,
      uploadedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      duration INTEGER DEFAULT 0
    )
  `);
});

// ミドルウェア
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));
app.use('/audio', express.static(audioDir));

// ============ API Endpoints ============

// GET /api/episodes - すべてのエピソード取得
app.get('/api/episodes', (req, res) => {
  db.all(
    'SELECT id, title, description, filename, uploadedAt FROM episodes ORDER BY uploadedAt DESC',
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(rows);
    }
  );
});

// POST /api/upload - 音声ファイルアップロード
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { title, description } = req.body;

  if (!title) {
    fs.unlinkSync(path.join(audioDir, req.file.filename));
    return res.status(400).json({ error: 'Title is required' });
  }

  db.run(
    'INSERT INTO episodes (title, description, filename) VALUES (?, ?, ?)',
    [title, description || '', req.file.filename],
    function (err) {
      if (err) {
        fs.unlinkSync(path.join(audioDir, req.file.filename));
        return res.status(500).json({ error: err.message });
      }
      res.json({
        id: this.lastID,
        title,
        description,
        filename: req.file.filename,
        uploadedAt: new Date().toISOString(),
      });
    }
  );
});

// DELETE /api/episodes/:id - エピソード削除
app.delete('/api/episodes/:id', (req, res) => {
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

      // ファイルを削除
      fs.unlink(filePath, (unlinkErr) => {
        if (unlinkErr && unlinkErr.code !== 'ENOENT') {
          console.error('Failed to delete file:', unlinkErr);
        }
      });

      res.json({ message: 'Episode deleted' });
    });
  });
});

// GET /api/episodes/:id - 特定エピソードの情報取得
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
      res.json(row);
    }
  );
});

// SPA用のフォールバック（最後に配置）
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// エラーハンドリング
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: err.message });
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`📻 Radio server running on http://localhost:${PORT}`);
  console.log(`📁 Audio files stored in: ${audioDir}`);
  console.log(`💾 Database: ${dbPath}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  db.close();
  process.exit(0);
});