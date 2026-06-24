import { useState } from 'react';

/**
 * 일기 카드 컴포넌트
 */
function DiaryCard({ diary, onEdit, onDelete, onToggleFavorite }) {
    const [expanded, setExpanded] = useState(false);

    const moodEmojis = {
        HAPPY: '😊',
        NEUTRAL: '😌',
        SAD: '😢',
        EXCITED: '🤩',
    };

    return (
        <div className="diary-card">
            <div className="diary-card-header">
                <div className="diary-meta">
                    <span className="mood">{moodEmojis[diary.mood] || '📝'}</span>
                    <h3>{diary.title}</h3>
                    {diary.isFavorite && <span className="favorite">⭐</span>}
                </div>
                <span className="date">{diary.writtenDate}</span>
            </div>

            <div className="diary-card-content">
                <p className={expanded ? 'expanded' : 'collapsed'}>
                    {diary.content}
                </p>
                {diary.content.length > 100 && (
                    <button
                        className="expand-button"
                        onClick={() => setExpanded(!expanded)}
                    >
                        {expanded ? '접기' : '더보기'}
                    </button>
                )}
            </div>

            <div className="diary-card-actions">
                <button onClick={onToggleFavorite}>
                    {diary.isFavorite ? '⭐ 즐겨찾기 해제' : '☆ 즐겨찾기'}
                </button>
                <button onClick={onEdit}>수정</button>
                <button onClick={onDelete} className="danger">삭제</button>
            </div>
        </div>
    );
}

export default DiaryCard