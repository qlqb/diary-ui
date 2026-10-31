/**
 * 일회성 약속 목록과 편집.
 *
 * 반복 일정 목록(RoutineSection)과 나란히 서지만 다른 것을 담는다 — 여기는 한 번만 시간을
 * 차지하는 일이다. 완료·일부·줄이기·보류가 없다. 약속은 수행 대상이 아니라 "그 시간은 못
 * 쓴다"는 사실이고, 할 수 있는 것은 고치기와 지우기뿐이다.
 *
 * 오류 처리는 한 층이다. run()이 잡아 문구를 세우고 성공 여부만 돌려주며, 자식 폼은 그
 * 반환값을 보고 닫을지 정한다(RoutineSection과 같은 계약).
 */

import { useState } from 'react';
import { MapPin, Plus, Trash2 } from 'lucide-react';
import CommitmentForm from './CommitmentForm.jsx';
import { commitmentAPI } from '../../api/api.js';
import { formatDateShort, toHHmm } from '../../lib/datetime.js';

/** "9/4 19:00 ~ 21:00" — 날짜가 넘어가면 종료 쪽 날짜도 보여준다. */
function rangeLabel(commitment) {
  const startDate = String(commitment.startAt).slice(0, 10);
  const endDate = String(commitment.endAt).slice(0, 10);
  const head = `${formatDateShort(startDate)} ${toHHmm(commitment.startAt)}`;
  const tail = startDate === endDate
    ? toHHmm(commitment.endAt)
    : `${formatDateShort(endDate)} ${toHHmm(commitment.endAt)}`;
  return `${head} ~ ${tail}`;
}

export default function CommitmentSection({
  commitments, loading, editingId, onEdit, onChanged,
}) {
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = async (action) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
      return true;
    } catch (err) {
      setError(err.message || '처리하지 못했습니다.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="view-section">
      <div className="section-head">
        <h2 className="section-title">일회성 일정</h2>
        <button type="button" className="btn-ghost btn-sm" disabled={busy}
          onClick={() => { setAdding((v) => !v); setError(null); }}>
          <Plus size={13} /> 일회성 일정 추가
        </button>
      </div>
      <p className="section-desc">
        약속·병원·면접처럼 한 번만 시간을 차지하는 일이에요. 이 시간에는 계획이 잡히지 않아요.
      </p>

      {error && <p className="view-error">{error}</p>}

      {adding && (
        <CommitmentForm
          busy={busy}
          submitLabel="추가"
          onCancel={() => setAdding(false)}
          onSubmit={async (payload) => {
            if (await run(() => commitmentAPI.create(payload))) setAdding(false);
          }}
        />
      )}

      {loading && <p className="view-dim">불러오는 중...</p>}

      {!loading && commitments.length === 0 && !adding && (
        <p className="view-dim">이번 주에 잡힌 약속이 없어요.</p>
      )}

      <div className="row-list">
        {commitments.map((commitment) => (
          <article key={commitment.commitmentId} className="exec-row is-block">
            <div className="exec-row-main">
              <div className="exec-row-headline">
                <span className="exec-row-time block-row-range">{rangeLabel(commitment)}</span>
                <span className="exec-row-title">{commitment.title}</span>
              </div>
              <div className="exec-row-meta">
                <span className="chip chip-block"><MapPin size={11} /> 약속</span>
                {commitment.locationText && (
                  <span className="exec-row-dim">{commitment.locationText}</span>
                )}
              </div>

              {editingId === commitment.commitmentId && (
                <CommitmentForm
                  initial={commitment}
                  busy={busy}
                  onCancel={() => onEdit?.(null)}
                  onSubmit={async (payload) => {
                    const ok = await run(() => commitmentAPI.update(commitment.commitmentId, {
                      ...payload, version: commitment.version,
                    }));
                    if (ok) onEdit?.(null);
                  }}
                />
              )}
            </div>

            {/* 완료·일부·줄이기·보류가 없다. 약속은 수행 대상이 아니다. */}
            <div className="exec-row-actions">
              <button type="button" className="btn-ghost btn-sm" disabled={busy}
                onClick={() => onEdit?.(editingId === commitment.commitmentId
                  ? null : commitment.commitmentId)}>
                수정
              </button>
              <button type="button" className="btn-ghost btn-sm btn-danger" disabled={busy}
                onClick={() => run(() => commitmentAPI.remove(
                  commitment.commitmentId, commitment.version))}>
                <Trash2 size={13} /> 삭제
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
