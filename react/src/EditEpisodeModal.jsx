import React, { useState } from 'react';
import { X, Save, Edit2, MessageSquare, Image, Loader } from 'lucide-react';

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

  // 文字起こしの話者単位で編集
  const handleTranscriptChange = (index, field, value) => {
    const updated = [...transcript];
    updated[index] = { ...updated[index], [field]: value };
    setTranscript(updated);
  };

  // スライドショー画像のパスを更新
  const handleSlideshowChange = (index, field, value) => {
    const updated = [...slideshow];
    updated[index] = { ...updated[index], [field]: value };
    setSlideshow(updated);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-96 overflow-hidden flex flex-col">
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-bold text-gray-900">エピソード編集</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* タブ */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('info')}
            className={`flex-1 py-2 px-4 text-center font-medium transition-colors ${
              activeTab === 'info'
                ? 'border-b-2 border-indigo-600 text-indigo-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Edit2 className="w-4 h-4 inline mr-2" />
            情報
          </button>
          <button
            onClick={() => setActiveTab('transcript')}
            className={`flex-1 py-2 px-4 text-center font-medium transition-colors ${
              activeTab === 'transcript'
                ? 'border-b-2 border-indigo-600 text-indigo-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <MessageSquare className="w-4 h-4 inline mr-2" />
            文字起こし
          </button>
          <button
            onClick={() => setActiveTab('slideshow')}
            className={`flex-1 py-2 px-4 text-center font-medium transition-colors ${
              activeTab === 'slideshow'
                ? 'border-b-2 border-indigo-600 text-indigo-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Image className="w-4 h-4 inline mr-2" />
            スライド
          </button>
        </div>

        {/* コンテンツ */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* 情報タブ */}
          {activeTab === 'info' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  タイトル
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  説明
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>
            </div>
          )}

          {/* 文字起こしタブ */}
          {activeTab === 'transcript' && (
            <div className="space-y-3">
              {transcript.length === 0 ? (
                <p className="text-gray-500 text-sm">文字起こしデータはまだありません</p>
              ) : (
                transcript.map((utterance, idx) => (
                  <div key={idx} className="p-3 bg-gray-50 rounded">
                    <div className="flex gap-2 mb-2">
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          話者
                        </label>
                        <input
                          type="text"
                          value={utterance.speaker || ''}
                          onChange={(e) =>
                            handleTranscriptChange(idx, 'speaker', e.target.value)
                          }
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          開始時間（ms）
                        </label>
                        <input
                          type="number"
                          value={utterance.start || 0}
                          onChange={(e) =>
                            handleTranscriptChange(idx, 'start', parseInt(e.target.value))
                          }
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          終了時間（ms）
                        </label>
                        <input
                          type="number"
                          value={utterance.end || 0}
                          onChange={(e) =>
                            handleTranscriptChange(idx, 'end', parseInt(e.target.value))
                          }
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        テキスト
                      </label>
                      <textarea
                        value={utterance.text || ''}
                        onChange={(e) =>
                          handleTranscriptChange(idx, 'text', e.target.value)
                        }
                        rows={2}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* スライドショータブ */}
          {activeTab === 'slideshow' && (
            <div className="space-y-3">
              {slideshow.length === 0 ? (
                <p className="text-gray-500 text-sm">スライドショーデータはまだありません</p>
              ) : (
                slideshow.map((slide, idx) => (
                  <div key={idx} className="p-3 bg-gray-50 rounded">
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      スライド {idx + 1}
                    </label>
                    {slide.image && (
                      <img
                        src={slide.image}
                        alt={`Slide ${idx + 1}`}
                        className="w-full h-40 object-cover rounded mb-2"
                      />
                    )}
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="画像URL"
                        value={slide.image || ''}
                        onChange={(e) => handleSlideshowChange(idx, 'image', e.target.value)}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      />
                      <input
                        type="number"
                        placeholder="開始時間（ms）"
                        value={slide.time || 0}
                        onChange={(e) =>
                          handleSlideshowChange(idx, 'time', parseInt(e.target.value))
                        }
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      />
                      <textarea
                        placeholder="キャプション"
                        value={slide.caption || ''}
                        onChange={(e) => handleSlideshowChange(idx, 'caption', e.target.value)}
                        rows={2}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="border-t p-4 bg-gray-50 flex justify-end gap-2">
          {error && <p className="text-sm text-red-600 flex-1">{error}</p>}
          {success && <p className="text-sm text-green-600 flex-1">{success}</p>}
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 transition-colors flex items-center gap-2"
          >
            {isSaving && <Loader className="w-4 h-4 animate-spin" />}
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
