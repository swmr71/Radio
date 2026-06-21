import React, { useState, useEffect, useRef } from 'react';

export default function RadioApp() {
  const [episodes, setEpisodes] = useState([]);
  const [uploadFile, setUploadFile] = useState(null);
  const [episodeTitle, setEpisodeTitle] = useState('');
  const [episodeDesc, setEpisodeDesc] = useState('');
  const [uploading, setUploading] = useState(false);
  const [currentEpisode, setCurrentEpisode] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [repeatMode, setRepeatMode] = useState('none'); // 'none' | 'all' | 'one'
  const [isShuffle, setIsShuffle] = useState(false);

  const audioRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchEpisodes();

    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener('popstate', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, []);

  // Autoplay handler when currentEpisode changes
  useEffect(() => {
    if (currentEpisode && audioRef.current) {
      // Set values back to zero to avoid showing old seek progress
      setCurrentTime(0);
      setDuration(0);
      
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
          })
          .catch((err) => {
            console.log('Autoplay prevented/failed:', err);
            setIsPlaying(false);
          });
      }
    }
  }, [currentEpisode]);

  const navigateTo = (path) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
  };

  const fetchEpisodes = async () => {
    try {
      const res = await fetch('/api/episodes');
      const data = await res.json();
      setEpisodes(data);
    } catch (error) {
      console.error('Failed to fetch episodes:', error);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!uploadFile || !episodeTitle) {
      alert('タイトルと音声ファイルを選択してください');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('title', episodeTitle);
    formData.append('description', episodeDesc);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!res.ok) {
        const error = await res.json();
        alert(`アップロード失敗: ${error.error}`);
        return;
      }

      alert('アップロード成功！');
      setUploadFile(null);
      setEpisodeTitle('');
      setEpisodeDesc('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      await fetchEpisodes();
    } catch (error) {
      console.error('Upload failed:', error);
      alert(`エラー: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const playEpisode = (episode) => {
    setCurrentEpisode(episode);
    setIsPlaying(true);
    navigateTo('/'); // Redirect to play view when clicked
  };

  const togglePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play().then(() => {
          setIsPlaying(true);
        }).catch(err => {
          console.error('Play failed:', err);
        });
      }
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const formatTime = (secs) => {
    if (isNaN(secs) || secs === Infinity) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const playNext = () => {
    if (episodes.length === 0) return;
    if (!currentEpisode) {
      playEpisode(episodes[0]);
      return;
    }

    if (isShuffle) {
      const randomIndex = Math.floor(Math.random() * episodes.length);
      playEpisode(episodes[randomIndex]);
    } else {
      const currentIndex = episodes.findIndex((ep) => ep.id === currentEpisode.id);
      if (currentIndex !== -1) {
        if (currentIndex < episodes.length - 1) {
          playEpisode(episodes[currentIndex + 1]);
        } else if (repeatMode === 'all') {
          playEpisode(episodes[0]);
        } else {
          setIsPlaying(false);
        }
      }
    }
  };

  const playPrev = () => {
    if (episodes.length === 0 || !currentEpisode) return;

    const currentIndex = episodes.findIndex((ep) => ep.id === currentEpisode.id);
    if (currentIndex !== -1) {
      if (currentIndex > 0) {
        playEpisode(episodes[currentIndex - 1]);
      } else if (repeatMode === 'all') {
        playEpisode(episodes[episodes.length - 1]);
      }
    }
  };

  const handleEnded = () => {
    if (repeatMode === 'one') {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(err => console.error(err));
      }
    } else {
      playNext();
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('このエピソードを削除しますか？')) return;

    try {
      const res = await fetch(`/api/episodes/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchEpisodes();
        if (currentEpisode?.id === id) {
          setCurrentEpisode(null);
          setIsPlaying(false);
        }
      }
    } catch (error) {
      console.error('Delete failed:', error);
    }
  };

  const isManagePage = currentPath === '/manage';

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>オンデマンドラジオ</h1>
        <p style={styles.subtitle}>音声エピソードをアップロード＆再生</p>
      </header>

      {/* ページナビゲーション */}
      <div style={styles.tabNav}>
        <button
          style={{
            ...styles.tabButton,
            ...(!isManagePage ? styles.tabButtonActive : styles.tabButtonInactive),
          }}
          onClick={() => navigateTo('/')}
        >
          ▶ 再生ページ
        </button>
        <button
          style={{
            ...styles.tabButton,
            ...(isManagePage ? styles.tabButtonActive : styles.tabButtonInactive),
          }}
          onClick={() => navigateTo('/manage')}
        >
          ⚙ 管理ページ
        </button>
      </div>

      {/* 再生ページ */}
      {!isManagePage && (
        <div style={styles.pageContainer}>
          {currentEpisode ? (
            <div style={styles.player}>
              <div style={styles.playerInfo}>
                <div>
                  <h2 style={styles.playerTitle}>{currentEpisode.title}</h2>
                  <p style={styles.playerDesc}>{currentEpisode.description}</p>
                  <p style={styles.playerDate}>
                    {new Date(currentEpisode.uploadedAt).toLocaleString('ja-JP')}
                  </p>
                </div>
              </div>
              <audio
                ref={audioRef}
                src={`/audio/${currentEpisode.filename}`}
                onEnded={handleEnded}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                style={{ display: 'none' }}
              />
              
              {/* Seek Bar */}
              <div style={styles.seekBarContainer}>
                <span style={styles.timeLabel}>{formatTime(currentTime)}</span>
                <input
                  type="range"
                  min="0"
                  max={duration || 0}
                  value={currentTime}
                  onChange={handleSeek}
                  style={styles.seekBar}
                />
                <span style={styles.timeLabel}>{formatTime(duration)}</span>
              </div>

              {/* Player Controls */}
              <div style={styles.playerControls}>
                <button
                  onClick={() => setIsShuffle(!isShuffle)}
                  style={{
                    ...styles.controlBtn,
                    color: isShuffle ? '#4f46e5' : '#999',
                    backgroundColor: isShuffle ? '#f3f4f6' : 'transparent',
                    borderColor: isShuffle ? '#c7d2fe' : '#e5e7eb',
                  }}
                  title="シャッフル"
                >
                  🔀
                </button>
                
                <button 
                  onClick={playPrev} 
                  style={styles.controlBtn} 
                  title="前へ"
                >
                  ⏮
                </button>

                <button
                  onClick={togglePlayPause}
                  style={styles.playBtn}
                >
                  {isPlaying ? '⏸ 一時停止' : '▶ 再生'}
                </button>

                <button 
                  onClick={playNext} 
                  style={styles.controlBtn} 
                  title="次へ"
                >
                  ⏭
                </button>

                <button
                  onClick={() => {
                    if (repeatMode === 'none') setRepeatMode('all');
                    else if (repeatMode === 'all') setRepeatMode('one');
                    else setRepeatMode('none');
                  }}
                  style={{
                    ...styles.controlBtn,
                    color: repeatMode !== 'none' ? '#4f46e5' : '#999',
                    backgroundColor: repeatMode !== 'none' ? '#f3f4f6' : 'transparent',
                    borderColor: repeatMode !== 'none' ? '#c7d2fe' : '#e5e7eb',
                  }}
                  title={
                    repeatMode === 'none'
                      ? 'リピート: オフ'
                      : repeatMode === 'all'
                      ? 'リピート: 全曲'
                      : 'リピート: 1曲'
                  }
                >
                  🔁 {repeatMode === 'one' ? <span style={{fontSize: '0.65rem', verticalAlign: 'super'}}>1</span> : ''}
                </button>

                <button
                  onClick={() => {
                    setCurrentEpisode(null);
                    setIsPlaying(false);
                  }}
                  style={styles.closeBtn}
                >
                  ✕ 閉じる
                </button>
              </div>
            </div>
          ) : (
            <div style={styles.emptyState}>
              <p style={styles.emptyMessage}>エピソードを選択してください</p>
              <button
                onClick={() => navigateTo('/manage')}
                style={styles.switchTabBtn}
              >
                管理ページに移動
              </button>
            </div>
          )}

          <div style={styles.episodeListSection}>
            <h2 style={styles.sectionTitle}>エピソード一覧</h2>
            {episodes.length === 0 ? (
              <p style={styles.emptyMessage}>エピソードがまだアップロードされていません</p>
            ) : (
              <div style={styles.episodeList}>
                {episodes.map((ep) => (
                  <div
                    key={ep.id}
                    style={{
                      ...styles.episodeCard,
                      ...(currentEpisode?.id === ep.id ? styles.episodeCardActive : {}),
                    }}
                  >
                    <div style={styles.episodeCardContent}>
                      <h3 style={styles.episodeTitle}>{ep.title}</h3>
                      {ep.description && (
                        <p style={styles.episodeCardDesc}>{ep.description}</p>
                      )}
                      <p style={styles.episodeDate}>
                        {new Date(ep.uploadedAt).toLocaleString('ja-JP')}
                      </p>
                    </div>
                    <div style={styles.episodeCardActions}>
                      <button
                        onClick={() => playEpisode(ep)}
                        style={styles.playEpisodeBtn}
                      >
                        ▶ 再生
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 管理ページ */}
      {isManagePage && (
        <div style={styles.pageContainer}>
          <div style={styles.uploadSection}>
            <h2 style={styles.sectionTitle}>エピソードをアップロード</h2>
            <form onSubmit={handleUpload} style={styles.form}>
              <div style={styles.formGroup}>
                <label style={styles.label}>タイトル</label>
                <input
                  type="text"
                  value={episodeTitle}
                  onChange={(e) => setEpisodeTitle(e.target.value)}
                  placeholder="エピソードのタイトルを入力"
                  style={styles.input}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>説明</label>
                <textarea
                  value={episodeDesc}
                  onChange={(e) => setEpisodeDesc(e.target.value)}
                  placeholder="エピソードの説明を入力（任意）"
                  style={styles.textarea}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>音声ファイル</label>
                <div 
                  style={styles.fileInputWrapper}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="mp3"
                    onChange={(e) => {
                      setUploadFile(e.target.files[0]);
                    }}
                    style={styles.fileInput}
                  />
                  <span style={styles.fileInputPlaceholder}>
                    {uploadFile ? `📄 ${uploadFile.name}` : 'ファイルを選択...'}
                  </span>
                </div>
              </div>

              <button
                type="submit"
                disabled={uploading || !uploadFile || !episodeTitle}
                style={{
                  ...styles.submitBtn,
                  opacity: uploading || !uploadFile || !episodeTitle ? 0.5 : 1,
                  cursor: uploading || !uploadFile || !episodeTitle ? 'not-allowed' : 'pointer',
                }}
              >
                {uploading ? 'アップロード中...' : 'アップロード'}
              </button>
            </form>
          </div>

          <div style={styles.episodeListSection}>
            <h2 style={styles.sectionTitle}>エピソード管理</h2>
            {episodes.length === 0 ? (
              <p style={styles.emptyMessage}>エピソードがまだアップロードされていません</p>
            ) : (
              <div style={styles.episodeList}>
                {episodes.map((ep) => (
                  <div key={ep.id} style={styles.episodeCard}>
                    <div style={styles.episodeCardContent}>
                      <h3 style={styles.episodeTitle}>{ep.title}</h3>
                      {ep.description && (
                        <p style={styles.episodeCardDesc}>{ep.description}</p>
                      )}
                      <p style={styles.episodeDate}>
                        {new Date(ep.uploadedAt).toLocaleString('ja-JP')}
                      </p>
                    </div>
                    <div style={styles.episodeCardActions}>
                      <button
                        onClick={() => playEpisode(ep)}
                        style={styles.playEpisodeBtn}
                      >
                        ▶ 再生
                      </button>
                      <button
                        onClick={() => handleDelete(ep.id)}
                        style={styles.deleteBtn}
                      >
                        🗑 削除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '900px',
    margin: '0 auto',
    padding: '2rem',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    backgroundColor: '#fafafa',
    minHeight: '100vh',
  },
  header: {
    marginBottom: '2rem',
    textAlign: 'center',
  },
  title: {
    fontSize: '2.5rem',
    margin: '0 0 0.5rem 0',
    color: '#1a1a1a',
  },
  subtitle: {
    fontSize: '1rem',
    color: '#666',
    margin: 0,
  },
  tabNav: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '2rem',
    borderBottom: '1px solid #e5e7eb',
  },
  tabButton: {
    padding: '0.75rem 1.5rem',
    fontSize: '1rem',
    fontWeight: '500',
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  tabButtonActive: {
    color: '#4f46e5',
    borderBottom: '2px solid #4f46e5',
    marginBottom: '-1px',
  },
  tabButtonInactive: {
    color: '#999',
  },
  pageContainer: {
    animation: 'fadeIn 0.2s ease-in',
  },
  player: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '1.5rem',
    marginBottom: '2rem',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    border: '2px solid #4f46e5',
  },
  playerInfo: {
    marginBottom: '1rem',
  },
  playerTitle: {
    fontSize: '1.5rem',
    margin: '0 0 0.5rem 0',
    color: '#1a1a1a',
  },
  playerDesc: {
    fontSize: '0.95rem',
    color: '#666',
    margin: '0.5rem 0',
  },
  playerDate: {
    fontSize: '0.85rem',
    color: '#999',
    margin: '0.5rem 0 0 0',
  },
  audio: {
    width: '100%',
    marginBottom: '1rem',
  },
  playerControls: {
    display: 'flex',
    gap: '0.75rem',
    alignItems: 'center',
  },
  controlBtn: {
    padding: '0.6rem 0.8rem',
    fontSize: '1.1rem',
    backgroundColor: 'transparent',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  seekBarContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    width: '100%',
    marginBottom: '1.25rem',
  },
  seekBar: {
    flex: 1,
    cursor: 'pointer',
    height: '6px',
    accentColor: '#4f46e5',
  },
  timeLabel: {
    fontSize: '0.85rem',
    color: '#666',
    fontFamily: 'monospace',
    minWidth: '40px',
  },
  playBtn: {
    flex: 1,
    padding: '0.75rem',
    fontSize: '1rem',
    fontWeight: '500',
    backgroundColor: '#4f46e5',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  closeBtn: {
    padding: '0.75rem 1rem',
    fontSize: '1rem',
    backgroundColor: '#e5e7eb',
    color: '#1a1a1a',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  emptyState: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '3rem 2rem',
    marginBottom: '2rem',
    textAlign: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  emptyMessage: {
    color: '#999',
    fontSize: '1rem',
    margin: '0 0 1rem 0',
  },
  switchTabBtn: {
    padding: '0.75rem 1.5rem',
    fontSize: '1rem',
    fontWeight: '500',
    backgroundColor: '#4f46e5',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  uploadSection: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '2rem',
    marginBottom: '2rem',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  sectionTitle: {
    fontSize: '1.5rem',
    marginTop: 0,
    marginBottom: '1.5rem',
    color: '#1a1a1a',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  label: {
    fontSize: '0.95rem',
    fontWeight: '500',
    color: '#1a1a1a',
  },
  input: {
    padding: '0.75rem',
    fontSize: '1rem',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontFamily: 'inherit',
  },
  textarea: {
    padding: '0.75rem',
    fontSize: '1rem',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontFamily: 'inherit',
    minHeight: '80px',
    resize: 'vertical',
  },
  fileInput: {
    display: 'none',
  },
  fileInputWrapper: {
    position: 'relative',
    display: 'inline-block',
    width: '100%',
  },
  fileInputPlaceholder: {
    display: 'block',
    padding: '0.75rem',
    fontSize: '1rem',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    backgroundColor: '#f9fafb',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  submitBtn: {
    padding: '0.75rem',
    fontSize: '1rem',
    fontWeight: '500',
    backgroundColor: '#10b981',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  episodeListSection: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '2rem',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  episodeList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  episodeCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1.25rem',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    backgroundColor: '#fafafa',
    transition: 'all 0.2s',
  },
  episodeCardActive: {
    backgroundColor: '#ede9fe',
    borderColor: '#4f46e5',
  },
  episodeCardContent: {
    flex: 1,
  },
  episodeTitle: {
    fontSize: '1.1rem',
    fontWeight: '500',
    margin: '0 0 0.5rem 0',
    color: '#1a1a1a',
  },
  episodeCardDesc: {
    fontSize: '0.9rem',
    color: '#666',
    margin: '0.5rem 0',
  },
  episodeDate: {
    fontSize: '0.8rem',
    color: '#999',
    margin: '0.5rem 0 0 0',
  },
  episodeCardActions: {
    display: 'flex',
    gap: '0.5rem',
    marginLeft: '1rem',
  },
  playEpisodeBtn: {
    padding: '0.5rem 1rem',
    fontSize: '0.9rem',
    fontWeight: '500',
    backgroundColor: '#4f46e5',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'background-color 0.2s',
  },
  deleteBtn: {
    padding: '0.5rem 0.75rem',
    fontSize: '0.9rem',
    backgroundColor: '#fee2e2',
    color: '#dc2626',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
};
