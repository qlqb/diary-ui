/**
 * "이 프로젝트에서 기억하는 것" — 프로젝트 사실 카드.
 *
 * 상담에서 말한 진도·시험 범위·막힌 곳·해결이 여기에 자동으로 모인다. AI가 상담·계획에 받는 것과 같은 내용이다(서버의
 * 같은 조회). 이 카드는 확인·수정용이다 — 입력 폼이 없다. 사용자가 매번 카드를 쓰지 않아도 기억은 대화가 채운다.
 *
 * ★ 수업 진도(수업에서 나간 곳)와 막힌 곳·해결(내 이해)을 다른 묶음으로 둔다.
 * ★ 줄마다 출처와 날짜를 글로 보인다(사용자가 말함·사용자가 고침·자기평가·AI 추정 — 확인 전). AI 추정에만 [맞아요]가 있다.
 * ★ 고치기는 내용과 함께 종류·단원을 바꿀 수 있다(잘못 이어진 단원을 바로잡게). 지우기는 그 자리에서 한 번 더 묻는다.
 * ★ 서버 enum 원문을 화면에 내보내지 않는다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Brain, Check, Pencil, Trash2 } from 'lucide-react';
import { contextAPI, studyStateAPI } from '../../api/api.js';
import {
  FACT_GROUPS, FACT_KIND_LABEL, HELP_LEVEL_LABEL, formatSaidDay, topicChipText,
} from '../../lib/studyLabels.js';
import '../../styles/learning-flow.css';
import '../../styles/memory.css';

const STALE_NOTICE = "이 내용을 쓴 계획 초안이 있어요. 초안은 '갱신 필요'로 표시돼요 — 이미 적용한 일정은 바뀌지 않아요.";
const KIND_OPTIONS = Object.keys(FACT_KIND_LABEL);

export default function StudyStatePanel({ courseId, refreshToken = 0, onChanged }) {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [editing, setEditing] = useState(null); // { id, text, kind, topicId, help }
  const [confirmingDelete, setConfirmingDelete] = useState(null);
  const [rowError, setRowError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [staleDraftIds, setStaleDraftIds] = useState([]);
  const ticket = useRef(0);

  const load = useCallback(async () => {
    const mine = ticket.current + 1;
    ticket.current = mine;
    try {
      const next = await studyStateAPI.get(courseId);
      if (ticket.current === mine) { setState(next); setError(null); }
    } catch (err) {
      if (ticket.current === mine) setError(err.message || '기억한 내용을 불러오지 못했어요.');
    }
  }, [courseId]);

  useEffect(() => {
    (async () => { await load(); })();
    return () => { ticket.current += 1; };
  }, [load, refreshToken]);

  const groups = useMemo(() => {
    const facts = state?.facts ?? [];
    return FACT_GROUPS.map((g) => ({ ...g, items: facts.filter((f) => g.kinds.includes(f.kind)) }))
      .filter((g) => g.items.length > 0);
  }, [state]);

  const mutate = async (id, action, doneMessage) => {
    setBusyId(id);
    setRowError(null);
    try {
      const response = await action();
      setStaleDraftIds(response?.staleDraftIds ?? []);
      setNotice(doneMessage);
      setEditing(null);
      setConfirmingDelete(null);
      await load();
      onChanged?.();
    } catch (err) {
      setRowError({ id, message: err.message || '반영하지 못했어요. 잠시 뒤 다시 해 주세요.' });
    } finally {
      setBusyId(null);
    }
  };

  const save = (fact) => {
    const text = editing.text.trim();
    if (!text) return;
    const body = { content: text };
    if (editing.kind !== fact.kind) body.kind = editing.kind;
    if ((editing.topicId ?? null) !== (fact.topicId ?? null)) body.topicId = editing.topicId ?? 0;
    // 도움 수준을 '말하지 않음'으로 되돌리면 NONE을 보낸다(비운 칸은 서버가 그대로 두므로).
    if (editing.kind === 'RESOLVED' && (editing.help ?? null) !== (fact.help ?? null)) body.help = editing.help ?? 'NONE';
    mutate(fact.contextId, () => contextAPI.edit(fact.contextId, body), '고쳤어요. 이제 "내가 고친 것"으로 다뤄요.');
  };

  const facts = state?.facts ?? [];
  const topics = state?.topics ?? [];

  return (
    <section className="view-section study-state" aria-label="이 프로젝트에서 기억하는 것">
      <h2 className="section-title"><Brain size={15} aria-hidden="true" /> 이 프로젝트에서 기억하는 것</h2>
      <p className="section-desc">
        상담에서 말한 진도·시험 범위·막힌 곳이 여기에 모여요. AI가 상담과 계획에 그대로 참고해요 — 다르면 고치고, 아니면 지워 주세요.
      </p>

      {error && (
        <p className="view-error" role="alert">
          {error}{' '}<button type="button" className="btn-ghost btn-sm" onClick={load}>다시 불러오기</button>
        </p>
      )}
      {notice && <p className="study-state-notice" role="status">{notice}</p>}
      {staleDraftIds.length > 0 && <p className="study-state-stale" role="status">{STALE_NOTICE}</p>}

      {state == null && !error && <p className="view-dim" role="status">불러오는 중...</p>}

      {state != null && (
        <p className="study-state-textbook">
          <span className="plan-item-done-label">교재</span>
          {state.textbook ?? '아직 정하지 않았어요 — 위 교재 구역에서 정할 수 있어요.'}
        </p>
      )}

      {state != null && facts.length === 0 && (
        <p className="view-dim">
          아직 기억한 진도·막힌 곳이 없어요. 상담에서 "수업은 Unit 4까지 나갔어", "Unit 3 문장 만들기가 막혀"처럼 말하면 자동으로 모여요.
        </p>
      )}

      {groups.map((group) => (
        <div key={group.key} className="study-state-group" role="group" aria-label={group.title}>
          <h3 className="study-state-group-title">{group.title}</h3>
          {group.desc && <p className="view-dim study-state-group-desc">{group.desc}</p>}
          <ul className="study-state-list">
            {group.items.map((fact) => {
              const id = fact.contextId;
              const busy = busyId === id;
              const isEditing = editing?.id === id;
              const inferred = fact.evidenceType === 'INFERRED';
              const chip = topicChipText(fact);
              const day = formatSaidDay(fact.saidAt);
              return (
                <li key={id} className="study-state-item">
                  {isEditing ? (
                    <form className="study-state-edit" onSubmit={(e) => { e.preventDefault(); save(fact); }}>
                      <textarea rows={2} autoFocus aria-label="내용 고치기" disabled={busy} value={editing.text}
                        onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setEditing(null); } }} />
                      <span className="study-state-edit-fields">
                        <label>종류{' '}
                          <select value={editing.kind} disabled={busy}
                            onChange={(e) => setEditing({ ...editing, kind: e.target.value })}>
                            {KIND_OPTIONS.map((k) => <option key={k} value={k}>{FACT_KIND_LABEL[k]}</option>)}
                          </select>
                        </label>
                        <label>단원{' '}
                          <select value={editing.topicId ?? ''} disabled={busy}
                            onChange={(e) => setEditing({ ...editing, topicId: e.target.value ? Number(e.target.value) : null })}>
                            <option value="">단원 없음</option>
                            {topics.map((t) => (
                              <option key={t.topicId} value={t.topicId}>
                                {t.sourceTocSeq ? `${t.title} · 목차 ${t.sourceTocSeq}번째` : t.title}
                              </option>
                            ))}
                          </select>
                        </label>
                        {editing.kind === 'RESOLVED' && (
                          <label>도움{' '}
                            <select value={editing.help ?? ''} disabled={busy}
                              onChange={(e) => setEditing({ ...editing, help: e.target.value || null })}>
                              <option value="">말하지 않음</option>
                              <option value="SOLO">{HELP_LEVEL_LABEL.SOLO}</option>
                              <option value="GUIDED">{HELP_LEVEL_LABEL.GUIDED}</option>
                            </select>
                          </label>
                        )}
                      </span>
                      <span className="memory-actions">
                        <button type="submit" className="btn-primary btn-sm" disabled={busy || !editing.text.trim()}>저장</button>
                        <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => setEditing(null)}>취소</button>
                      </span>
                    </form>
                  ) : (
                    <p className="study-state-text">
                      {fact.text}
                      {fact.kind === 'RESOLVED' && fact.help && (
                        <span className="chip chip-ok">{HELP_LEVEL_LABEL[fact.help]}</span>
                      )}
                    </p>
                  )}
                  <p className="study-state-meta">
                    {chip && <span className="chip chip-status" title="이 기억이 이어진 단원">{chip}</span>}
                    <span className={inferred ? 'chip chip-warn' : 'chip chip-status'}>{fact.sourceLabel}</span>
                    {fact.label && <span>{fact.label}</span>}
                    {day && <span>{day}</span>}
                  </p>
                  {!isEditing && confirmingDelete !== id && (
                    <span className="memory-actions">
                      {inferred && (
                        <button type="button" className="btn-ghost btn-sm" disabled={busy}
                          aria-label={`맞아요: ${fact.text}`}
                          onClick={() => mutate(id, () => contextAPI.confirm(id), '확인했어요. 이제 "내가 말한 것"으로 다뤄요.')}>
                          <Check size={13} aria-hidden="true" /> 맞아요
                        </button>
                      )}
                      <button type="button" className="btn-ghost btn-sm" disabled={busy} aria-label={`고치기: ${fact.text}`}
                        onClick={() => { setEditing({ id, text: fact.text, kind: fact.kind, topicId: fact.topicId ?? null, help: fact.help ?? null }); setRowError(null); }}>
                        <Pencil size={13} aria-hidden="true" /> 고치기
                      </button>
                      <button type="button" className="btn-ghost btn-sm" disabled={busy} aria-label={`지우기: ${fact.text}`}
                        onClick={() => { setConfirmingDelete(id); setRowError(null); }}>
                        <Trash2 size={13} aria-hidden="true" /> 지우기
                      </button>
                    </span>
                  )}
                  {confirmingDelete === id && (
                    <p className="memory-confirm" role="group" aria-label="지우기 확인">
                      <span>지우면 AI가 이 내용을 더는 참고하지 않고, 상담에서 같은 말을 다시 저장하지도 않아요.</span>
                      <span className="memory-actions">
                        <button type="button" className="btn-ghost btn-sm btn-danger" disabled={busy} autoFocus
                          onClick={() => mutate(id, () => contextAPI.remove(id), '지웠어요. AI가 더는 참고하지 않아요.')}>
                          지우기
                        </button>
                        <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => setConfirmingDelete(null)}>
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
        </div>
      ))}
    </section>
  );
}
