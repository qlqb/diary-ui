/**
 * 자료 주차 확인. 업로드·분석이 끝난 자료를 한 화면에서 주차에 놓는다.
 *
 * ★ 추천은 확인하기 전까지 추천이다. "AI 추천" 카드는 점선으로 그 주차 칸에 미리 놓일 뿐, 학습 지도에는
 * 반영되지 않는다. [확인]·[추천대로 적용]·끌어 놓기·선택 상자 중 하나를 해야 서버에 저장된다.
 *
 * 자료마다 확인창을 따로 띄우지 않는다 — 열 개를 올렸다고 열 번 묻지 않는다. 주차는 가로 칸반이 아니라
 * 세로로 쌓은 칸이다(15열은 1536px 화면에서도 읽을 수 없다). 칸 머리가 곧 놓을 자리다. 끌기가 안 되는
 * 환경(키보드·터치)에서는 카드마다 있는 선택 상자로 같은 일을 한다.
 *
 * 오버레이를 눌러도 닫지 않는다. 조작마다 곧바로 저장되므로 잃을 것은 없지만, 끌다가 놓친 손이 창을 닫으면 당황스럽다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, FileText, Loader2, X } from 'lucide-react';
import { weekApi } from './materialWeekApi.js';
import {
  CardState, COURSE_KEY, EVIDENCE_KIND_LABEL, Placement, UNASSIGNED_KEY,
  acceptRequest, addWeekRequest, buildBoard, bulkItems, cardStatusText, moveRequest, placeLabel, slotOptions,
} from '../../lib/materialWeeks.js';
import '../../styles/material-weeks.css';

const IN_PROGRESS = new Set(['QUEUED', 'RUNNING']);

export default function MaterialWeekReview({ courseId, onClose, onChanged = null }) {
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [overKey, setOverKey] = useState(null);
  const headingRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const api = weekApi();
      if (!api) throw new Error('자료 주차를 불러오지 못했어요.');
      // 오류 문구는 여기서 지우지 않는다 — 409 뒤에 다시 읽는 것이 "왜 다시 읽었는지"를 지우면 안 된다.
      setReview(await api.review(courseId));
    } catch (err) {
      setError(err.message || '자료 주차를 불러오지 못했어요.');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { headingRef.current?.focus?.(); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const board = useMemo(() => (review ? buildBoard(review) : []), [review]);
  const cards = useMemo(() => new Map(board.flatMap((g) => g.cards).map((c) => [c.id, c])), [board]);
  const pending = useMemo(() => bulkItems(review), [review]);
  const options = useMemo(() => slotOptions(review?.weekCount), [review]);

  const run = async (work, doneMessage = null) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const next = await work();
      if (next) setReview(next);
      if (doneMessage) setNotice(doneMessage(next));
      await onChanged?.();
    } catch (err) {
      if (err.code === 'E409_036' || err.status === 409) {
        setError('그 사이 주차 추천이 바뀌었어요. 목록을 다시 불러왔으니 한 번 더 확인해 주세요.');
        await load();
      } else {
        setError(err.message || '저장하지 못했어요.');
      }
    } finally {
      setBusy(false);
    }
  };

  const place = (materialId, request) => {
    if (!request) return;
    run(() => weekApi().place(courseId, materialId, request));
  };

  const moveCard = (card, targetKey) => place(card.item.materialId, moveRequest(card, targetKey));

  const applyAll = () => run(async () => {
    const result = await weekApi().applySuggestions(courseId, pending);
    return { ...result.review, lastApply: result };
  }, (next) => {
    const r = next?.lastApply;
    if (!r) return null;
    return r.skipped?.length
      ? `${r.applied}개를 적용했어요. ${r.skipped.length}개는 그 사이 바뀌었거나 이미 정해져 있어 건너뛰었어요.`
      : `${r.applied}개를 추천대로 적용했어요.`;
  });

  const onDrop = (e, key) => {
    e.preventDefault();
    const id = draggingId ?? e.dataTransfer?.getData?.('text/plain');
    setDraggingId(null);
    setOverKey(null);
    const card = id ? cards.get(id) : null;
    if (card && !busy) moveCard(card, key);
  };

  return (
    <div className="mw-backdrop" role="dialog" aria-modal="true" aria-labelledby="mw-title">
      <div className="mw-modal">
        <header className="mw-head">
          <h2 id="mw-title" className="mw-title" tabIndex={-1} ref={headingRef}>자료 주차 확인</h2>
          {review && <span className="mw-count">확인 필요 {review.needsReview}개</span>}
          <button type="button" className="icon-btn mw-close" aria-label="닫기" disabled={busy} onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <p className="mw-desc">
          AI 추천은 확인하기 전까지 학습 지도에 반영되지 않아요. 카드를 끌어 다른 주차에 놓거나, 카드의 선택 상자로 고르세요.
        </p>

        <div className="mw-body" aria-busy={loading || busy}>
          {loading && !review && <p className="view-dim" role="status">불러오는 중...</p>}
          {review && review.items.length === 0 && <p className="view-dim">이 프로젝트에 연결된 자료가 없어요.</p>}
          {board.map((group) => (
            <section
              key={group.key}
              className={`mw-group${group.cards.length === 0 ? ' is-empty' : ''}${overKey === group.key ? ' is-over' : ''}`
                + `${group.key === UNASSIGNED_KEY ? ' is-unassigned' : ''}${group.key === COURSE_KEY ? ' is-course' : ''}`}
              aria-label={`${group.title} (${group.cards.length}개)`}
              data-slot={group.key}
              onDragOver={(e) => { if (draggingId) { e.preventDefault(); setOverKey(group.key); } }}
              onDragLeave={() => setOverKey((k) => (k === group.key ? null : k))}
              onDrop={(e) => onDrop(e, group.key)}
            >
              <h3 className="mw-group-title">
                {group.title} <span className="mw-group-count">({group.cards.length})</span>
                {group.key === COURSE_KEY && <span className="mw-group-hint">강의계획서처럼 특정 주차가 아닌 자료</span>}
              </h3>
              {group.cards.length > 0 ? (
                <ul className="mw-cards">
                  {group.cards.map((card) => (
                    <WeekCard key={card.id} card={card} options={options} busy={busy}
                      dragging={draggingId === card.id}
                      onDragStart={(e) => {
                        setDraggingId(card.id);
                        try { e.dataTransfer.setData('text/plain', card.id); e.dataTransfer.effectAllowed = 'move'; } catch { /* jsdom */ }
                      }}
                      onDragEnd={() => { setDraggingId(null); setOverKey(null); }}
                      onMove={(key) => moveCard(card, key)}
                      onPlace={(request) => place(card.item.materialId, request)}
                      weekCount={review?.weekCount ?? 15} />
                  ))}
                </ul>
              ) : (
                <p className="mw-empty">{draggingId ? '여기에 놓기' : '비어 있음'}</p>
              )}
            </section>
          ))}
        </div>

        <footer className="mw-foot">
          {error && <p className="view-error mw-message" role="alert">{error}</p>}
          {notice && <p className="hint mw-message" role="status">{notice}</p>}
          {busy && <span className="mw-saving" role="status"><Loader2 size={13} className="spin" aria-hidden="true" /> 저장 중…</span>}
          <div className="mw-foot-actions">
            <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={onClose}>나중에</button>
            <button type="button" className="btn-primary btn-sm" disabled={busy || pending.length === 0} onClick={applyAll}
              title="점선 카드(AI 추천)만 적용해요. 확인 필요·약한 추천은 그대로 둬요.">
              추천대로 적용{pending.length > 0 ? ` (${pending.length})` : ''}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function WeekCard({ card, options, busy, dragging, onDragStart, onDragEnd, onMove, onPlace, weekCount }) {
  const { item, state } = card;
  const [why, setWhy] = useState(false);
  const [adding, setAdding] = useState(false);
  const s = item.suggestion;
  const evidence = s?.evidence ?? [];
  const analyzing = IN_PROGRESS.has(item.analysisState);
  const name = item.filename ?? `자료 ${item.materialId}`;

  return (
    <li className={`mw-card is-${state.toLowerCase()}${dragging ? ' is-dragging' : ''}`}
      draggable={!busy} onDragStart={onDragStart} onDragEnd={onDragEnd} data-material-id={item.materialId}>
      <div className="mw-card-main">
        <FileText size={14} aria-hidden="true" className="mw-card-icon" />
        <span className="mw-card-name" title={name}>{name}</span>
        <span className={`mw-status mw-status-${state.toLowerCase()}`}>{cardStatusText(card)}</span>
        {analyzing && <span className="chip chip-status">분석 중 · 추천이 바뀔 수 있어요</span>}
      </div>

      <div className="mw-card-actions">
        <select className="mw-select" value={card.key} disabled={busy}
          aria-label={`${name}을(를) 놓을 자리`} onChange={(e) => onMove(e.target.value)}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        {state === CardState.SUGGESTED && (
          <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => onMove(card.key)}>
            확인
          </button>
        )}
        {state === CardState.NEEDS_REVIEW && s && (s.options ?? []).map((o) => (
          <button key={`${o.placement}-${o.week ?? ''}`} type="button" className="btn-ghost btn-sm" disabled={busy}
            onClick={() => onPlace(acceptRequest(o))}>
            {placeLabel(o.placement, o.week)}로 확인
          </button>
        ))}
        {state === CardState.NEEDS_REVIEW && (
          <button type="button" className="btn-ghost btn-sm" disabled={busy}
            title="어느 주차 자료도 아니라고 확인해요. 다시 묻지 않아요."
            onClick={() => onPlace({ placement: Placement.UNASSIGNED, weeks: [], source: 'USER' })}>
            주차 없음으로 두기
          </button>
        )}
        {item.assignment?.placement === Placement.WEEK && (adding ? (
          <select className="mw-select" defaultValue="" disabled={busy} aria-label={`${name}에 더할 주차`}
            onChange={(e) => { const w = Number(e.target.value); setAdding(false); if (w) onPlace(addWeekRequest(item, w)); }}
            onBlur={() => setAdding(false)}>
            <option value="" disabled>더할 주차</option>
            {Array.from({ length: weekCount }, (_, i) => i + 1)
              .filter((w) => !(item.assignment.weeks ?? []).includes(w))
              .map((w) => <option key={w} value={w}>{w}주차</option>)}
          </select>
        ) : (
          <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => setAdding(true)}
            title="여러 주차에 걸친 자료(총정리 등)면 주차를 더해요">
            주차 추가
          </button>
        ))}
        {evidence.length > 0 && (
          <button type="button" className="btn-ghost btn-sm mw-why-toggle" aria-expanded={why} onClick={() => setWhy((v) => !v)}>
            {why ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />}
            추천 이유 보기
          </button>
        )}
      </div>

      {item.suggestionDiffers && s && (
        <p className="mw-diff">
          새 분석은 {s.placement ? placeLabel(s.placement, s.week) : (s.options ?? []).map((o) => placeLabel(o.placement, o.week)).join('/')}
          {' '}을(를) 추천해요 — 정해 둔 자리는 바꾸지 않았어요.
        </p>
      )}
      {why && (
        <ul className="mw-evidence" aria-label={`${name}의 추천 이유`}>
          {evidence.map((ev, i) => (
            <li key={`${ev.kind}-${i}`}>
              <span className="mw-evidence-kind">{EVIDENCE_KIND_LABEL[ev.kind] ?? '근거'}</span> {ev.detail}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
