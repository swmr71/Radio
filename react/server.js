import express from 'express';
import multer from 'multer';
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { AssemblyAI } from 'assemblyai'; // 追加

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3001;

// AssemblyAIの初期化
const aaiApiKey = process.env.ASSEMBLYAI_API_KEY;
if (!aaiApiKey) {
  console.warn('⚠️ WARNING: ASSEMBLYAI_API_KEY is not set. Transcription will be skipped.');
}
const aaiClient = aaiApiKey ? new AssemblyAI({ apiKey: aaiApiKey }) : null;

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

// カラム追加（transcript, transcript_status）
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
      transcriptStatus TEXT DEFAULT 'none'
    )
  `);
});

// ミドルウェア
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

// ============ バックグラウンド文字起こし関数 ============
async function startTranscription(episodeId, filepath) {
  if (!aaiClient) return;

  // ステータスを「処理中」に更新
  db.run('UPDATE episodes SET transcriptStatus = ? WHERE id = ?', ['processing', episodeId]);
  console.log(`[Transcript] Started processing for episode ID: ${episodeId}`);

  try {
    const transcript = await aaiClient.transcripts.transcribe({
      audio: filepath,
      speaker_labels: true, // 話者分離を有効化
      language_code: 'ja',  // 日本語に指定
    });

    // フロントエンドで扱いやすいように話者データを整形
    const utterances = transcript.utterances?.map(u => ({
      speaker: u.speaker,
      text: u.text,
      start: u.start, // ミリ秒
      end: u.end      // ミリ秒
    })) || [];

    // 結果をJSON文字列としてDBに保存
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

// GET /api/episodes - すべてのエピソード取得（ステータスも返す）
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

// POST /api/upload - 音声ファイルアップロード＆文字起こしキック
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { title, description } = req.body;
  const filePath = path.join(audioDir, req.file.filename);

  if (!title) {
    fs.unlinkSync(filePath);
    return res.status(400).json({ error: 'Title is required' });
  }

  db.run(
    "INSERT INTO episodes (title, description, filename, transcriptStatus) VALUES (?, ?, ?, 'pending')",
    [title, description || '', req.file.filename],
    function (err) {
      if (err) {
        fs.unlinkSync(filePath);
        return res.status(500).json({ error: err.message });
      }

      // クライアントには即座にレスポンスを返す
      res.json({
        id: this.lastID,
        title,
        description,
        filename: req.file.filename,
        uploadedAt: new Date().toISOString(),
        transcriptStatus: 'pending'
      });

      // バックグラウンドで文字起こし処理を開始（非同期）
      if (aaiClient) {
        startTranscription(this.lastID, filePath);
      }
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

      fs.unlink(filePath, (unlinkErr) => {
        if (unlinkErr && unlinkErr.code !== 'ENOENT') {
          console.error('Failed to delete file:', unlinkErr);
        }
      });

      res.json({ message: 'Episode deleted' });
    });
  });
});

// GET /api/episodes/:id - 特定エピソードの情報取得（文字起こし本文も含む）
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

      // 保存されたJSON文字列をオブジェクトにパースして返す
      if (row.transcript) {
        try {
          row.transcript = JSON.parse(row.transcript);
        } catch (e) {
          row.transcript = [];
        }
      }
      res.json(row);
    }
  );
});

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
});

process.on('SIGINT', () => {
  console.log('Shutting down...');
  db.close();
  process.exit(0);
});
