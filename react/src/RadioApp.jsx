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
  Menu,
  ListPlus,
  MessageSquare, // 追加
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
    { id: 1, name: 'マイベスト', color: '#ec4899', episodeIds: [] },
  ]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(null);
  const [activeDropdownEpisodeId, setActiveDropdownEpisodeId] = useState(null);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [showPlaylistForm, setShowPlaylistForm] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [playerExpanded, setPlayerExpanded] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState(0);
  const [uploadedSize, setUploadedSize] = useState(0);

  const audioRef = useRef(null);
  const fileInputRef = useRef(null);
  const uploadStartTimeRef = useRef(null);

  useEffect(() => {
    fetchEpisodes();
  }, []);

  // 文字起こし中のエピソード（pending / processing）がある場合、5秒おきに自動更新（ポーリング）
  useEffect(() => {
    const hasProcessing = episodes.some(
      (ep) => ep.transcriptStatus === 'pending' || ep.transcriptStatus === 'processing'
    );
    if (hasProcessing) {
      const interval = setInterval(fetchEpisodes, 5000);
      return () => clearInterval(interval);
    }
  }, [episodes]);

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
  }, [currentEpisode?.id]); // idが変わったときだけ初期化するよう修正（文字起こしデータ更新でリセットされないため）

  // 再生位置に合わせて文字起こしテキストを自動スクロール追従させる
  useEffect(() => {
    if (playerExpanded && currentEpisode?.transcriptStatus === 'completed') {
      const activeUtterance = document.querySelector('.transcript-active');
      if (activeUtterance) {
        activeUtterance.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [currentTime, playerExpanded, currentEpisode]);

  const fetchEpisodes = async () => {
    try {
      const res = await fetch('/api/episodes');
      const data = await res.json();
      setEpisodes(data);

      // もし現在再生中のエピソードがポーリングで「完了」になったら、詳細データも再取得して反映
      if (currentEpisode) {
        const updatedTrack = data.find(ep => ep.id === currentEpisode.id);
        if (updatedTrack && updatedTrack.transcriptStatus === 'completed' && currentEpisode.transcriptStatus !== 'completed') {
          refreshCurrentEpisodeDetails(currentEpisode.id);
        }
      }
    } catch (error) {
      console.error('Failed to fetch episodes:', error);
    }
  };

  const refreshCurrentEpisodeDetails = async (id) => {
    try {
      const res = await fetch(`/api/episodes/${id}`);
      const data = await res.json();
      setCurrentEpisode(data);
    } catch (error) {
      console.error('Failed to fetch episode details:', error);
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
    setUploadProgress(0);
    setUploadSpeed(0);
    setUploadedSize(0);
    uploadStartTimeRef.current = Date.now();

    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('title', episodeTitle);
    formData.append('description', episodeDesc);

    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = (e.loaded / e.total) * 100;
          setUploadProgress(percentComplete);
          setUploadedSize(e.loaded);

          const elapsedSeconds = (Date.now() - uploadStartTimeRef.current) / 1000;
          if (elapsedSeconds > 0) {
            const speed = e.loaded / elapsedSeconds;
            setUploadSpeed(speed);
          }
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          alert('アップロード成功！文字起こしを開始します。');
          setUploadFile(null);
          setEpisodeTitle('');
          setEpisodeDesc('');
          setUploadProgress(0);
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
          fetchEpisodes();
          setCurrentPage('browse');
        } else {
          try {
            const error = JSON.parse(xhr.responseText);
            alert(`アップロード失敗: ${error.error}`);
          } catch {
            alert(`アップロード失敗: ${xhr.statusText}`);
          }
        }
        setUploading(false);
        resolve();
      });

      xhr.addEventListener('error', () => {
        alert(`エラー: ネットワーク接続に失敗しました`);
        setUploading(false);
        resolve();
      });

      xhr.open('POST', '/api/upload');
      xhr.send(formData);
    });
  };

  // 一覧からエピソードを選択した際、文字起こしテキスト（詳細情報）も含めて取得して再生
  const playEpisode = async (episode) => {
    setCurrentEpisode(episode); // まず再生をすぐに始めるためにセット
    setIsPlaying(true);
    await refreshCurrentEpisodeDetails(episode.id); // 裏で文字起こし付きの詳細データを取得
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

  // 文字起こしのタイムスタンプをクリックした時のシーク処理
  const handleTranscriptClick = (startTimeMs) => {
    const timeSecs = startTimeMs / 1000;
    if (audioRef.current) {
      audioRef.current.currentTime = timeSecs;
      setCurrentTime(timeSecs);
    }
  };

  const formatTime = (secs) => {
    if (isNaN(secs) || secs === Infinity) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getCurrentTrackList = () => {
    if (currentPage === 'favorites') {
      return filteredEpisodes.filter((ep) => favorites.has(ep.id));
    }
    if (currentPage === 'playlist') {
      const currentPl = playlists.find((p) => p.id === selectedPlaylistId);
      return currentPl
        ? filteredEpisodes.filter((ep) => currentPl.episodeIds.includes(ep.id))
        : [];
    }
    return filteredEpisodes;
  };

  const playNext = () => {
    const trackList = getCurrentTrackList();
    if (trackList.length === 0) return;
    if (!currentEpisode) {
      playEpisode(trackList[0]);
      return;
    }

    if (isShuffle) {
      const randomIndex = Math.floor(Math.random() * trackList.length);
      playEpisode(trackList[randomIndex]);
    } else {
      const currentIndex = trackList.findIndex((ep) => ep.id === currentEpisode.id);
      if (currentIndex !== -1) {
        if (currentIndex < trackList.length - 1) {
          playEpisode(trackList[currentIndex + 1]);
        } else if (repeatMode === 'all') {
          playEpisode(trackList[0]);
        } else {
          setIsPlaying(false);
        }
      }
    }
  };

  const playPrev = () => {
    const trackList = getCurrentTrackList();
    if (trackList.length === 0 || !currentEpisode) return;

    const currentIndex = trackList.findIndex((ep) => ep.id === currentEpisode.id);
    if (currentIndex !== -1) {
      if (currentIndex > 0) {
        playEpisode(trackList[currentIndex - 1]);
      } else if (repeatMode === 'all') {
        playEpisode(trackList[trackList.length - 1]);
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
      episodeIds: [],
    };
    setPlaylists([...playlists, newPlaylist]);
    setNewPlaylistName('');
    setShowPlaylistForm(false);
  };

  const toggleEpisodeInPlaylist = (playlistId, episodeId) => {
    setPlaylists(
      playlists.map((pl) => {
        if (pl.id === playlistId) {
          const exists = pl.episodeIds.includes(episodeId);
          return {
            ...pl,
            episodeIds: exists
              ? pl.episodeIds.filter((id) => id !== episodeId)
              : [...pl.episodeIds, episodeId],
          };
        }
        return pl;
      })
    );
  };

  const handleExpandPlayer = () => {
    setPlayerExpanded(true);
    if (currentEpisode) {
      refreshCurrentEpisodeDetails(currentEpisode.id); // プレイヤーを開いた瞬間に最新の文字起こし状況を取得
    }
  };

  // 文字起こしステータスに応じたバッジの描画
  const renderStatusBadge = (status) => {
    switch (status) {
      case 'pending':
        return <span style={{ ...styles.badge, backgroundColor: '#f3f4f6', color: '#6b7280' }}>書き起こし待機中</span>;
      case 'processing':
        return <span style={{ ...styles.badge, backgroundColor: '#dbeafe', color: '#1e40af' }} className="animate-pulse">AI文字起こし中...</span>;
      case 'completed':
        return <span style={{ ...styles.badge, backgroundColor: '#d1fae5', color: '#065f46' }}>文字起こし完了</span>;
      case 'failed':
        return <span style={{ ...styles.badge, backgroundColor: '#fee2e2', color: '#991b1b' }}>文字起こし失敗</span>;
      default:
        return null;
    }
  };

  const renderEpisodeGrid = (trackList, emptyMessage, emptyIcon) => {
    if (trackList.length === 0) {
      return (
        <div style={styles.emptyState}>
          {emptyIcon}
          <p style={styles.emptyMessage}>{emptyMessage}</p>
        </div>
      );
    }

    return (
      <div style={styles.episodeGrid} className="animate-fade-in">
        {trackList.map((ep) => (
          <div
            key={ep.id}
            className="episode-card"
            onMouseLeave={() => activeDropdownEpisodeId === ep.id && setActiveDropdownEpisodeId(null)}
            style={{
              ...styles.episodeCard,
              ...(currentEpisode?.id === ep.id ? styles.episodeCardActive : {}),
              position: 'relative',
            }}
          >
            <div style={styles.episodeCardImage} onClick={() => playEpisode(ep)}>
              <Music size={48} style={{ color: '#fff' }} />
            </div>
            <div style={styles.episodeCardContent} onClick={() => playEpisode(ep)}>
              {/* ステータスバッジを表示 */}
              <div style={{ marginBottom: '0.25rem' }}>{renderStatusBadge(ep.transcriptStatus)}</div>
              <h3 style={styles.episodeTitle} title={ep.title}>{ep.title}</h3>
              {ep.description && <p style={styles.episodeDesc}>{ep.description}</p>}
              <p style={styles.episodeDate}>
                {new Date(ep.uploadedAt).toLocaleDateString('ja-JP')}
              </p>
            </div>
            <div style={styles.episodeCardActions}>
              <button onClick={() => playEpisode(ep)} style={styles.playBtn}>
                <Play size={18} />
              </button>
              <button
                onClick={() => toggleFavorite(ep.id)}
                style={{
                  ...styles.favoriteBtn,
                  ...(favorites.has(ep.id) ? styles.favoriteBtnActive : {}),
                }}
              >
                {favorites.has(ep.id) ? <Heart size={18} /> : <HeartOff size={18} />}
              </button>

              <div style={{ position: 'relative' }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveDropdownEpisodeId(activeDropdownEpisodeId === ep.id ? null : ep.id);
                  }}
                  style={{
                    ...styles.favoriteBtn,
                    backgroundColor: playlists.some((p) => p.episodeIds.includes(ep.id))
                      ? '#e0e7ff'
                      : '#f3f4f6',
                    color: playlists.some((p) => p.episodeIds.includes(ep.id)) ? '#4f46e5' : '#6b7280',
                  }}
                >
                  <ListPlus size={18} />
                </button>

                {activeDropdownEpisodeId === ep.id && (
                  <div 
                    style={styles.playlistDropdownMenu} 
                    className="animate-fade-in"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <p style={styles.dropdownMenuTitle}>プレイリストに追加</p>
                    {playlists.map((pl) => {
                      const inPlaylist = pl.episodeIds.includes(ep.id);
                      return (
                        <label key={pl.id} style={styles.dropdownItem}>
                          <input
                            type="checkbox"
                            checked={inPlaylist}
                            onChange={() => toggleEpisodeInPlaylist(pl.id, ep.id)}
                            style={{ accentColor: pl.color }}
                          />
                          <span style={styles.dropdownItemText}>{pl.name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(ep.id);
                }}
                style={styles.deleteBtn}
                title="エピソードを削除"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const animationStyles = `
    @keyframes slideUp {
      from { transform: translateY(100%); opacity: 0.9; }
      to { transform: translateY(0); opacity: 1; }
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: scale(0.98); }
      to { opacity: 1; transform: scale(1); }
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: .5; }
    }
    .animate-slide-up {
      animation: slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    .animate-fade-in {
      animation: fadeIn 0.2s ease-out forwards;
    }
    .animate-pulse {
      animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }
    .episode-card {
      transition: transform 0.2s ease, box-shadow 0.2s ease !important;
    }
    .episode-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05) !important;
    }

    /* 文字起こし行のホバー効果とハイライトアニメーション */
    .transcript-row {
      transition: background-color 0.2s ease, border-left-color 0.2s ease;
    }
    .transcript-row:hover {
      background-color: #f3f4f6;
    }
    .transcript-active {
      background-color: #f0fdf4 !important;
      border-left-color: #22c55e !important;
    }

    /* 拡張プレイヤー用のレスポンシブ2カラムレイアウト */
    .player-layout {
      display: flex;
      flex-direction: column;
      gap: 2rem;
      max-width: 1000px;
      width: 100%;
      padding: 1rem;
    }
    @media (min-width: 769px) {
      .player-layout {
        flex-direction: row;
        align-items: flex-start;
        justify-content: space-between;
      }
      .player-left-panel {
        flex: 1;
        max-width: 420px;
        position: sticky;
        top: 2rem;
      }
      .player-right-panel {
        flex: 1.2;
        background-color: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 16px;
        height: 75vh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .responsive-sidebar {
        left: ${sidebarOpen ? '0' : '-250px'} !important;
      }
      .responsive-main {
        margin-left: 0 !important;
        padding-top: 5rem !important;
      }
      .responsive-hamburger {
        display: flex !important;
      }
    }
    @media (max-width: 768px) {
      .responsive-sidebar {
        left: ${sidebarOpen ? '0' : '-250px'} !important;
      }
      .responsive-main {
        margin-left: 0 !important;
        padding-top: 5rem !important;
      }
      .responsive-hamburger {
        display: flex !important;
      }
      .player-right-panel {
        width: 100%;
        margin-top: 1rem;
        border-top: 1px solid #e5e7eb;
        padding-top: 1.5rem;
      }
    }
    @media (min-width: 769px) {
      .responsive-sidebar {
        left: 0 !important;
      }
      .responsive-main {
        margin-left: 250px !important;
      }
      .responsive-hamburger {
        display: none !important;
      }
    }
  `;

  const currentMs = currentTime * 1000;

  return (
    <div style={styles.appContainer}>
      <style>{animationStyles}</style>

      {/* サイドバー */}
      <aside className="responsive-sidebar" style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <Music size={24} style={{ color: '#4f46e5' }} />
          <h1 style={styles.sidebarTitle}>ラジオ</h1>
        </div>

        <nav style={styles.sidebarNav}>
          <button
            onClick={() => {
              setCurrentPage('browse');
              setSidebarOpen(false);
            }}
            style={{
              ...styles.navButton,
              ...(currentPage === 'browse' ? styles.navButtonActive : {}),
            }}
          >
            <Music size={18} />
            <span>ブラウズ</span>
          </button>
          <button
            onClick={() => {
              setCurrentPage('upload');
              setSidebarOpen(false);
            }}
            style={{
              ...styles.navButton,
              ...(currentPage === 'upload' ? styles.navButtonActive : {}),
            }}
          >
            <Upload size={18} />
            <span>アップロード</span>
          </button>
          <button
            onClick={() => {
              setCurrentPage('favorites');
              setSidebarOpen(false);
            }}
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
            <button onClick={() => setShowPlaylistForm(!showPlaylistForm)} style={styles.addPlaylistBtn}>
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
              <button onClick={createPlaylist} style={styles.createPlaylistBtn}>
                作成
              </button>
            </div>
          )}

          <div style={styles.playlistList}>
            {playlists.map((pl) => (
              <button
                key={pl.id}
                onClick={() => {
                  setCurrentPage('playlist');
                  setSelectedPlaylistId(pl.id);
                  setSidebarOpen(false);
                }}
                style={{
                  ...styles.playlistButton,
                  borderLeft: `4px solid ${pl.color}`,
                  backgroundColor: currentPage === 'playlist' && selectedPlaylistId === pl.id ? '#f3f4f6' : 'transparent',
                  fontWeight: currentPage === 'playlist' && selectedPlaylistId === pl.id ? '600' : 'normal',
                }}
              >
                {pl.name} ({pl.episodeIds.length})
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* メインコンテンツ */}
      <main className="responsive-main" style={styles.mainContent}>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="responsive-hamburger" style={styles.hamburgerBtn}>
          <Menu size={24} />
        </button>

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
              <h2 style={styles.sectionTitle}>{searchQuery ? '検索結果' : 'すべてのエピソード'}</h2>
              {renderEpisodeGrid(
                filteredEpisodes,
                'エピソードが見つかりません',
                <Music size={48} style={{ color: '#d1d5db' }} />
              )}
            </section>
          </div>
        )}

        {currentPage === 'upload' && (
          <div style={styles.page} className="animate-fade-in">
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
                  <div style={styles.fileInputWrapper} onClick={() => fileInputRef.current?.click()}>
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

                {uploading && (
                  <div style={styles.progressContainer}>
                    <div style={styles.progressBarContainer}>
                      <div
                        style={{
                          ...styles.progressFill,
                          width: `${uploadProgress}%`,
                        }}
                      />
                    </div>
                    <div style={styles.progressInfo}>
                      <span>{Math.round(uploadProgress)}%</span>
                      <span>
                        {formatBytes(uploadedSize)} / {formatBytes(uploadFile.size)}
                      </span>
                      <span>
                        {uploadSpeed > 0 ? `${formatBytes(uploadSpeed)}/s` : '-'}
                      </span>
                    </div>
                  </div>
                )}

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

        {currentPage === 'favorites' && (
          <div style={styles.page}>
            <section style={styles.section}>
              <h2 style={styles.sectionTitle}>お気に入り</h2>
              {renderEpisodeGrid(
                filteredEpisodes.filter((ep) => favorites.has(ep.id)),
                'お気に入りがまだありません',
                <Heart size={48} style={{ color: '#d1d5db' }} />
              )}
            </section>
          </div>
        )}

        {currentPage === 'playlist' && (
          <div style={styles.page}>
            {(() => {
              const currentPl = playlists.find((p) => p.id === selectedPlaylistId);
              if (!currentPl) return null;
              const plEpisodes = filteredEpisodes.filter((ep) => currentPl.episodeIds.includes(ep.id));

              return (
                <section style={styles.section}>
                  <div style={styles.playlistTitleContainer}>
                    <div style={{ ...styles.playlistColorBadge, backgroundColor: currentPl.color }} />
                    <h2 style={{ ...styles.sectionTitle, margin: 0 }}>{currentPl.name}</h2>
                  </div>
                  {renderEpisodeGrid(
                    plEpisodes,
                    'このプレイリストにはまだエピソードがありません',
                    <ListPlus size={48} style={{ color: '#d1d5db' }} />
                  )}
                </section>
              );
            })()}
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
          <div style={styles.miniPlayer} onClick={handleExpandPlayer}>
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

        {/* 拡張プレイヤー（文字起こし表示機能付き2カラム版） */}
        {playerExpanded && currentEpisode && (
          <div style={styles.expandedPlayer} className="animate-slide-up">
            <button onClick={() => setPlayerExpanded(false)} style={styles.collapseBtn}>
              <X size={24} />
            </button>

            <div className="player-layout">
              {/* 左パネル: プレイヤーコントロール */}
              <div className="player-left-panel" style={styles.expandedPlayerContent}>
                <div style={styles.albumArt}>
                  <Music size={96} style={{ color: '#4f46e5' }} />
                </div>

                <h2 style={styles.expandedPlayerTitle}>{currentEpisode.title}</h2>
                {currentEpisode.description && <p style={styles.expandedPlayerDesc}>{currentEpisode.description}</p>}

                <div style={styles.progressSection}>
                  <input
                    type="range"
                    min="0"
                    max={duration || 0}
                    value={currentTime}
                    onChange={handleSeek}
                    style={styles.playerRangeInput}
                  />
                  <div style={styles.timeDisplay}>
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>

                <div style={styles.playerControls}>
                  <button
                    onClick={() => setIsShuffle(!isShuffle)}
                    style={{
                      ...styles.controlButton,
                      ...(isShuffle ? styles.controlButtonActive : {}),
                    }}
                  >
                    <Shuffle size={24} />
                  </button>

                  <button onClick={playPrev} style={styles.controlButton}>
                    <SkipBack size={24} />
                  </button>

                  <button onClick={togglePlayPause} style={styles.playButtonLarge}>
                    {isPlaying ? <Pause size={32} /> : <Play size={32} />}
                  </button>

                  <button onClick={playNext} style={styles.controlButton}>
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
                    {repeatMode === 'one' ? <Repeat1 size={24} /> : <Repeat size={24} />}
                  </button>
                </div>

                <p style={styles.repeatModeLabel}>
                  {repeatMode === 'none' && 'リピート: オフ'}
                  {repeatMode === 'all' && 'リピート: すべて'}
                  {repeatMode === 'one' && 'リピート: 1曲'}
                </p>
              </div>

              {/* 右パネル: 文字起こし表示コンポーネント */}
              <div className="player-right-panel">
                <div style={styles.transcriptHeader}>
                  <MessageSquare size={18} style={{ color: '#4f46e5' }} />
                  <span style={styles.transcriptHeaderTitle}>AI文字起こし (話者分離)</span>
                </div>

                <div style={styles.transcriptScrollArea}>
                  {currentEpisode.transcriptStatus === 'completed' && currentEpisode.transcript ? (
                    currentEpisode.transcript.map((item, index) => {
                      const isActive = currentMs >= item.start && currentMs <= item.end;
                      return (
                        <div
                          key={index}
                          onClick={() => handleTranscriptClick(item.start)}
                          className={`transcript-row ${isActive ? 'transcript-active' : ''}`}
                          style={styles.transcriptUtterance}
                        >
                          <div style={styles.transcriptMeta}>
                            <span
                              style={{
                                ...styles.transcriptSpeaker,
                                color: item.speaker === 'A' ? '#4f46e5' : item.speaker === 'B' ? '#10b981' : '#f59e0b',
                              }}
                            >
                              話者 {item.speaker}
                            </span>
                            <span style={styles.transcriptTimeStamp}>{formatTime(item.start / 1000)}</span>
                          </div>
                          <p style={styles.transcriptText}>{item.text}</p>
                        </div>
                      );
                    })
                  ) : (
                    <div style={styles.transcriptStatusBox}>
                      {currentEpisode.transcriptStatus === 'processing' && (
                        <div style={{ textAlign: 'center' }}>
                          <div className="animate-pulse" style={{ color: '#1e40af', fontWeight: '500' }}>AI文字起こしを作成中...</div>
                          <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.5rem' }}>音声の長さによって数分かかる場合があります。</p>
                        </div>
                      )}
                      {currentEpisode.transcriptStatus === 'pending' && '文字起こしのキューを待機しています...'}
                      {currentEpisode.transcriptStatus === 'failed' && '🚨 文字起こし処理に失敗しました。'}
                      {(currentEpisode.transcriptStatus === 'none' || !currentEpisode.transcriptStatus) && (
                        <p style={{ color: '#6b7280' }}>文字起こしデータがありません。</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  // ... (既存のスタイル群はすべて保持)
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
  },
  sidebarTitle: {
    fontSize: '1.5rem',
    fontWeight: '700',
    margin: 0,
    color: '#1f2937',
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
  },
  mainContent: {
    marginLeft: '250px',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
    paddingBottom: '150px',
  },
  hamburgerBtn: {
    display: 'none',
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
  playlistTitleContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '1.5rem',
  },
  playlistColorBadge: {
    width: '6px',
    height: '24px',
    borderRadius: '4px',
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
  playlistDropdownMenu: {
    position: 'absolute',
    bottom: '45px',
    right: 0,
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    padding: '0.75rem',
    zIndex: 300,
    minWidth: '160px',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  dropdownMenuTitle: {
    margin: '0 0 0.5rem 0',
    fontSize: '0.8rem',
    fontWeight: 'bold',
    color: '#6b7280',
  },
  dropdownItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    cursor: 'pointer',
    padding: '0.25rem 0',
    userSelect: 'none',
  },
  dropdownItemText: {
    fontSize: '0.85rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: '#374151',
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
    zIndex: 250,
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
    zIndex: 300,
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
  playerRangeInput: {
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
  deleteBtn: {
    width: '36px',
    height: '36px',
    padding: '0.5rem',
    backgroundColor: '#f3f4f6',
    color: '#ef4444',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  progressContainer: {
    marginTop: '1.5rem',
    marginBottom: '1.5rem',
  },
  progressBarContainer: {
    width: '100%',
    height: '8px',
    backgroundColor: '#e5e7eb',
    borderRadius: '4px',
    overflow: 'hidden',
    marginBottom: '1rem',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4f46e5',
    transition: 'width 0.3s ease',
  },
  progressInfo: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.875rem',
    color: '#6b7280',
    fontFamily: 'monospace',
  },

  /* 追記した文字起こし関連スタイル */
  badge: {
    display: 'inline-block',
    padding: '0.25rem 0.5rem',
    fontSize: '0.75rem',
    fontWeight: '600',
    borderRadius: '4px',
  },
  transcriptHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '1rem',
    borderBottom: '1px solid #e5e7eb',
    backgroundColor: '#fff',
  },
  transcriptHeaderTitle: {
    fontSize: '0.9rem',
    fontWeight: '600',
    color: '#374151',
  },
  transcriptScrollArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  transcriptUtterance: {
    padding: '0.75rem 1rem',
    borderRadius: '8px',
    backgroundColor: '#fff',
    borderLeft: '4px solid #e5e7eb',
    cursor: 'pointer',
    textAlign: 'left',
  },
  transcriptMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.25rem',
  },
  transcriptSpeaker: {
    fontSize: '0.8rem',
    fontWeight: 'bold',
  },
  transcriptTimeStamp: {
    fontSize: '0.75rem',
    color: '#9ca3af',
    fontFamily: 'monospace',
  },
  transcriptText: {
    fontSize: '0.9rem',
    color: '#374151',
    margin: 0,
    lineHeight: '1.5',
  },
  transcriptStatusBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: '#6b7280',
    padding: '2rem',
  },
};
