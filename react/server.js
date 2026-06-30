import express from 'express';
import multer from 'multer';
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { AssemblyAI } from 'assemblyai'; // 追加
import AdmZip from 'adm-zip'; // ZIP 解凍用

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
const uploadsDir = path.join(__dirname, 'uploads');
const dbPath = path.join(__dirname, 'episodes.db');

// audioディレクトリが存在しない場合は作成
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
}

// uploadsディレクトリが存在しない場合は作成
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// multer設定（ZIP と音声ファイル両対応）
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
    // 音声ファイルまたは ZIP を許可
    if (mimetype.startsWith('audio/') || mimetype === 'application/zip' || mimetype === 'application/x-zip-compressed') {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only audio files or ZIP archives are allowed.'));
    }
  },
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB
  },
});

// SQLite3設定
const db = new sqlite3.Database(dbPath);

// カラム追加（transcript, transcript_status, slideshow_config）
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
});

// ミドルウェア
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));
app.use('/uploads', express.static(uploadsDir));

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
    'SELECT id, title, description, filename, uploadedAt, transcriptStatus, slideshowConfig FROM episodes ORDER BY uploadedAt DESC',
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      // slideshowConfig を JSON にパース
      const parsedRows = rows.map(row => ({
        ...row,
        slideshowConfig: row.slideshowConfig ? JSON.parse(row.slideshowConfig) : null
      }));
      res.json(parsedRows);
    }
  );
});

// ============ ZIP 解凍＋MP3+画像+JSON抽出ユーティリティ ============
function extractZipAndGetConfig(zipFilePath) {
  try {
    const zip = new AdmZip(zipFilePath);
    const entries = zip.getEntries();

    let mp3File = null;
    let jsonConfig = null;
    const imageFiles = []; // 画像ファイルのリスト

    for (const entry of entries) {
      const filename = entry.name.toLowerCase();
      
      // MP3 ファイル
      if (filename.endsWith('.mp3') && !mp3File) {
        mp3File = {
          name: entry.name,
          data: entry.getData()
        };
      }
      // JSON 設定ファイル
      else if (filename.endsWith('.json') && !jsonConfig) {
        try {
          jsonConfig = JSON.parse(entry.getData().toString('utf-8'));
        } catch (e) {
          console.warn('Failed to parse JSON from ZIP:', e.message);
        }
      }
      // 画像ファイル
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

// POST /api/upload - 音声ファイル（単独）または ZIP（MP3+JSON+画像）アップロード
app.post('/api/upload', upload.single('file'), async (req, res) => {
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

    // ZIP ファイルの場合、MP3、JSON、画像を抽出
    if (isZip) {
      const { mp3File, jsonConfig, imageFiles } = extractZipAndGetConfig(uploadedFilePath);

      if (!mp3File) {
        fs.unlinkSync(uploadedFilePath);
        return res.status(400).json({ error: 'No MP3 file found in ZIP' });
      }

      // MP3 ファイルをサーバーに保存
      audioFilename = `episode-${episodeTimestamp}.mp3`;
      const audioFilePath = path.join(audioDir, audioFilename);
      fs.writeFileSync(audioFilePath, mp3File.data);

      // 画像ファイルを保存し、JSON パスを更新
      const imageMap = {}; // 元のファイル名 → 新しいパスのマッピング
      
      if (imageFiles.length > 0) {
        for (const imgFile of imageFiles) {
          // ファイル名をサニタイズ（安全な名前に変換）
          const ext = path.extname(imgFile.originalName);
          const baseName = path.basename(imgFile.originalName, ext).replace(/[^a-z0-9_-]/gi, '_');
          const newImageFilename = `episode-${episodeTimestamp}-${baseName}${ext}`;
          const imagePath = path.join(uploadsDir, newImageFilename);
          const normalizedOriginalName = imgFile.originalName.replace(/\\/g, '/');
          const originalBaseName = path.basename(normalizedOriginalName);
          const publicPath = `/uploads/${newImageFilename}`;
          
          fs.writeFileSync(imagePath, imgFile.data);
          
          // マッピング作成（JSON の相対パス揺れを吸収）
          imageMap[normalizedOriginalName] = publicPath;
          imageMap[originalBaseName] = publicPath;
          imageMap[`./${originalBaseName}`] = publicPath;
          
          console.log(`[Upload] Image extracted: ${newImageFilename}`);
        }
      }

      // JSON がある場合、画像パスを更新（path/keyの揺れを吸収）
      if (jsonConfig) {
        slideshowConfig = normalizeSlideshowConfig(jsonConfig, imageMap);
        if (slideshowConfig) {
          console.log(`[Upload] Slideshow config loaded with ${slideshowConfig.length} slides`);
        }
      }

      // ZIP は削除
      fs.unlinkSync(uploadedFilePath);

      console.log(`[Upload] ZIP extracted: ${audioFilename}`);
    }

    // DB に挿入
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

        // クライアントには即座にレスポンスを返す
        res.json({
          id: this.lastID,
          title,
          description,
          filename: audioFilename,
          uploadedAt: new Date().toISOString(),
          transcriptStatus: 'pending',
          slideshowConfig: slideshowConfig || null
        });

        // バックグラウンドで文字起こし処理を開始（非同期）
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

      // slideshowConfig もパース
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
