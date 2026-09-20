/**
 * "AI가 이해한 내 상황".
 *
 * AI가 상담·계획에 들고 들어가는 나에 대한 이해를 그대로 보여 주고, 사용자가 고치거나 지울 수 있게 한다.
 * 보이지 않는 기억은 고칠 수 없고, 고칠 수 없는 기억은 틀린 채로 계획에 계속 스며든다.
 *
 * 묶음은 "어디서 온 말인가"다: 내가 말한 것 / 내 자기평가 / 실행 기록에서 확인 / AI 추정(확인 전).
 * 출처가 다르면 믿을 만한 정도도, 사용자가 할 일도 다르다 — AI 추정에만 [맞아요]가 있는 이유다.
 *
 * 지우기는 확인 창을 띄우지 않는다. 그 줄 자리에서 "지울까요? [지우기] [그대로 두기]"로 한 번 더 묻는다 —
 * 화면 전체를 막는 창은 목록을 훑으며 정리하는 흐름을 끊는다. 서버에서 철회된 항목은 다시 저장되지 않는다.
 *
 * ★ 서버 필드 이름·enum 원문을 화면에 내보내지 않는다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Pencil, Trash2 } from 'lucide-react';
import { contextAPI } from '../../api/api.js';
import '../../styles/memory.css';

const GROUPS = Object.freeze([
  { type: 'STATED', title: '내가 말한 것', desc: '상담에서 직접 말했거나 여기서 고친 내용이에요.' },
  { type: 'SELF_REPORT', title: '내 자기평가', desc: '점검 활동이나 상담에서 스스로 매긴 느낌이에요. 시험 결과가 아니에요.' },
  { type: 'OBSERVED', title: '실행 기록에서 확인', desc: '완료·일부 수행 기록에서 읽은 사실이에요.' },
  { type: 'INFERRED', title: 'AI 추정(확인 전)', desc: 'AI가 짐작한 내용이에요. 맞으면 [맞아요], 다르면 고치거나 지워 주세요.' },
]);

const STALE_NOTICE = "이 내용을 쓴 계획 초안이 있어요. 초안은 '갱신 필요'로 표시돼요 — 이미 적용한 일정은 바뀌지 않아요.";

function formatDay(value) {
  if (!value) return null;
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return `${Number(m[2])}월 ${Number(m[3])}일`;
}

function formatDateTime(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 이 이해가 어디에 해당하는지. 프로젝트가 없으면 전체, 기간이 없으면 기간을 말하지 않는다. */
function scopeLabel(item) {
  const parts = [item.courseTitle ? `프로젝트: ${item.courseTitle}` : '모든 프로젝트'];
  const start = formatDay(item.scopeStart);
  const end = formatDay(item.scopeEnd);
  if (start && end) parts.push(`${start} ~ ${end}`);
  else if (start) parts.push(`${start}부터`);
  else if (end) parts.push(`${end}까지`);
  return parts.join(' · ');
}

export default function MemoryView({ onOpenDraft = null }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [editing, setEditing] = useState(null); // { id, text }
  const [confirmingDelete, setConfirmingDelete] = useState(null);
  const [rowError, setRowError] = useState(null); // { id, message }
  const [notice, setNotice] = useState(null);
  const [staleDraftIds, setStaleDraftIds] = useState([]);
  const ticket = useRef(0);

  const load = useCallback(async () => {
    const mine = ticket.current + 1;
    ticket.current = mine;
    try {
      const next = await contextAPI.list();
      if (ticket.current === mine) { setItems(next ?? []); setError(null); }
    } catch (err) {
      if (ticket.current === mine) { setItems((prev) => prev ?? []); setError(err.message || '불러오지 못했어요.'); }
    }
  }, []);

  useEffect(() => {
    (async () => { await load(); })();
    return () => { ticket.current += 1; };
  }, [load]);

  const grouped = useMemo(() => {
    const known = new Set(GROUPS.map((g) => g.type));
    return GROUPS.map((g) => ({
      ...g,
      // 모르는 출처 값은 가장 조심스러운 묶음(AI 추정)에 둔다 — 확인된 것처럼 보이면 안 된다.
      items: (items ?? []).filter((it) => (known.has(it.evidenceType) ? it.evidenceType : 'INFERRED') === g.type),
    }));
  }, [items]);

  /** 세 변경이 공통으로 지나가는 곳. 영향받는 초안이 있으면 그 사실을 알린다. */
  const mutate = async (id, action, doneMessage) => {
    setBusyId(id);
    setRowError(null);
    try {
      const response = await action();
      const stale = response?.staleDraftIds ?? [];
      setStaleDraftIds(stale);
      setNotice(doneMessage);
      setEditing(null);
      setConfirmingDelete(null);
      await load();
      return true;
    } catch (err) {
      setRowError({ id, message: err.message || '반영하지 못했어요. 잠시 뒤 다시 해 주세요.' });
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const total = (items ?? []).length;

  return (
    <div className="view memory-view">
      <header className="view-head">
        <div>
          <h1 className="view-title">AI가 이해한 내 상황</h1>
          <p className="view-sub">
            AI가 상담과 계획에 참고하는 내용이에요. 다르면 고치고, 필요 없으면 지워 주세요.
          </p>
        </div>
      </header>

      {error && (
        <p className="view-error" role="alert">
          {error}{' '}
          <button type="button" className="btn-ghost btn-sm" onClick={load}>다시 불러오기</button>
        </p>
      )}

      {notice && <p className="memory-notice" role="status">{notice}</p>}
      {staleDraftIds.length > 0 && (
        <div className="memory-stale" role="status">
          <p>{STALE_NOTICE}</p>
          {onOpenDraft && (
            <p className="memory-stale-actions">
              {staleDraftIds.map((id, i) => (
                <button key={id} type="button" className="btn-ghost btn-sm" onClick={() => onOpenDraft(id)}>
                  {staleDraftIds.length > 1 ? `초안 ${i + 1} 열기` : '초안 열기'}
                </button>
              ))}
            </p>
          )}
        </div>
      )}

      {items == null && !error && <p className="view-dim" role="status">불러오는 중...</p>}

      {items != null && total === 0 && !error && (
        <div className="empty-block">
          <p className="empty-title">아직 AI가 기억해 둔 내용이 없어요</p>
          <p className="empty-desc">
            상담에서 시간·수준·막히는 점을 이야기하면 여기에 쌓여요. 쌓인 내용은 언제든 고치거나 지울 수 있어요.
          </p>
        </div>
      )}

      {total > 0 && grouped.map((group) => (
        <section key={group.type} className="view-section memory-group" aria-label={group.title}>
          <h2 className="section-title">{group.title} <span className="view-dim">{group.items.length}</span></h2>
          <p className="section-desc">{group.desc}</p>
          {group.items.length === 0 ? (
            <p className="view-dim">아직 없어요.</p>
          ) : (
            <ul className="memory-list">
              {group.items.map((item) => {
                const id = item.contextId;
                const isEditing = editing?.id === id;
                const isConfirming = confirmingDelete === id;
                const busy = busyId === id;
                const confirmedAt = formatDateTime(item.confirmedAt ?? item.updatedAt);
                return (
                  <li key={id} className="memory-item">
                    {isEditing ? (
                      <form className="memory-edit" onSubmit={(e) => {
                        e.preventDefault();
                        const text = editing.text.trim();
                        if (!text || text === item.content) { setEditing(null); return; }
                        mutate(id, () => contextAPI.update(id, text), '고친 내용으로 바꿨어요. 이제 "내가 말한 것"으로 다뤄요.');
                      }}>
                        <textarea className="memory-edit-input" rows={2} autoFocus disabled={busy}
                          aria-label="내용 고치기" value={editing.text}
                          onChange={(e) => setEditing({ id, text: e.target.value })}
                          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setEditing(null); } }} />
                        <span className="memory-actions">
                          <button type="submit" className="btn-primary btn-sm" disabled={busy || !editing.text.trim()}>저장</button>
                          <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => setEditing(null)}>취소</button>
                        </span>
                      </form>
                    ) : (
                      <p className="memory-content">{item.content}</p>
                    )}

                    <p className="memory-meta">
                      <span>{scopeLabel(item)}</span>
                      <span>{confirmedAt ? `마지막 확인 ${confirmedAt}` : '아직 확인한 적 없음'}</span>
                      {item.status === 'STALE' && <span className="chip chip-status">오래된 내용일 수 있어요</span>}
                    </p>

                    {!isEditing && !isConfirming && (
                      <span className="memory-actions">
                        {group.type === 'INFERRED' && (
                          <button type="button" className="btn-ghost btn-sm" disabled={busy}
                            aria-label={`맞아요: ${item.content}`}
                            onClick={() => mutate(id, () => contextAPI.confirm(id), '확인했어요. 이제 "내가 말한 것"으로 다뤄요.')}>
                            <Check size={13} aria-hidden="true" /> 맞아요
                          </button>
                        )}
                        <button type="button" className="btn-ghost btn-sm" disabled={busy}
                          aria-label={`고치기: ${item.content}`}
                          onClick={() => { setEditing({ id, text: item.content ?? '' }); setRowError(null); }}>
                          <Pencil size={13} aria-hidden="true" /> 고치기
                        </button>
                        <button type="button" className="btn-ghost btn-sm" disabled={busy}
                          aria-label={`지우기: ${item.content}`}
                          onClick={() => { setConfirmingDelete(id); setRowError(null); }}>
                          <Trash2 size={13} aria-hidden="true" /> 지우기
                        </button>
                      </span>
                    )}

                    {isConfirming && (
                      <p className="memory-confirm" role="group" aria-label="지우기 확인">
                        <span>지우면 AI가 이 내용을 더는 참고하지 않고, 다시 저장하지도 않아요.</span>
                        <span className="memory-actions">
                          <button type="button" className="btn-ghost btn-sm btn-danger" disabled={busy} autoFocus
                            onClick={() => mutate(id, () => contextAPI.remove(id), '지웠어요. AI가 더는 참고하지 않아요.')}>
                            지우기
                          </button>
                          <button type="button" className="btn-ghost btn-sm" disabled={busy}
                            onClick={() => setConfirmingDelete(null)}>
                            그대로 두기
                          </button>
                        </span>
                      </p>
                    )}

                    {rowError?.id === id && <p className="view-error" role="alert">{rowError.message}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
