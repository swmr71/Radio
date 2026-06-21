import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  X,
  Search,
  Heart,
  HeartOff,
  Trash2,
  Upload,
  Music,
  Clock,
  Menu,
} from 'lucide-react';


export default function RadioApp() {
  const [episodes, setEpisodes] = useState([]);
  const [filteredEpisodes, setFilteredEpisodes] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [episodeTitle, setEpisodeTitle] = useState('');
  const [episodeDesc, setEpisodeDesc] = useState('');
  const [uploading, setUploading] = useState(false);
  const [currentEpisode, setCurrentEpisode] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [repeatMode, setRepeatMode] = useState('none');
  const [isShuffle, setIsShuffle] = useState(false);
  const [favorites, setFavorites] = useState(new Set());
  const [currentPage, setCurrentPage] = useState('browse');
  const [playlists, setPlaylists] = useState([
    { id: 1, name: 'お気に入り', color: '#ec4899' },
  ]);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [showPlaylistForm, setShowPlaylistForm] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [playerExpanded, setPlayerExpanded] = useState(false);

  const audioRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchEpisodes();
  }, []);

  useEffect(() => {
    filterEpisodes();
  }, [episodes, searchQuery]);

  useEffect(() => {
    if (currentEpisode && audioRef.current) {
      setCurrentTime(0);
      setDuration(0);

      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
          })
          .catch((err) => {
            console.log('Autoplay prevented:', err);
            setIsPlaying(false);
          });
      }
    }
  }, [currentEpisode]);

  const fetchEpisodes = async () => {
    try {
      const res = await fetch('/api/episodes');
      const data = await res.json();
      setEpisodes(data);
    } catch (error) {
      console.error('Failed to fetch episodes:', error);
    }
  };

  const filterEpisodes = () => {
    const query = searchQuery.toLowerCase();
    const filtered = episodes.filter(
      (ep) =>
        ep.title.toLowerCase().includes(query) ||
        ep.description?.toLowerCase().includes(query)
    );
    setFilteredEpisodes(filtered);
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
      setCurrentPage('browse');
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
  };

  const togglePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play().catch((err) => console.error(err));
        setIsPlaying(true);
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
    if (filteredEpisodes.length === 0) return;
    if (!currentEpisode) {
      playEpisode(filteredEpisodes[0]);
      return;
    }

    if (isShuffle) {
      const randomIndex = Math.floor(Math.random() * filteredEpisodes.length);
      playEpisode(filteredEpisodes[randomIndex]);
    } else {
      const currentIndex = filteredEpisodes.findIndex((ep) => ep.id === currentEpisode.id);
      if (currentIndex !== -1) {
        if (currentIndex < filteredEpisodes.length - 1) {
          playEpisode(filteredEpisodes[currentIndex + 1]);
        } else if (repeatMode === 'all') {
          playEpisode(filteredEpisodes[0]);
        } else {
          setIsPlaying(false);
        }
      }
    }
  };

  const playPrev = () => {
    if (filteredEpisodes.length === 0 || !currentEpisode) return;

    const currentIndex = filteredEpisodes.findIndex((ep) => ep.id === currentEpisode.id);
    if (currentIndex !== -1) {
      if (currentIndex > 0) {
        playEpisode(filteredEpisodes[currentIndex - 1]);
      } else if (repeatMode === 'all') {
        playEpisode(filteredEpisodes[filteredEpisodes.length - 1]);
      }
    }
  };

  const handleEnded = () => {
    if (repeatMode === 'one') {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch((err) => console.error(err));
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

  const toggleFavorite = (episodeId) => {
    const newFavorites = new Set(favorites);
    if (newFavorites.has(episodeId)) {
      newFavorites.delete(episodeId);
    } else {
      newFavorites.add(episodeId);
    }
    setFavorites(newFavorites);
  };

  const createPlaylist = () => {
    if (!newPlaylistName.trim()) return;
    const newPlaylist = {
      id: Math.max(...playlists.map((p) => p.id), 0) + 1,
      name: newPlaylistName,
      color: `hsl(${Math.random() * 360}, 70%, 50%)`,
    };
    setPlaylists([...playlists, newPlaylist]);
    setNewPlaylistName('');
    setShowPlaylistForm(false);
  };

  return (
    <div style={styles.appContainer}>
      {/* サイドバー */}
      <aside style={{ ...styles.sidebar, left: sidebarOpen ? 0 : '-250px' }}>
        <div style={styles.sidebarHeader}>
          <Music size={24} style={{ color: '#4f46e5' }} />
          <h1 style={styles.sidebarTitle}>ラジオ</h1>
          {/* サイドバー内を閉じるボタン（スマホ・PC共通で便利） */}
          <button onClick={() => setSidebarOpen(false)} style={styles.closeSidebarBtn}>
            <X size={20} />
          </button>
        </div>

        <nav style={styles.sidebarNav}>
          {/* onClick内の setSidebarOpen(false) を削除して勝手に閉じないように変更 */}
          <button
            onClick={() => { setCurrentPage('browse'); }}
            style={{
              ...styles.navButton,
              ...(currentPage === 'browse' ? styles.navButtonActive : {}),
            }}
          >
            <Music size={18} />
            <span>ブラウズ</span>
          </button>
          <button
            onClick={() => { setCurrentPage('upload'); }}
            style={{
              ...styles.navButton,
              ...(currentPage === 'upload' ? styles.navButtonActive : {}),
            }}
          >
            <Upload size={18} />
            <span>アップロード</span>
          </button>
          <button
            onClick={() => { setCurrentPage('favorites'); }}
            style={{
              ...styles.navButton,
              ...(currentPage === 'favorites' ? styles.navButtonActive : {}),
            }}
          >
            <Heart size={18} />
            <span>お気に入り</span>
          </button>
        </nav>

        <div style={styles.sidebarPlaylistsSection}>
          <div style={styles.playlistsHeader}>
            <h3 style={styles.playlistsTitle}>プレイリスト</h3>
            <button
              onClick={() => setShowPlaylistForm(!showPlaylistForm)}
              style={styles.addPlaylistBtn}
            >
              +
            </button>
          </div>

          {showPlaylistForm && (
            <div style={styles.playlistForm}>
              <input
                type="text"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="プレイリスト名"
                style={styles.playlistInput}
              />
              <button
                onClick={createPlaylist}
                style={styles.createPlaylistBtn}
              >
                作成
              </button>
            </div>
          )}

          <div style={styles.playlistList}>
            {playlists.map((pl) => (
              <button
                key={pl.id}
                style={{
                  ...styles.playlistButton,
                  borderLeft: `4px solid ${pl.color}`,
                }}
              >
                {pl.name}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* メインコンテンツ - サイドバーの状態に合わせて左マージンを動的に変える */}
      <main style={{ ...styles.mainContent, marginLeft: sidebarOpen ? '250px' : '0' }}>
        {/* ハンバーガーメニュー - サイドバーが閉じている時だけ表示されるように変更 */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{ ...styles.hamburgerBtn, display: sidebarOpen ? 'none' : 'flex' }}
        >
          <Menu size={24} />
        </button>

        {/* ブラウズページ */}
        {currentPage === 'browse' && (
          <div style={styles.page}>
            <div style={styles.searchContainer}>
              <Search size={20} style={styles.searchIcon} />
              <input
                type="text"
                placeholder="エピソードを検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={styles.searchInput}
              />
            </div>

            <section style={styles.section}>
              <h2 style={styles.sectionTitle}>
                {searchQuery ? '検索結果' : 'すべてのエピソード'}
              </h2>
              {filteredEpisodes.length === 0 ? (
                <div style={styles.emptyState}>
                  <Music size={48} style={{ color: '#d1d5db' }} />
                  <p style={styles.emptyMessage}>エピソードが見つかりません</p>
                </div>
              ) : (
                <div style={styles.episodeGrid}>
                  {filteredEpisodes.map((ep) => (
                    <div
                      key={ep.id}
                      style={{
                        ...styles.episodeCard,
                        ...(currentEpisode?.id === ep.id ? styles.episodeCardActive : {}),
                      }}
                    >
                      <div
                        style={styles.episodeCardImage}
                        onClick={() => playEpisode(ep)}
                      >
                        <Music size={48} style={{ color: '#fff' }} />
                      </div>
                      <div style={styles.episodeCardContent}>
                        <h3 style={styles.episodeTitle}>{ep.title}</h3>
                        {ep.description && (
                          <p style={styles.episodeDesc}>{ep.description}</p>
                        )}
                        <p style={styles.episodeDate}>
                          {new Date(ep.uploadedAt).toLocaleDateString('ja-JP')}
                        </p>
                      </div>
                      <div style={styles.episodeCardActions}>
                        <button
                          onClick={() => playEpisode(ep)}
                          style={styles.playBtn}
                        >
                          <Play size={18} />
                        </button>
                        <button
                          onClick={() => toggleFavorite(ep.id)}
                          style={{
                            ...styles.favoriteBtn,
                            ...(favorites.has(ep.id) ? styles.favoriteBtnActive : {}),
                          }}
                        >
                          {favorites.has(ep.id) ? (
                            <Heart size={18} />
                          ) : (
                            <HeartOff size={18} />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* アップロードページ */}
        {currentPage === 'upload' && (
          <div style={styles.page}>
            <section style={styles.section}>
              <h2 style={styles.sectionTitle}>エピソードをアップロード</h2>
              <form onSubmit={handleUpload} style={styles.form}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>タイトル</label>
                  <input
                    type="text"
                    value={episodeTitle}
                    onChange={(e) => setEpisodeTitle(e.target.value)}
                    placeholder="エピソードのタイトル"
                    style={styles.input}
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>説明</label>
                  <textarea
                    value={episodeDesc}
                    onChange={(e) => setEpisodeDesc(e.target.value)}
                    placeholder="エピソードの説明（任意）"
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
                      accept="audio/*"
                      onChange={(e) => setUploadFile(e.target.files[0])}
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
                  }}
                >
                  {uploading ? 'アップロード中...' : 'アップロード'}
                </button>
              </form>
            </section>
          </div>
        )}

        {/* お気に入りページ */}
        {currentPage === 'favorites' && (
          <div style={styles.page}>
            <section style={styles.section}>
              <h2 style={styles.sectionTitle}>お気に入り</h2>
              {filteredEpisodes.filter((ep) => favorites.has(ep.id)).length === 0 ? (
                <div style={styles.emptyState}>
                  <Heart size={48} style={{ color: '#d1d5db' }} />
                  <p style={styles.emptyMessage}>お気に入りがまだありません</p>
                </div>
              ) : (
                <div style={styles.episodeGrid}>
                  {filteredEpisodes
                    .filter((ep) => favorites.has(ep.id))
                    .map((ep) => (
                      <div
                        key={ep.id}
                        style={{
                          ...styles.episodeCard,
                          ...(currentEpisode?.id === ep.id ? styles.episodeCardActive : {}),
                        }}
                      >
                        <div
                          style={styles.episodeCardImage}
                          onClick={() => playEpisode(ep)}
                        >
                          <Music size={48} style={{ color: '#fff' }} />
                        </div>
                        <div style={styles.episodeCardContent}>
                          <h3 style={styles.episodeTitle}>{ep.title}</h3>
                          {ep.description && (
                            <p style={styles.episodeDesc}>{ep.description}</p>
                          )}
                          <p style={styles.episodeDate}>
                            {new Date(ep.uploadedAt).toLocaleDateString('ja-JP')}
                          </p>
                        </div>
                        <div style={styles.episodeCardActions}>
                          <button
                            onClick={() => playEpisode(ep)}
                            style={styles.playBtn}
                          >
                            <Play size={18} />
                          </button>
                          <button
                            onClick={() => toggleFavorite(ep.id)}
                            style={{
                              ...styles.favoriteBtn,
                              ...(favorites.has(ep.id) ? styles.favoriteBtnActive : {}),
                            }}
                          >
                            {favorites.has(ep.id) ? (
                              <Heart size={18} />
                            ) : (
                              <HeartOff size={18} />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {/* 固定プレイヤー */}
      <div style={styles.playerContainer}>
        <audio
          ref={audioRef}
          src={currentEpisode ? `/audio/${currentEpisode.filename}` : ''}
          onEnded={handleEnded}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
        />

        {/* ミニプレイヤー */}
        {!playerExpanded && currentEpisode && (
          <div style={styles.miniPlayer} onClick={() => setPlayerExpanded(true)}>
            <div style={styles.miniPlayerContent}>
              <div style={styles.miniPlayerIcon}>
                <Music size={20} style={{ color: '#fff' }} />
              </div>
              <div style={styles.miniPlayerInfo}>
                <p style={styles.miniPlayerTitle}>{currentEpisode.title}</p>
                <p style={styles.miniPlayerTime}>
                  {formatTime(currentTime)} / {formatTime(duration)}
                </p>
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                togglePlayPause();
              }}
              style={styles.miniPlayerPlayBtn}
            >
              {isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </button>
          </div>
        )}

        {/* 拡張プレイヤー */}
        {playerExpanded && currentEpisode && (
          <div style={styles.expandedPlayer}>
            <button
              onClick={() => setPlayerExpanded(false)}
              style={styles.collapseBtn}
            >
              <X size={24} />
            </button>

            <div style={styles.expandedPlayerContent}>
              <div style={styles.albumArt}>
                <Music size={96} style={{ color: '#4f46e5' }} />
              </div>

              <h2 style={styles.expandedPlayerTitle}>{currentEpisode.title}</h2>
              {currentEpisode.description && (
                <p style={styles.expandedPlayerDesc}>{currentEpisode.description}</p>
              )}

              {/* プログレスバー */}
              <div style={styles.progressSection}>
                <input
                  type="range"
                  min="0"
                  max={duration || 0}
                  value={currentTime}
                  onChange={handleSeek}
                  style={styles.progressBar}
                />
                <div style={styles.timeDisplay}>
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* コントロールボタン */}
              <div style={styles.playerControls}>
                <button
                  onClick={() => {
                    if (isShuffle) setIsShuffle(false);
                    else setIsShuffle(true);
                  }}
                  style={{
                    ...styles.controlButton,
                    ...(isShuffle ? styles.controlButtonActive : {}),
                  }}
                >
                  <Shuffle size={24} />
                </button>

                <button
                  onClick={playPrev}
                  style={styles.controlButton}
                >
                  <SkipBack size={24} />
                </button>

                <button
                  onClick={togglePlayPause}
                  style={styles.playButtonLarge}
                >
                  {isPlaying ? (
                    <Pause size={32} />
                  ) : (
                    <Play size={32} />
                  )}
                </button>

                <button
                  onClick={playNext}
                  style={styles.controlButton}
                >
                  <SkipForward size={24} />
                </button>

                <button
                  onClick={() => {
                    if (repeatMode === 'none') setRepeatMode('all');
                    else if (repeatMode === 'all') setRepeatMode('one');
                    else setRepeatMode('none');
                  }}
                  style={{
                    ...styles.controlButton,
                    ...(repeatMode !== 'none' ? styles.controlButtonActive : {}),
                  }}
                >
                  {repeatMode === 'one' ? (
                    <Repeat1 size={24} />
                  ) : (
                    <Repeat size={24} />
                  )}
                </button>
              </div>

              {/* リピートモード表示 */}
              <p style={styles.repeatModeLabel}>
                {repeatMode === 'none' && 'リピート: オフ'}
                {repeatMode === 'all' && 'リピート: すべて'}
                {repeatMode === 'one' && 'リピート: 1曲'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  appContainer: {
    display: 'flex',
    height: '100vh',
    backgroundColor: '#f9fafb',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  sidebar: {
    width: '250px',
    backgroundColor: '#fff',
    borderRight: '1px solid #e5e7eb',
    padding: '1.5rem 1rem',
    overflowY: 'auto',
    position: 'fixed',
    height: '100vh',
    zIndex: 100,
    transition: 'left 0.3s ease-out',
  },
  sidebarHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '2rem',
    justifyContent: 'space-between',
  },
  sidebarTitle: {
    fontSize: '1.5rem',
    fontWeight: '700',
    margin: 0,
    color: '#1f2937',
    flex: 1,
  },
  closeSidebarBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#6b7280',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
  },
  sidebarNav: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    marginBottom: '2rem',
  },
  navButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.75rem 1rem',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '8px',
    color: '#6b7280',
    cursor: 'pointer',
    fontSize: '0.95rem',
    transition: 'all 0.2s',
    width: '100%',
    textAlign: 'left',
  },
  navButtonActive: {
    backgroundColor: '#ede9fe',
    color: '#4f46e5',
    fontWeight: '500',
  },
  sidebarPlaylistsSection: {
    borderTop: '1px solid #e5e7eb',
    paddingTop: '1.5rem',
  },
  playlistsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
  },
  playlistsTitle: {
    fontSize: '0.85rem',
    fontWeight: '600',
    color: '#6b7280',
    margin: 0,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  addPlaylistBtn: {
    width: '28px',
    height: '28px',
    borderRadius: '6px',
    backgroundColor: '#4f46e5',
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    fontSize: '1.2rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playlistForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    marginBottom: '1rem',
  },
  playlistInput: {
    padding: '0.5rem 0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '0.9rem',
    fontFamily: 'inherit',
  },
  createPlaylistBtn: {
    padding: '0.5rem 1rem',
    backgroundColor: '#10b981',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: '500',
  },
  playlistList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  playlistButton: {
    padding: '0.75rem 1rem',
    textAlign: 'left',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '6px',
    color: '#6b7280',
    cursor: 'pointer',
    fontSize: '0.95rem',
    transition: 'background-color 0.2s',
    width: '100%',
  },
  mainContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
    paddingBottom: '150px',
    transition: 'margin-left 0.3s ease-out',
  },
  hamburgerBtn: {
    position: 'fixed',
    top: '1rem',
    left: '1rem',
    zIndex: 200,
    width: '40px',
    height: '40px',
    borderRadius: '8px',
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    cursor: 'pointer',
    alignItems: 'center',
    justifyContent: 'center',
  },
  page: {
    padding: '2rem',
  },
  searchContainer: {
    position: 'relative',
    marginBottom: '2rem',
  },
  searchIcon: {
    position: 'absolute',
    left: '1rem',
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#9ca3af',
  },
  searchInput: {
    width: '100%',
    padding: '0.75rem 1rem 0.75rem 2.75rem',
    fontSize: '1rem',
    border: '1px solid #d1d5db',
    borderRadius: '12px',
    backgroundColor: '#fff',
    fontFamily: 'inherit',
  },
  section: {
    marginBottom: '2rem',
  },
  sectionTitle: {
    fontSize: '1.5rem',
    fontWeight: '700',
    marginBottom: '1.5rem',
    color: '#1f2937',
  },
  episodeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
    gap: '1.5rem',
  },
  episodeCard: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
    transition: 'all 0.2s',
    cursor: 'pointer',
  },
  episodeCardActive: {
    boxShadow: '0 0 0 2px #4f46e5',
  },
  episodeCardImage: {
    width: '100%',
    aspectRatio: '1',
    backgroundColor: '#4f46e5',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  episodeCardContent: {
    padding: '1rem',
  },
  episodeTitle: {
    fontSize: '1rem',
    fontWeight: '600',
    margin: '0 0 0.5rem 0',
    color: '#1f2937',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  episodeDesc: {
    fontSize: '0.85rem',
    color: '#6b7280',
    margin: '0 0 0.5rem 0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  episodeDate: {
    fontSize: '0.8rem',
    color: '#9ca3af',
    margin: 0,
  },
  episodeCardActions: {
    display: 'flex',
    gap: '0.5rem',
    padding: '0.75rem 1rem',
    borderTop: '1px solid #f3f4f6',
  },
  playBtn: {
    flex: 1,
    padding: '0.5rem',
    backgroundColor: '#4f46e5',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.2s',
  },
  favoriteBtn: {
    width: '36px',
    height: '36px',
    padding: '0.5rem',
    backgroundColor: '#f3f4f6',
    color: '#6b7280',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  favoriteBtnActive: {
    backgroundColor: '#fce7f3',
    color: '#ec4899',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '3rem 2rem',
    color: '#9ca3af',
  },
  emptyMessage: {
    fontSize: '1.1rem',
    color: '#6b7280',
    marginTop: '1rem',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
    backgroundColor: '#fff',
    padding: '2rem',
    borderRadius: '12px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  label: {
    fontSize: '0.95rem',
    fontWeight: '500',
    color: '#1f2937',
  },
  input: {
    padding: '0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '1rem',
    fontFamily: 'inherit',
  },
  textarea: {
    padding: '0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '1rem',
    fontFamily: 'inherit',
    minHeight: '100px',
    resize: 'vertical',
  },
  fileInput: {
    display: 'none',
  },
  fileInputWrapper: {
    cursor: 'pointer',
  },
  fileInputPlaceholder: {
    display: 'block',
    padding: '1.5rem',
    backgroundColor: '#f9fafb',
    border: '2px dashed #d1d5db',
    borderRadius: '8px',
    textAlign: 'center',
    color: '#6b7280',
    transition: 'all 0.2s',
  },
  submitBtn: {
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
  playerContainer: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 50,
  },
  miniPlayer: {
    height: '70px',
    backgroundColor: '#fff',
    borderTop: '1px solid #e5e7eb',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 1rem',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  miniPlayerContent: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  miniPlayerIcon: {
    width: '50px',
    height: '50px',
    backgroundColor: '#4f46e5',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniPlayerInfo: {
    flex: 1,
  },
  miniPlayerTitle: {
    fontSize: '0.95rem',
    fontWeight: '500',
    margin: '0 0 0.25rem 0',
    color: '#1f2937',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  miniPlayerTime: {
    fontSize: '0.8rem',
    color: '#6b7280',
    margin: 0,
  },
  miniPlayerPlayBtn: {
    width: '40px',
    height: '40px',
    backgroundColor: '#4f46e5',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.2s',
  },
  expandedPlayer: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    zIndex: 60,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
    overflow: 'auto',
  },
  collapseBtn: {
    position: 'absolute',
    top: '1rem',
    right: '1rem',
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    backgroundColor: '#f3f4f6',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#6b7280',
  },
  expandedPlayerContent: {
    maxWidth: '400px',
    width: '100%',
    textAlign: 'center',
  },
  albumArt: {
    width: '200px',
    height: '200px',
    backgroundColor: '#4f46e5',
    borderRadius: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 2rem',
    color: '#fff',
  },
  expandedPlayerTitle: {
    fontSize: '1.75rem',
    fontWeight: '700',
    marginBottom: '0.5rem',
    color: '#1f2937',
  },
  expandedPlayerDesc: {
    fontSize: '0.95rem',
    color: '#6b7280',
    marginBottom: '2rem',
  },
  progressSection: {
    marginBottom: '2rem',
  },
  progressBar: {
    width: '100%',
    height: '6px',
    accentColor: '#4f46e5',
    cursor: 'pointer',
    marginBottom: '0.75rem',
  },
  timeDisplay: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.85rem',
    color: '#6b7280',
    fontFamily: 'monospace',
  },
  playerControls: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1.5rem',
    marginBottom: '2rem',
  },
  controlButton: {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    backgroundColor: '#f3f4f6',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#6b7280',
    transition: 'all 0.2s',
  },
  controlButtonActive: {
    backgroundColor: '#4f46e5',
    color: '#fff',
  },
  playButtonLarge: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    backgroundColor: '#4f46e5',
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'transform 0.2s',
  },
  repeatModeLabel: {
    fontSize: '0.95rem',
    color: '#6b7280',
    fontWeight: '500',
    margin: 0,
  },
};
