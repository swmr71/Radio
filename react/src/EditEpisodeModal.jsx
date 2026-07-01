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

  // タブ別の保存処理
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

  // 文字起こしの更新
  const handleTranscriptChange = (index, field, value) => {
    const updated = [...transcript];
    updated[index] = { ...updated[index], [field]: value };
    setTranscript(updated);
  };

  // 文字起こしの追加・削除
  const addTranscriptItem = () => {
    setTranscript([...transcript, { speaker: '', start: 0, end: 0, text: '' }]);
  };

  const removeTranscriptItem = (index) => {
    setTranscript(transcript.filter((_, i) => i !== index));
  };

  // スライドショーの更新
  const handleSlideshowChange = (index, field, value) => {
    const updated = [...slideshow];
    updated[index] = { ...updated[index], [field]: value };
    setSlideshow(updated);
  };

  // スライドショーの追加・削除
  const addSlideshowItem = () => {
    setSlideshow([...slideshow, { image: '', time: 0, caption: '' }]);
  };

  const removeSlideshowItem = (index) => {
    setSlideshow(slideshow.filter((_, i) => i !== index));
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      {/* max-h を 85vh に拡張し、横幅も max-w-4xl に広げて視認性を確保 */}
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col border border-gray-100">
        
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-5 border-b bg-gray-50/50">
          <div>
            <h2 className="text-lg font-bold text-gray-900">エピソード編集</h2>
            <p className="text-xs text-gray-500 mt-0.5">元のタイトル: {episode.title}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-200/70 text-gray-500 hover:text-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* タブメニュー */}
        <div className="flex border-b bg-gray-50/30 px-2">
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
                className={`flex items-center gap-2 py-3 px-6 text-sm font-medium border-b-2 transition-all ${
                  isActive
                    ? 'border-indigo-600 text-indigo-600 bg-white -mb-[1px] font-semibold'
                    : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* メインコンテンツ（スクロール領域） */}
        <div className="flex-1 overflow-y-auto p-6 bg-white space-y-6">
          
          {/* 1. 基本情報タブ */}
          {activeTab === 'info' && (
            <div className="space-y-4 max-w-2xl">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  タイトル
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-sm transition-all"
                  placeholder="エピソードのタイトルを入力"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  説明文
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={6}
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-sm transition-all resize-none"
                  placeholder="エピソードの詳細な説明を入力"
                />
              </div>
            </div>
          )}

          {/* 2. 文字起こしタブ */}
          {activeTab === 'transcript' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center bg-indigo-50/50 p-3 rounded-lg border border-indigo-100/50等">
                <span className="text-xs text-gray-500 font-medium">セグメント数: {transcript.length} 件</span>
                <button
                  onClick={addTranscriptItem}
                  className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 bg-white hover:bg-indigo-50 px-3 py-1.5 rounded-md border border-indigo-200 shadow-sm transition-all"
                >
                  <Plus className="w-3.5 h-3.5" /> 行を追加
                </button>
              </div>

              {transcript.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
                  <MessageSquare className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">文字起こしデータがありません</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                  {transcript.map((utterance, idx) => (
                    <div key={idx} className="p-4 bg-gray-50 rounded-xl border border-gray-200/60 relative group">
                      <button
                        onClick={() => removeTranscriptItem(idx)}
                        className="absolute top-3 right-3 p-1 text-gray-400 hover:text-red-500 rounded hover:bg-gray-200/50 opacity-0 group-hover:opacity-100 transition-all"
                        title="この行を削除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3 pr-6">
                        <div>
                          <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">話者</label>
                          <input
                            type="text"
                            value={utterance.speaker || ''}
                            onChange={(e) => handleTranscriptChange(idx, 'speaker', e.target.value)}
                            className="w-full px-2.5 py-1.5 text-sm bg-white border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">開始時間 (ms)</label>
                          <input
                            type="number"
                            value={utterance.start ?? ''}
                            onChange={(e) => handleTranscriptChange(idx, 'start', e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                            className="w-full px-2.5 py-1.5 text-sm bg-white border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">終了時間 (ms)</label>
                          <input
                            type="number"
                            value={utterance.end ?? ''}
                            onChange={(e) => handleTranscriptChange(idx, 'end', e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                            className="w-full px-2.5 py-1.5 text-sm bg-white border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">テキスト</label>
                        <textarea
                          value={utterance.text || ''}
                          onChange={(e) => handleTranscriptChange(idx, 'text', e.target.value)}
                          rows={2}
                          className="w-full px-2.5 py-1.5 text-sm bg-white border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 resize-none"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 3. スライドショータブ */}
          {activeTab === 'slideshow' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center bg-indigo-50/50 p-3 rounded-lg border border-indigo-100/50">
                <span className="text-xs text-gray-500 font-medium">スライド数: {slideshow.length} 枚</span>
                <button
                  onClick={addSlideshowItem}
                  className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 bg-white hover:bg-indigo-50 px-3 py-1.5 rounded-md border border-indigo-200 shadow-sm transition-all"
                >
                  <Plus className="w-3.5 h-3.5" /> スライドを追加
                </button>
              </div>

              {slideshow.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
                  <Image className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">スライドデータがありません</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[50vh] overflow-y-auto pr-1">
                  {slideshow.map((slide, idx) => (
                    <div key={idx} className="p-4 bg-gray-50 rounded-xl border border-gray-200/60 relative group flex flex-col justify-between">
                      <button
                        onClick={() => removeSlideshowItem(idx)}
                        className="absolute top-3 right-3 p-1 text-gray-400 hover:text-red-500 rounded hover:bg-gray-200/50 opacity-0 group-hover:opacity-100 transition-all z-10"
                        title="このスライドを削除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <div className="space-y-3">
                        <div className="relative aspect-video w-full bg-gray-200 rounded-lg overflow-hidden border border-gray-300/40 flex items-center justify-center">
                          {slide.image ? (
                            <img
                              src={slide.image}
                              alt={`Slide ${idx + 1}`}
                              className="w-full h-full object-cover"
                              onError={(e) => { e.target.src = 'https://placehold.co/600x400?text=Invalid+URL'; }}
                            />
                          ) : (
                            <span className="text-xs text-gray-400">画像なし</span>
                          )}
                          <span className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 text-white text-[10px] rounded font-medium">
                            Slide {idx + 1}
                          </span>
                        </div>

                        <div className="space-y-2">
                          <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-0.5">画像URL</label>
                            <input
                              type="text"
                              placeholder="https://..."
                              value={slide.image || ''}
                              onChange={(e) => handleSlideshowChange(idx, 'image', e.target.value)}
                              className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-0.5">表示タイミング (ms)</label>
                            <input
                              type="number"
                              placeholder="0"
                              value={slide.time ?? ''}
                              onChange={(e) => handleSlideshowChange(idx, 'time', e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                              className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-0.5">キャプション</label>
                            <textarea
                              placeholder="スライドの説明文"
                              value={slide.caption || ''}
                              onChange={(e) => handleSlideshowChange(idx, 'caption', e.target.value)}
                              rows={2}
                              className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 resize-none"
                            />
                          </div>
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
        <div className="border-t p-4 bg-gray-50 flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            {error && <p className="text-sm text-red-600 font-medium truncate">⚠️ {error}</p>}
            {success && <p className="text-sm text-green-600 font-medium truncate">✨ {success}</p>}
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
            >
              キャンセル
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 transition-colors flex items-center gap-2 shadow-sm shadow-indigo-100"
            >
              {isSaving ? (
                <Loader className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {activeTab === 'info' ? '基本情報を保存' : activeTab === 'transcript' ? '文字起こしを保存' : 'スライドを保存'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
