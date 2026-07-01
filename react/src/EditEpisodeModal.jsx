import React, { useState } from 'react';
import { X, Save, Edit2, MessageSquare, Image, Loader, Plus, Trash2 } from 'lucide-react';

export function EditEpisodeModal({ episode, onClose, onSave }) {
  const [activeTab, setActiveTab] = useState('info'); // info, transcript, slideshow
  const [title, setTitle] = useState(episode.title);
  const [description, setDescription] = useState(episode.description || '');
  const [transcript, setTranscript] = useState(
    Array.isArray(episode.transcript) ? episode.transcript : []
  );
  const [slideshow, setSlideshow] = useState(episode.slideshowConfig || []);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // 保存処理
  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      let endpoint = `/api/episodes/${episode.id}`;
      let method = 'PATCH';
      let body = {};

      if (activeTab === 'info') {
        body = { title, description };
      } else if (activeTab === 'transcript') {
        endpoint = `/api/episodes/${episode.id}/transcript`;
        method = 'PUT';
        body = { transcript };
      } else if (activeTab === 'slideshow') {
        endpoint = `/api/episodes/${episode.id}/slideshow`;
        method = 'POST';
        body = { slideshowConfig: slideshow };
      }

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || '保存に失敗しました');
      }

      setSuccess('保存しました');
      setTimeout(() => {
        onSave();
      }, 1000);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // 文字起こしの更新・追加・削除
  const handleTranscriptChange = (index, field, value) => {
    const updated = [...transcript];
    updated[index] = { ...updated[index], [field]: value };
    setTranscript(updated);
  };

  const addTranscriptItem = () => {
    setTranscript([...transcript, { speaker: '', start: 0, end: 0, text: '' }]);
  };

  const removeTranscriptItem = (index) => {
    setTranscript(transcript.filter((_, i) => i !== index));
  };

  // スライドショーの更新・追加・削除
  const handleSlideshowChange = (index, field, value) => {
    const updated = [...slideshow];
    updated[index] = { ...updated[index], [field]: value };
    setSlideshow(updated);
  };

  const addSlideshowItem = () => {
    setSlideshow([...slideshow, { image: '', time: 0, caption: '' }]);
  };

  const removeSlideshowItem = (index) => {
    setSlideshow(slideshow.filter((_, i) => i !== index));
  };

  return (
    <div style={modalStyles.overlay}>
      <div style={modalStyles.container}>
        
        {/* ヘッダー */}
        <div style={modalStyles.header}>
          <div>
            <h2 style={modalStyles.headerTitle}>エピソード編集</h2>
            <p style={modalStyles.headerSubtitle}>元のタイトル: {episode.title}</p>
          </div>
          <button onClick={onClose} style={modalStyles.closeButton}>
            <X size={20} />
          </button>
        </div>

        {/* タブメニュー */}
        <div style={modalStyles.tabBar}>
          {[
            { id: 'info', label: '基本情報', icon: Edit2 },
            { id: 'transcript', label: '文字起こし', icon: MessageSquare },
            { id: 'slideshow', label: 'スライドショー', icon: Image },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  ...modalStyles.tabButton,
                  ...(isActive ? modalStyles.tabButtonActive : {}),
                }}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* メインスクロールエリア */}
        <div style={modalStyles.scrollArea}>
          
          {/* 1. 基本情報 */}
          {activeTab === 'info' && (
            <div style={{ maxWidth: '600px' }}>
              <div style={modalStyles.formGroup}>
                <label style={modalStyles.label}>タイトル</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  style={modalStyles.input}
                  placeholder="タイトルを入力してください"
                />
              </div>
              <div style={modalStyles.formGroup}>
                <label style={modalStyles.label}>説明文</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={6}
                  style={modalStyles.textarea}
                  placeholder="エピソードの説明文を入力してください"
                />
              </div>
            </div>
          )}

          {/* 2. 文字起こし */}
          {activeTab === 'transcript' && (
            <div>
              <div style={modalStyles.subHeaderActions}>
                <span style={modalStyles.countBadge}>セグメント数: {transcript.length} 件</span>
                <button onClick={addTranscriptItem} style={modalStyles.addButton}>
                  <Plus size={14} /> 行を追加
                </button>
              </div>

              {transcript.length === 0 ? (
                <div style={modalStyles.emptyState}>
                  <MessageSquare size={32} color="#d1d5db" />
                  <p style={{ margin: '0.5rem 0 0', color: '#9ca3af' }}>文字起こしデータはありません</p>
                </div>
              ) : (
                <div style={modalStyles.itemsList}>
                  {transcript.map((utterance, idx) => (
                    <div key={idx} style={modalStyles.cardItem}>
                      <button
                        onClick={() => removeTranscriptItem(idx)}
                        style={modalStyles.cardDeleteButton}
                        title="この行を削除"
                      >
                        <Trash2 size={16} />
                      </button>

                      <div style={modalStyles.flexGrid3}>
                        <div style={modalStyles.gridCol}>
                          <label style={modalStyles.cardLabel}>話者</label>
                          <input
                            type="text"
                            value={utterance.speaker || ''}
                            onChange={(e) => handleTranscriptChange(idx, 'speaker', e.target.value)}
                            style={modalStyles.cardInput}
                          />
                        </div>
                        <div style={modalStyles.gridCol}>
                          <label style={modalStyles.cardLabel}>開始時間 (ms)</label>
                          <input
                            type="number"
                            value={utterance.start ?? ''}
                            onChange={(e) => handleTranscriptChange(idx, 'start', e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                            style={modalStyles.cardInput}
                          />
                        </div>
                        <div style={modalStyles.gridCol}>
                          <label style={modalStyles.cardLabel}>終了時間 (ms)</label>
                          <input
                            type="number"
                            value={utterance.end ?? ''}
                            onChange={(e) => handleTranscriptChange(idx, 'end', e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                            style={modalStyles.cardInput}
                          />
                        </div>
                      </div>

                      <div style={{ marginTop: '0.75rem' }}>
                        <label style={modalStyles.cardLabel}>テキスト</label>
                        <textarea
                          value={utterance.text || ''}
                          onChange={(e) => handleTranscriptChange(idx, 'text', e.target.value)}
                          rows={2}
                          style={modalStyles.cardTextarea}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 3. スライドショー */}
          {activeTab === 'slideshow' && (
            <div>
              <div style={modalStyles.subHeaderActions}>
                <span style={modalStyles.countBadge}>スライド数: {slideshow.length} 枚</span>
                <button onClick={addSlideshowItem} style={modalStyles.addButton}>
                  <Plus size={14} /> スライドを追加
                </button>
              </div>

              {slideshow.length === 0 ? (
                <div style={modalStyles.emptyState}>
                  <Image size={32} color="#d1d5db" />
                  <p style={{ margin: '0.5rem 0 0', color: '#9ca3af' }}>スライドデータはありません</p>
                </div>
              ) : (
                <div style={modalStyles.slideGrid}>
                  {slideshow.map((slide, idx) => (
                    <div key={idx} style={modalStyles.slideCard}>
                      <button
                        onClick={() => removeSlideshowItem(idx)}
                        style={modalStyles.cardDeleteButton}
                        title="スライドを削除"
                      >
                        <Trash2 size={16} />
                      </button>

                      <div style={modalStyles.imagePreviewContainer}>
                        {slide.image ? (
                          <img
                            src={slide.image}
                            alt={`Slide ${idx + 1}`}
                            style={modalStyles.imagePreview}
                            onError={(e) => { e.target.src = 'https://placehold.co/600x400?text=Invalid+URL'; }}
                          />
                        ) : (
                          <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>画像URL未設定</span>
                        )}
                        <span style={modalStyles.imageBadge}>Slide {idx + 1}</span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
                        <div>
                          <label style={modalStyles.cardLabel}>画像URL</label>
                          <input
                            type="text"
                            placeholder="https://..."
                            value={slide.image || ''}
                            onChange={(e) => handleSlideshowChange(idx, 'image', e.target.value)}
                            style={modalStyles.cardInput}
                          />
                        </div>
                        <div>
                          <label style={modalStyles.cardLabel}>表示タイミング (ms)</label>
                          <input
                            type="number"
                            placeholder="0"
                            value={slide.time ?? ''}
                            onChange={(e) => handleSlideshowChange(idx, 'time', e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                            style={modalStyles.cardInput}
                          />
                        </div>
                        <div>
                          <label style={modalStyles.cardLabel}>キャプション</label>
                          <textarea
                            placeholder="スライドの説明"
                            value={slide.caption || ''}
                            onChange={(e) => handleSlideshowChange(idx, 'caption', e.target.value)}
                            rows={2}
                            style={modalStyles.cardTextarea}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* フッター */}
        <div style={modalStyles.footer}>
          <div style={modalStyles.statusMessage}>
            {error && <span style={{ color: '#ef4444', fontWeight: '500' }}>⚠️ {error}</span>}
            {success && <span style={{ color: '#10b981', fontWeight: '500' }}>✨ {success}</span>}
          </div>
          
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={onClose} style={modalStyles.cancelButton}>
              キャンセル
            </button>
            <button onClick={handleSave} disabled={isSaving} style={modalStyles.saveButton}>
              {isSaving ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={16} />}
              {activeTab === 'info' ? '基本情報を保存' : activeTab === 'transcript' ? '文字起こしを保存' : 'スライドを保存'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

// RadioAppの世界観（フォント、カラー、影、配置）に完全同期させたインラインスタイル
const modalStyles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
    backdropFilter: 'blur(3px)',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  container: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    width: '92%',
    maxWidth: '840px',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    border: '1px solid #e5e7eb',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '1.25rem 1.5rem',
    borderBottom: '1px solid #e5e7eb',
    backgroundColor: '#f9fafb',
  },
  headerTitle: {
    fontSize: '1.2rem',
    fontWeight: '700',
    margin: 0,
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: '0.75rem',
    color: '#6b7280',
    margin: '0.2rem 0 0 0',
  },
  closeButton: {
    background: 'none',
    border: 'none',
    color: '#9ca3af',
    cursor: 'pointer',
    padding: '0.4rem',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.2s',
    ':hover': { backgroundColor: '#f3f4f6', color: '#374151' } // 注: Reactインラインでは擬似クラスは効かないため綺麗さ重視の基本色
  },
  tabBar: {
    display: 'flex',
    borderBottom: '1px solid #e5e7eb',
    backgroundColor: '#f9fafb',
    padding: '0 0.75rem',
    gap: '0.25rem',
  },
  tabButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.85rem 1.25rem',
    fontSize: '0.875rem',
    fontWeight: '500',
    color: '#6b7280',
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  tabButtonActive: {
    color: '#4f46e5',
    borderBottom: '2px solid #4f46e5',
    fontWeight: '600',
    backgroundColor: '#fff',
  },
  scrollArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '1.5rem',
    backgroundColor: '#fff',
  },
  formGroup: {
    marginBottom: '1.25rem',
  },
  label: {
    display: 'block',
    fontSize: '0.85rem',
    fontWeight: '600',
    color: '#374151',
    marginBottom: '0.4rem',
  },
  input: {
    width: '100%',
    padding: '0.6rem 0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '0.9rem',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  },
  textarea: {
    width: '100%',
    padding: '0.6rem 0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '0.9rem',
    outline: 'none',
    boxSizing: 'border-box',
    resize: 'none',
    fontFamily: 'inherit',
  },
  subHeaderActions: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f5f3ff',
    padding: '0.6rem 1rem',
    borderRadius: '8px',
    border: '1px solid #e0e7ff',
    marginBottom: '1rem',
  },
  countBadge: {
    fontSize: '0.75rem',
    fontWeight: '600',
    color: '#4f46e5',
  },
  addButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.35rem',
    fontSize: '0.75rem',
    fontWeight: '600',
    color: '#4f46e5',
    backgroundColor: '#fff',
    border: '1px solid #c7d2fe',
    padding: '0.4rem 0.75rem',
    borderRadius: '6px',
    cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4rem 0',
    border: '2px dashed #e5e7eb',
    borderRadius: '10px',
    textAlign: 'center',
    fontSize: '0.85rem',
  },
  itemsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  cardItem: {
    position: 'relative',
    padding: '1.25rem',
    backgroundColor: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: '10px',
  },
  cardDeleteButton: {
    position: 'absolute',
    top: '0.75rem',
    right: '0.75rem',
    background: 'none',
    border: 'none',
    color: '#9ca3af',
    cursor: 'pointer',
    padding: '0.25rem',
    borderRadius: '4px',
  },
  flexGrid3: {
    display: 'flex',
    gap: '0.75rem',
    flexWrap: 'wrap',
    paddingRight: '1.5rem',
  },
  gridCol: {
    flex: '1 1 160px',
    display: 'flex',
    flexDirection: 'column',
  },
  cardLabel: {
    fontSize: '0.7rem',
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '0.25rem',
  },
  cardInput: {
    padding: '0.45rem 0.6rem',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '0.85rem',
    backgroundColor: '#fff',
    outline: 'none',
  },
  cardTextarea: {
    width: '100%',
    padding: '0.45rem 0.6rem',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '0.85rem',
    backgroundColor: '#fff',
    outline: 'none',
    resize: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  },
  slideGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: '1rem',
  },
  slideCard: {
    position: 'relative',
    padding: '1rem',
    backgroundColor: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: '10px',
    display: 'flex',
    flexDirection: 'column',
  },
  imagePreviewContainer: {
    position: 'relative',
    width: '100%',
    height: '150px',
    backgroundColor: '#e5e7eb',
    borderRadius: '6px',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid #d1d5db',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  imageBadge: {
    position: 'absolute',
    bottom: '0.5rem',
    left: '0.5rem',
    backgroundColor: 'rgba(0,0,0,0.65)',
    color: '#fff',
    fontSize: '0.65rem',
    fontWeight: '600',
    padding: '0.2rem 0.4rem',
    borderRadius: '4px',
  },
  footer: {
    borderTop: '1px solid #e5e7eb',
    padding: '1rem 1.5rem',
    backgroundColor: '#f9fafb',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusMessage: {
    fontSize: '0.85rem',
    flex: 1,
    paddingRight: '1rem',
  },
  cancelButton: {
    padding: '0.55rem 1.25rem',
    fontSize: '0.875rem',
    fontWeight: '500',
    color: '#374151',
    backgroundColor: '#fff',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
  },
  saveButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.55rem 1.25rem',
    fontSize: '0.875rem',
    fontWeight: '500',
    color: '#fff',
    backgroundColor: '#4f46e5',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
  },
};
