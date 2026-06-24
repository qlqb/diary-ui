import  {diaryAPI} from "./api/api.js";
import { useState } from 'react';

/**
 * 일기 작성/수정 에디터
 */
function DiaryEditorView({ diary, onSave, onCancel }) {
  const isEditMode = !!diary;

  const [formData, setFormData] = useState({
    writtenDate: diary?.writtenDate || new Date().toISOString().split('T')[0],
    title: diary?.title || '',
    content: diary?.content || '',
    mood: diary?.mood || 'NEUTRAL',
    weather: diary?.weather || '',
    visibility: diary?.visibility || 'PRIVATE',
  });

  const [loading, setLoading] = useState(false);
  const [showRevisions, setShowRevisions] = useState(false);
  const [revisions, setRevisions] = useState(null);

  // 수정 이력 로드
  const loadRevisions = async () => {
    if (!isEditMode) return;

    try {
      const data = await diaryAPI.getRevisions(diary.diaryId);
      setRevisions(data);
      setShowRevisions(true);
    } catch (error) {
      alert('수정 이력을 불러오는데 실패했습니다: ' + error.message);
    }
  };

  // 수정 이력 복구
  const handleRestoreRevision = async (revisionId) => {
    if (!confirm('이 버전으로 복구하시겠습니까?')) return;

    try {
      await diaryAPI.restoreRevision(diary.diaryId, revisionId);
      alert('복구되었습니다');
      onSave();
    } catch (error) {
      alert('복구에 실패했습니다: ' + error.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.title.trim() || !formData.content.trim()) {
      alert('제목과 내용을 입력해주세요');
      return;
    }

    setLoading(true);

    try {
      if (isEditMode) {
        await diaryAPI.updateDiary(diary.diaryId, formData);
        alert('수정되었습니다');
      } else {
        await diaryAPI.createDiary(formData);
        alert('작성되었습니다');
      }
      onSave();
    } catch (error) {
      alert('저장에 실패했습니다: ' + error.message);
    }

    setLoading(false);
  };

  return (
    <div className="diary-editor-view">
      <h2>{isEditMode ? '일기 수정' : '새 일기 작성'}</h2>

      {isEditMode && (
        <button
          className="revisions-button"
          onClick={loadRevisions}
        >
          📜 수정 이력 보기
        </button>
      )}

      <form onSubmit={handleSubmit} className="diary-form">
        <div className="form-group">
          <label>날짜</label>
          <input
            type="date"
            value={formData.writtenDate}
            onChange={(e) => setFormData({ ...formData, writtenDate: e.target.value })}
            required
          />
        </div>

        <div className="form-group">
          <label>제목</label>
          <input
            type="text"
            placeholder="제목을 입력하세요"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            required
          />
        </div>

        <div className="form-group">
          <label>기분</label>
          <div className="mood-selector">
            {[
              { value: 'HAPPY', label: '😊 행복', emoji: '😊' },
              { value: 'NEUTRAL', label: '😌 평온', emoji: '😌' },
              { value: 'SAD', label: '😢 우울', emoji: '😢' },
              { value: 'EXCITED', label: '🤩 신남', emoji: '🤩' },
            ].map(mood => (
              <button
                key={mood.value}
                type="button"
                className={formData.mood === mood.value ? 'active' : ''}
                onClick={() => setFormData({ ...formData, mood: mood.value })}
              >
                {mood.label}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>날씨 (선택)</label>
          <input
            type="text"
            placeholder="예: 맑음, 비, 흐림"
            value={formData.weather}
            onChange={(e) => setFormData({ ...formData, weather: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label>내용</label>
          <textarea
            placeholder="오늘의 이야기를 들려주세요..."
            value={formData.content}
            onChange={(e) => setFormData({ ...formData, content: e.target.value })}
            rows="15"
            required
          />
        </div>

        <div className="form-group">
          <label>공개 범위</label>
          <select
            value={formData.visibility}
            onChange={(e) => setFormData({ ...formData, visibility: e.target.value })}
          >
            <option value="PRIVATE">🔒 비공개</option>
            <option value="PUBLIC">🌍 공개</option>
          </select>
        </div>

        <div className="form-actions">
          <button type="submit" disabled={loading}>
            {loading ? '저장 중...' : (isEditMode ? '수정하기' : '작성하기')}
          </button>
          <button type="button" onClick={onCancel}>
            취소
          </button>
        </div>
      </form>

      {/* 수정 이력 모달 */}
      {showRevisions && revisions && (
        <div className="modal-overlay" onClick={() => setShowRevisions(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>수정 이력 ({revisions.totalRevisions}개)</h3>

            <div className="revisions-list">
              <div className="revision-item current">
                <div className="revision-header">
                  <strong>현재 버전</strong>
                  <span>{new Date(revisions.current.updatedAt).toLocaleString()}</span>
                </div>
                <p>{revisions.current.title}</p>
              </div>

              {revisions.revisions.map((revision) => (
                <div key={revision.revisionId} className="revision-item">
                  <div className="revision-header">
                    <span>{new Date(revision.editedAt).toLocaleString()}</span>
                    <button onClick={() => handleRestoreRevision(revision.revisionId)}>
                      복구
                    </button>
                  </div>
                  <p>{revision.title}</p>
                  <p className="revision-preview">{revision.content.substring(0, 100)}...</p>
                </div>
              ))}
            </div>

            <button onClick={() => setShowRevisions(false)}>닫기</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default DiaryEditorView