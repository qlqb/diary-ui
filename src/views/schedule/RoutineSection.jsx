/**
 * 반복 일정 목록.
 *
 * 매주 도는 것(수업·알바·운동)은 실행 조각으로 매주 손으로 넣을 것이 아니라 규칙 하나로
 * 둔다. 여기서 넣은 규칙이 곧 배치가 피해야 할 시간이 된다 — 같은 발생분을 주간 시간표도
 * 그리고 배치도 본다.
 *
 * 종료는 목록의 별도 동작이 아니라 수정 폼의 기간 필드로 한다. 무기한 알바를 그만두면
 * 종료일에 마지막 날을 넣는 것이 곧 종료다.
 */

import { useState } from 'react';
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import RoutineForm from './RoutineForm.jsx';
import RoutineExceptions from './RoutineExceptions.jsx';
import { formatDays } from './routineDays.js';
import { formatDateShort, toHHmm } from '../../lib/datetime.js';
import { routineAPI } from '../../api/api.js';

export default function RoutineSection({ routines, courses, loading, onChanged }) {
  const [editingId, setEditingId] = useState(null); // 'new' 또는 routineId
  const [expandedId, setExpandedId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [conflictDates, setConflictDates] = useState([]);

  const run = async (action) => {
    setBusy(true);
    setError(null);
    setConflictDates([]);
    try {
      await action();
      await onChanged();
      return true;
    } catch (err) {
      setError(err.message || '처리하지 못했습니다.');
      /*
       * 요일·기간을 바꾸면 기존 예외가 소급으로 무효가 될 수 있고, 서버는 전체를 거부하면서
       * 어떤 예외가 걸렸는지 details에 담아 준다. 문구를 파싱하지 않고 그 값을 그대로 쓴다.
       */
      if (err.code === 'E409_011') {
        setConflictDates(err.details?.conflictingDates ?? []);
      }
      return false;
    } finally {
      setBusy(false);
    }
  };

  const closeForm = () => {
    setEditingId(null);
    setError(null);
    setConflictDates([]);
  };

  return (
    <section className="view-section">
      <div className="routine-head">
        <h2 className="section-title">반복 일정</h2>
        {/* aria-label로 읽히는 이름만 구체적으로 한다 — 폼 안의 "추가" 버튼과 이름이 같으면
            어느 쪽인지 알 수 없다. 보이는 글자는 그대로 둔다. */}
        {editingId !== 'new' && (
          <button type="button" className="btn-ghost btn-sm" aria-label="반복 일정 추가"
            onClick={() => { closeForm(); setEditingId('new'); }}>
            <Plus size={13} /> 추가
          </button>
        )}
      </div>
      <p className="section-desc">
        수업·알바처럼 매주 도는 일정이에요. 여기 넣어 두면 계획을 짤 때 이 시간은 피해서 배치돼요.
      </p>

      {editingId === 'new' && (
        <RoutineForm
          courses={courses}
          busy={busy}
          error={error}
          onCancel={closeForm}
          onSubmit={async (payload) => {
            if (await run(() => routineAPI.create(payload))) closeForm();
          }}
        />
      )}

      {loading && <p className="view-dim">불러오는 중...</p>}
      {!loading && routines.length === 0 && editingId !== 'new' && (
        <p className="view-dim">아직 없어요. 수업 시간표나 알바 근무표를 넣어 두면 계획이 그 시간을 피해요.</p>
      )}

      <ul className="routine-list">
        {routines.map((routine) => {
          const editing = editingId === routine.routineId;
          const expanded = expandedId === routine.routineId;
          const course = courses?.find((c) => c.courseId === routine.courseId);
          return (
            <li key={routine.routineId} className={`routine-row${routine.ended ? ' is-ended' : ''}`}>
              <div className="routine-row-main">
                <button type="button" className="routine-row-toggle"
                  aria-expanded={expanded}
                  onClick={() => setExpandedId(expanded ? null : routine.routineId)}>
                  {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>

                <span className="routine-row-title">{routine.title}</span>
                {course && <span className="chip chip-project">{course.title}</span>}
                {routine.ended && <span className="chip chip-status">종료됨</span>}

                <span className="routine-row-when">
                  {formatDays(routine.daysOfWeek)} {toHHmm(routine.startTime)}-{toHHmm(routine.endTime)}
                  {routine.crossesMidnight && <span className="routine-row-next-day"> (다음 날)</span>}
                  {routine.location && ` · ${routine.location}`}
                </span>

                <button type="button" className="btn-ghost btn-sm" disabled={busy}
                  onClick={() => { closeForm(); setEditingId(editing ? null : routine.routineId); }}>
                  <Pencil size={12} /> 수정
                </button>
                <button type="button" className="icon-btn" aria-label="반복 일정 삭제" disabled={busy}
                  onClick={() => run(() => routineAPI.remove(routine.routineId))}>
                  <Trash2 size={13} />
                </button>
              </div>

              <div className="routine-row-sub">
                {formatDateShort(routine.effectiveFrom)} ~ {routine.effectiveUntil ? formatDateShort(routine.effectiveUntil) : ''}
                {routine.exceptions.length > 0 && ` · 예외 ${routine.exceptions.length}개`}
                {/*
                  종료된 뒤에도 남아 있는 보강은 조용히 지우지 않는다 — 실제로 가는 경우가 있고,
                  안 갈 것이라면 사용자가 그 예외를 지우면 된다. 남아 있다는 사실만 알린다.
                */}
                {routine.ended && routine.hasFutureMovedDate && (
                  <span className="routine-row-warn"> · 종료 뒤 보강이 남아 있어요</span>
                )}
              </div>

              {editing && (
                <RoutineForm
                  routine={routine}
                  courses={courses}
                  busy={busy}
                  error={error}
                  conflictDates={conflictDates}
                  onCancel={closeForm}
                  onSubmit={async (payload) => {
                    if (await run(() => routineAPI.update(routine.routineId, payload))) closeForm();
                  }}
                />
              )}

              {expanded && (
                <RoutineExceptions
                  routine={routine}
                  busy={busy}
                  error={editing ? null : error}
                  onAdd={(payload) => run(() => routineAPI.addException(routine.routineId, payload))}
                  onRemove={(exceptionId) =>
                    run(() => routineAPI.removeException(routine.routineId, exceptionId))}
                />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
