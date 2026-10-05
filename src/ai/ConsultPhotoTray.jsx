import { useState } from 'react';
import { Loader2, RotateCcw, X } from 'lucide-react';
import { photoTopicText } from '../lib/studyLabels.js';

const STATUS_TEXT = {
  UPLOADING: '글자를 읽는 중…',
  UNREADABLE: '교재 글자를 찾지 못했어요. 더 밝게, 글자가 크게 보이게 찍어 주세요.',
  FAILED: '읽지 못했어요.',
};

function TopicPicker({ photo, onPick, autoFocus }) {
  return (
    <select
      className="ai-photo-topic-select"
      aria-label="이 사진의 단원"
      autoFocus={autoFocus}
      defaultValue=""
      onChange={(e) => e.target.value && onPick(Number(e.target.value))}
    >
      <option value="" disabled>어느 단원인가요?</option>
      {(photo.topics ?? []).map((t) => (
        <option key={t.topicId} value={t.topicId}>{photoTopicText(t)}</option>
      ))}
    </select>
  );
}

function PhotoTopic({ photo, onPick }) {
  const [changing, setChanging] = useState(false);
  if (photo.link === 'NONE' || !photo.topic) {
    return <TopicPicker photo={photo} onPick={onPick} />;
  }
  if (changing) {
    return <TopicPicker photo={photo} onPick={(id) => { setChanging(false); onPick(id); }} autoFocus />;
  }
  const guessed = photo.link === 'GUESSED';
  return (
    <span className="ai-photo-topic">
      <span className={`chip ${guessed ? 'chip-warn' : 'chip-status'}`}
            title={guessed ? '쪽 번호·단원 제목으로 추정했어요. 맞는지 확인해 주세요.' : '확인한 단원'}>
        {photoTopicText(photo.topic)}{guessed ? ' · 추정' : ''}
      </span>
      {guessed && (
        <button type="button" className="btn-ghost btn-sm" onClick={() => onPick(photo.topic.topicId)}>맞아요</button>
      )}
      <button type="button" className="btn-ghost btn-sm" onClick={() => setChanging(true)}>바꾸기</button>
    </span>
  );
}

/**
 * 상담 입력창 위의 교재 사진 트레이. 장마다 읽기 상태, 단원(추정이면 확인·바꾸기, 없으면 고르기), 읽은 글, 빼기.
 * 보내기 전에만 보인다 — 보낸 사진은 말풍선 아래 칩으로 남는다.
 */
export default function ConsultPhotoTray({ items, notice, onRetry, onRemove, onTopic }) {
  if (items.length === 0 && !notice) return null;
  return (
    <section className="ai-photo-tray" aria-label="붙인 교재 사진">
      <p className="ai-photo-note">사진은 글자를 읽으려고 AI로 보내요 · 원본은 30일 뒤 지워져요(읽은 글은 남아요)</p>
      {notice && <p className="ai-error" role="alert">{notice}</p>}
      <ul className="ai-photo-list">
        {items.map((it, i) => {
          const photo = it.photo;
          const read = it.status === 'READ' && photo;
          return (
            <li key={it.localId} className="ai-photo-item">
              {it.previewUrl
                ? <img className="ai-photo-thumb" src={it.previewUrl} alt={`붙인 사진 ${i + 1}`} />
                : <span className="ai-photo-thumb" aria-hidden="true" />}
              <div className="ai-photo-body">
                {read ? (
                  <>
                    <p className="ai-photo-title">{photo.title}</p>
                    <PhotoTopic photo={photo} onPick={(topicId) => onTopic(it.localId, topicId)} />
                    <details className="ai-photo-text">
                      <summary>읽은 글 보기</summary>
                      <pre>{photo.text}</pre>
                    </details>
                  </>
                ) : (
                  <p className="ai-photo-status" role={it.status === 'UPLOADING' ? 'status' : undefined}>
                    {it.status === 'UPLOADING' && <Loader2 size={13} className="spin" aria-hidden="true" />}
                    {' '}{it.error ?? STATUS_TEXT[it.status] ?? ''}
                  </p>
                )}
                {read && it.error && <p className="ai-error">{it.error}</p>}
                {(it.status === 'FAILED' || it.status === 'ERROR' || it.status === 'UNREADABLE') && (
                  <button type="button" className="btn-ghost btn-sm" onClick={() => onRetry(it.localId)}>
                    <RotateCcw size={12} aria-hidden="true" /> 다시
                  </button>
                )}
              </div>
              <button
                type="button"
                className="btn-ghost ai-photo-remove"
                onClick={() => onRemove(it.localId)}
                aria-label={`사진 ${i + 1} 빼기`}
                disabled={it.status === 'UPLOADING'}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
