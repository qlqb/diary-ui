/**
 * 프로젝트의 과제.
 *
 * 두 부분이다.
 *  1. 확인할 내용 — "이 부분은 과제인가요?" 카드. 작업을 막지 않는다(팝업 없음). 여러 후보는
 *     "확인할 내용 N개"로 묶이고 사용자가 필요한 때 답한다. 답은 [과제 맞아요]/[연습용이에요]/[나중에]이고
 *     마감은 같은 카드 안에서 이어진다. 추정 날짜는 [이 날짜 맞아요]로만 확정된다 — [과제 맞아요]가
 *     날짜까지 승인하지 않는다.
 *  2. 과제 목록 — "☐ 제목 · 9월 18일까지 · 자료 보기". 체크는 그 과제를 끝냈다는 사용자 확인이고
 *     즉시 저장된다. 지난 마감은 숨기지 않고 표시한다. 완료된 과제는 접힌 목록에서 다시 확인·해제할 수 있다.
 *
 * 화면은 원본(서버 응답)을 그대로 쓰고 사본 Todo를 만들지 않는다. 모든 변경은 version을 실어 보내고
 * 409면 다시 읽는다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { assignmentAPI, materialAnalysisStatusAPI } from '../../api/api.js';
import MaterialFileLink from '../../components/MaterialFileLink.jsx';
import {
  describeDueEstimate, formatAssignmentDue, isOverdue,
} from '../../lib/analysisLabels.js';

export default function AssignmentSection({ courseId, todayIso, refreshToken = 0, onChanged = null }) {
  const [assignments, setAssignments] = useState([]);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const [questionsOpen, setQuestionsOpen] = useState(true);
  const [adding, setAdding] = useState(false);
  const ticket = useRef(0);

  const load = useCallback(async () => {
    if (courseId == null) return;
    const mine = ticket.current + 1;
    ticket.current = mine;
    try {
      const next = await assignmentAPI.listByCourse(courseId);
      if (ticket.current === mine) {
        setAssignments(next ?? []);
        setError(null);
      }
    } catch (err) {
      if (ticket.current === mine) setError(err.message || '과제를 불러오지 못했어요.');
    }
  }, [courseId]);

  useEffect(() => { load(); }, [load, refreshToken]);

  const candidates = useMemo(() => assignments.filter((a) => a.confirmStatus === 'CANDIDATE'), [assignments]);
  const confirmed = useMemo(() => assignments.filter((a) => a.confirmStatus === 'CONFIRMED'), [assignments]);
  const open = useMemo(() => confirmed.filter((a) => !a.completed), [confirmed]);
  const done = useMemo(() => confirmed.filter((a) => a.completed), [confirmed]);
  const later = useMemo(() => assignments.filter((a) => a.confirmStatus === 'LATER'), [assignments]);

  /** 한 과제의 응답으로 목록을 제자리 갱신한다. 전체를 다시 읽지 않아도 새로고침과 같은 값이다. */
  const replace = useCallback((updated) => {
    setAssignments((prev) => prev.map((a) => (a.assignmentId === updated.assignmentId ? updated : a)));
  }, []);

  const run = useCallback(async (assignmentId, action) => {
    setBusyId(assignmentId);
    setError(null);
    try {
      const updated = await action();
      replace(updated);
      onChanged?.(updated);
    } catch (err) {
      if (err.code === 'E409_004') {
        // 최신을 먼저 읽고 안내를 남긴다 — 순서가 반대면 load가 안내를 지운다.
        await load();
        setError('다른 곳에서 먼저 바뀌었어요. 최신 상태를 다시 불러왔어요.');
      } else {
        setError(err.message || '저장하지 못했어요.');
      }
    } finally {
      setBusyId(null);
    }
  }, [replace, load, onChanged]);

  const answer = (a, value) => run(a.assignmentId,
    () => assignmentAPI.answer(a.assignmentId, { answer: value, version: a.version }));
  const setDue = (a, due) => run(a.assignmentId,
    () => assignmentAPI.setDue(a.assignmentId, { ...due, version: a.version }));
  const setCompleted = (a, completed) => run(a.assignmentId,
    () => assignmentAPI.setCompleted(a.assignmentId, { completed, version: a.version }));

  if (courseId == null) return null;
  const nothing = candidates.length === 0 && confirmed.length === 0 && later.length === 0;

  return (
    <section className="view-section assignment-section">
      <h2 className="section-title">
        과제 {open.length > 0 ? open.length : ''}
      </h2>
      {error && <p className="view-error">{error}</p>}

      {candidates.length > 0 && (
        <div className="assignment-questions">
          <button type="button" className="collapse-head" aria-expanded={questionsOpen}
            onClick={() => setQuestionsOpen((v) => !v)}>
            {questionsOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            <span className="assignment-questions-title">확인할 내용 {candidates.length}개</span>
            <span className="view-dim">자료에서 제출로 보이는 부분이에요. 급하지 않아요.</span>
          </button>
          {questionsOpen && candidates.map((a) => (
            <AssignmentQuestion key={a.assignmentId} assignment={a} busy={busyId === a.assignmentId}
              todayIso={todayIso} onAnswer={(v) => answer(a, v)} onDue={(due) => setDue(a, due)} />
          ))}
        </div>
      )}

      {nothing && (
        <p className="view-dim">아직 확인된 과제가 없어요. 자료에서 제출 단서가 보이면 여기서 물어볼게요.</p>
      )}

      {open.length > 0 && (
        <ul className="assignment-list">
          {open.map((a) => (
            <AssignmentRow key={a.assignmentId} assignment={a} todayIso={todayIso} busy={busyId === a.assignmentId}
              onToggle={() => setCompleted(a, true)} onDue={(due) => setDue(a, due)} />
          ))}
        </ul>
      )}

      {later.length > 0 && (
        <p className="view-dim assignment-later">
          나중에 보기로 한 항목 {later.length}개
          {later.map((a) => (
            <button key={a.assignmentId} type="button" className="btn-ghost btn-sm" disabled={busyId === a.assignmentId}
              onClick={() => answer(a, 'CONFIRMED')}>
              「{a.title}」 과제로 등록
            </button>
          ))}
        </p>
      )}

      {done.length > 0 && (
        <div className="assignment-done">
          <button type="button" className="collapse-head" aria-expanded={showDone} onClick={() => setShowDone((v) => !v)}>
            {showDone ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            <span className="view-dim">끝낸 과제 {done.length}개</span>
          </button>
          {showDone && (
            <ul className="assignment-list">
              {done.map((a) => (
                <AssignmentRow key={a.assignmentId} assignment={a} todayIso={todayIso} busy={busyId === a.assignmentId}
                  onToggle={() => setCompleted(a, false)} onDue={null} />
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="material-detail-actions">
        <button type="button" className="btn-ghost btn-sm" onClick={() => setAdding((v) => !v)}>
          {adding ? '닫기' : '과제 직접 추가'}
        </button>
      </div>
      {adding && (
        <AddAssignmentForm courseId={courseId} onDone={async () => { setAdding(false); await load(); onChanged?.(); }}
          onCancel={() => setAdding(false)} />
      )}
    </section>
  );
}

/** "이 부분은 과제인가요?" 카드. 답과 마감이 한 카드 안에서 이어진다. */
function AssignmentQuestion({ assignment: a, busy, todayIso, onAnswer, onDue }) {
  const [sourceOpen, setSourceOpen] = useState(false);
  const [source, setSource] = useState(null);
  const [dueMode, setDueMode] = useState(false);
  const [dateValue, setDateValue] = useState('');

  const openSource = async () => {
    setSourceOpen((v) => !v);
    if (!source && a.sectionId) {
      try {
        setSource(await materialAnalysisStatusAPI.section(a.sectionId));
      } catch {
        setSource({ excerpt: '원문 구간을 불러오지 못했어요.' });
      }
    }
  };

  const estimates = (a.dueEstimates ?? []).filter((e) => e && (e.isoDate || e.monthDay || e.text));

  return (
    <div className="assignment-question" role="group" aria-label={`과제 확인: ${a.title}`}>
      <p className="assignment-question-lead">이 부분은 과제인가요?</p>
      <p className="assignment-question-title">{a.title}</p>
      {a.sourceQuote && <blockquote className="assignment-quote">“{a.sourceQuote}”</blockquote>}
      {a.duplicateOfTitle && (
        <p className="hint">비슷한 과제가 이미 있어요: 「{a.duplicateOfTitle}」</p>
      )}
      <div className="assignment-question-actions">
        <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={() => onAnswer('CONFIRMED')}>
          과제 맞아요
        </button>
        <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => onAnswer('NOT_ASSIGNMENT')}>
          연습용이에요
        </button>
        <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => onAnswer('LATER')}>
          나중에
        </button>
        {a.duplicateOfAssignmentId && (
          <button type="button" className="btn-ghost btn-sm" disabled={busy}
            onClick={() => onAnswer('DUPLICATE')}>
            같은 과제예요
          </button>
        )}
        {a.sectionId && (
          <button type="button" className="link-btn" onClick={openSource} aria-expanded={sourceOpen}>
            원문 보기
          </button>
        )}
      </div>
      {sourceOpen && (
        <div className="assignment-source">
          {source ? (
            <>
              {source.locator && <span className="view-dim">{source.locator} · </span>}
              <span>{source.excerpt ?? source.assignmentQuote ?? ''}</span>
              {a.materialId && !a.materialDeleted && (
                <MaterialFileLink materialId={a.materialId} filename={a.materialFilename ?? '원본 자료'} />
              )}
            </>
          ) : <span className="view-dim">불러오는 중…</span>}
        </div>
      )}

      {/* 마감. 원문에 명시된 날짜는 미리 채워져 있고 근거가 보인다. 추정은 확정 동작으로만 마감이 된다. */}
      <div className="assignment-due-block">
        {a.dueKind === 'DATE' || a.dueKind === 'DATETIME' ? (
          <p className="assignment-due-line">
            마감 {formatAssignmentDue(a, todayIso)}
            {a.dueSource === 'SOURCE' && a.dueQuote && <span className="view-dim"> · 원문: “{a.dueQuote}”</span>}
            {a.dueSource === 'USER' && <span className="view-dim"> · 직접 입력</span>}
            <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => setDueMode(true)}>고치기</button>
          </p>
        ) : a.dueKind === 'NONE' && !dueMode ? (
          <p className="assignment-due-line">
            마감 없음 <span className="view-dim">· 직접 정함</span>
            <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => setDueMode(true)}>고치기</button>
          </p>
        ) : (
          <>
            {estimates.length > 0 && (
              <ul className="assignment-estimates">
                {estimates.map((e, i) => (
                  <li key={i}>
                    <span>{describeDueEstimate(e)}</span>
                    {e.isoDate && (
                      <button type="button" className="btn-ghost btn-sm" disabled={busy}
                        onClick={() => onDue({ dueKind: 'DATE', dueDate: e.isoDate })}>
                        이 날짜 맞아요
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {!dueMode ? (
              <p className="assignment-due-line">
                <span className="view-dim">마감:</span>
                <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => setDueMode(true)}>날짜 선택</button>
                <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => onDue({ dueKind: 'UNKNOWN' })}>아직 몰라요</button>
                <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => onDue({ dueKind: 'NONE' })}>마감 없음</button>
              </p>
            ) : (
              <p className="assignment-due-line">
                <input type="date" value={dateValue} aria-label="마감 날짜" onChange={(e) => setDateValue(e.target.value)} />
                <button type="button" className="btn-primary btn-sm" disabled={busy || !dateValue}
                  onClick={() => { onDue({ dueKind: 'DATE', dueDate: dateValue }); setDueMode(false); }}>
                  저장
                </button>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setDueMode(false)}>취소</button>
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** ☐ 제목 · 9월 18일까지 · 자료 보기 */
function AssignmentRow({ assignment: a, todayIso, busy, onToggle, onDue }) {
  const overdue = isOverdue(a, todayIso);
  const [dueMode, setDueMode] = useState(false);
  const [dateValue, setDateValue] = useState(a.dueDate ?? '');
  const estimates = (a.dueEstimates ?? []).filter((e) => e && e.isoDate);
  const noDue = a.dueKind !== 'DATE' && a.dueKind !== 'DATETIME';

  return (
    <li className={`assignment-row${a.completed ? ' is-done' : ''}${overdue ? ' is-overdue' : ''}`}>
      <label className="assignment-row-main">
        <input type="checkbox" checked={Boolean(a.completed)} disabled={busy} onChange={onToggle}
          aria-label={`${a.title} ${a.completed ? '완료 해제' : '완료'}`} />
        <span className="assignment-row-title">{a.title}</span>
        <span className={`assignment-row-due${overdue ? ' is-overdue' : ''}`}>
          {formatAssignmentDue(a, todayIso)}{overdue ? ' · 마감이 지났어요' : ''}
        </span>
      </label>
      <span className="assignment-row-actions">
        {a.materialId && !a.materialDeleted && (
          <MaterialFileLink materialId={a.materialId} filename={a.materialFilename ?? '원본 자료'} label="자료 보기" />
        )}
        {a.materialDeleted && <span className="view-dim"><FileText size={12} /> 원본 삭제됨</span>}
        {onDue && noDue && !dueMode && (
          <>
            {estimates.map((e, i) => (
              <button key={i} type="button" className="btn-ghost btn-sm" disabled={busy}
                onClick={() => onDue({ dueKind: 'DATE', dueDate: e.isoDate })}>
                {describeDueEstimate(e)} · 이 날짜 맞아요
              </button>
            ))}
            <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => setDueMode(true)}>날짜 선택</button>
            {a.dueKind !== 'NONE' && (
              <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => onDue({ dueKind: 'NONE' })}>마감 없음</button>
            )}
          </>
        )}
        {onDue && !noDue && !dueMode && (
          <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => setDueMode(true)}>마감 고치기</button>
        )}
        {onDue && dueMode && (
          <>
            <input type="date" value={dateValue} aria-label="마감 날짜" onChange={(e) => setDateValue(e.target.value)} />
            <button type="button" className="btn-primary btn-sm" disabled={busy || !dateValue}
              onClick={() => { onDue({ dueKind: 'DATE', dueDate: dateValue }); setDueMode(false); }}>저장</button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setDueMode(false)}>취소</button>
          </>
        )}
      </span>
    </li>
  );
}

function AddAssignmentForm({ courseId, onDone, onCancel }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  return (
    <form className="material-link-form" onSubmit={async (e) => {
      e.preventDefault();
      if (!title.trim()) return;
      setBusy(true);
      setError(null);
      try {
        await assignmentAPI.create({ courseId, title: title.trim(), dueKind: date ? 'DATE' : 'UNKNOWN', dueDate: date || null });
        await onDone();
      } catch (err) {
        setError(err.message || '추가하지 못했어요.');
      } finally {
        setBusy(false);
      }
    }}>
      <input type="text" className="input" value={title} placeholder="과제 제목" aria-label="과제 제목" autoFocus
        onChange={(e) => setTitle(e.target.value)} />
      <input type="date" value={date} aria-label="마감 날짜(선택)" onChange={(e) => setDate(e.target.value)} />
      <button type="submit" className="btn-ghost btn-sm" disabled={busy || !title.trim()}>추가</button>
      <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={onCancel}>취소</button>
      {error && <p className="view-error">{error}</p>}
    </form>
  );
}
