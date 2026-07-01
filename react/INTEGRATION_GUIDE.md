// RadioApp.jsx への統合修正ガイド
// 以下の修正を apply してください。

// ============ インポート追加 ============
import { useAuth } from './AuthProvider';
import { UserMenu } from './UserMenu';
import { EditEpisodeModal } from './EditEpisodeModal';

// ============ コンポーネント内で useAuth を使用 ============
export default function RadioApp() {
  const { isAdmin, logout } = useAuth();
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingEpisode, setEditingEpisode] = useState(null);

  // ============ アップロードエンドポイントの修正 ============
  // 既存の handleUpload 関数内で、POST リクエストを送信する部分を以下に変更：
  
  const handleUpload = async () => {
    if (!isAdmin) {
      alert('管理者のみアップロード可能です');
      return;
    }

    if (!uploadFile || !episodeTitle.trim()) {
      alert('ファイルとタイトルを入力してください');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setUploadSpeed(0);

    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('title', episodeTitle);
    formData.append('description', episodeDesc);

    const xhr = new XMLHttpRequest();
    uploadStartTimeRef.current = Date.now();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percentComplete = Math.round((e.loaded / e.total) * 100);
        setUploadProgress(percentComplete);
        setUploadedSize(e.loaded);

        const elapsedSeconds = (Date.now() - uploadStartTimeRef.current) / 1000;
        if (elapsedSeconds > 0) {
          const speedBytesPerSecond = e.loaded / elapsedSeconds;
          const speedMbPerSecond = speedBytesPerSecond / (1024 * 1024);
          setUploadSpeed(speedMbPerSecond);
        }
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        const newEpisode = JSON.parse(xhr.responseText);
        setEpisodes([newEpisode, ...episodes]);
        setUploadFile(null);
        setEpisodeTitle('');
        setEpisodeDesc('');
        setUploadProgress(0);
        setUploading(false);
      } else {
        alert('アップロードに失敗しました');
        setUploading(false);
      }
    });

    xhr.addEventListener('error', () => {
      alert('ネットワークエラーが発生しました');
      setUploading(false);
    });

    xhr.open('POST', '/api/upload', true);
    xhr.send(formData);
  };

  // ============ 削除機能の修正 ============
  const handleDeleteEpisode = async (id) => {
    if (!isAdmin) {
      alert('管理者のみ削除可能です');
      return;
    }

    if (!confirm('本当に削除しますか？')) return;

    try {
      const res = await fetch(`/api/episodes/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setEpisodes(episodes.filter(ep => ep.id !== id));
      } else {
        alert('削除に失敗しました');
      }
    } catch (error) {
      alert('エラーが発生しました: ' + error.message);
    }
  };

  // ============ UI 更新部分 ============
  // sidebar のヘッダーに UserMenu を追加：
  
  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className={`...既存のスタイル... ${sidebarOpen ? 'w-64' : 'w-20'}`}>
        {/* ロゴエリア */}
        <div className="p-4 border-b border-gray-300 flex items-center justify-between">
          {sidebarOpen && <h1 className="...">超かぐや姫ラジオ</h1>}
          <UserMenu /> {/* ここに追加 */}
        </div>

        {/* 既存のナビゲーション... */}
      </div>

      {/* メインコンテンツ */}
      <div className="flex-1 flex flex-col">
        {/* 既存のコンテンツ */}
        
        {/* アップロード区間 - 管理者のみ表示 */}
        {isAdmin && currentPage === 'upload' && (
          <div className="...">
            {/* 既存のアップロードUI */}
          </div>
        )}

        {/* エピソード一覧 */}
        {filteredEpisodes.map(episode => (
          <div key={episode.id} className="...">
            {/* エピソード情報 */}
            
            {/* 管理者のみ：編集・削除ボタン */}
            {isAdmin && (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setEditingEpisode(episode);
                    setShowEditModal(true);
                  }}
                  className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
                >
                  編集
                </button>
                <button
                  onClick={() => handleDeleteEpisode(episode.id)}
                  className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
                >
                  削除
                </button>
              </div>
            )}
          </div>
        ))}

        {/* 編集モーダル */}
        {showEditModal && editingEpisode && (
          <EditEpisodeModal
            episode={editingEpisode}
            onClose={() => setShowEditModal(false)}
            onSave={() => {
              fetchEpisodes();
              setShowEditModal(false);
            }}
          />
        )}
      </div>
    </div>
  );
}

// ============ 完全な統合のために ============
// 1. npm install
// 2. .env ファイルに Google OAuth 認証情報と許可メール設定を追加
// 3. Google Cloud Console で OAuth 2.0 クライアント ID を作成
// 4. localhost:3001/auth/google にアクセステスト
