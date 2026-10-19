/**
 * 반복 일정 추가·수정 폼.
 *
 * 추가와 수정이 같은 폼이다 — 서버가 PUT 전체 교체라 두 요청의 모양이 정확히 같고, 폼을
 * 나누면 같은 필드 목록이 두 벌이 된다.
 *
 * 비운 칸은 비운 것으로 저장된다(장소·프로젝트·종료일). "생략하면 유지"가 아니다.
 */

import { useState } from 'react';
import { WEEKDAYS } from './routineDays.js';
import { formatDateKo, toHHmm } from '../../lib/datetime.js';

/*
 * 서버는 사유를 enum으로만 보낸다. 문구는 화면 것이다 — 서버가 문구까지 보내면 문구를
 * 다듬는 순간 화면이 깨진다. 모르는 값이 오면 그 값을 그대로 보여준다: 사유를 늘렸는데
 * 여기를 안 고친 경우 조용히 사라지는 것보다 낫다.
 */
const CONFLICT_REASON_LABELS = {
  DAY_OF_WEEK_MISMATCH: '그 요일에 일정이 없어요',
  OUTSIDE_EFFECTIVE_RANGE: '기간 밖이에요',
};

function reasonLabel(reason) {
  return CONFLICT_REASON_LABELS[reason] ?? reason;
}

function initialState(routine) {
  return {
    title: routine?.title ?? '',
    courseId: routine?.courseId != null ? String(routine.courseId) : '',
    location: routine?.location ?? '',
    daysOfWeek: routine?.daysOfWeek ?? [],
    startTime: toHHmm(routine?.startTime) ?? '',
    endTime: toHHmm(routine?.endTime) ?? '',
    effectiveFrom: routine?.effectiveFrom ?? '',
    effectiveUntil: routine?.effectiveUntil ?? '',
  };
}

export default function RoutineForm({ routine, courses, busy, error, conflicts, onSubmit, onCancel }) {
  const [form, setForm] = useState(() => initialState(routine));

  const patch = (changes) => setForm((prev) => ({ ...prev, ...changes }));

  const toggleDay = (value) => {
    setForm((prev) => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek.includes(value)
        ? prev.daysOfWeek.filter((d) => d !== value)
        : [...prev.daysOfWeek, value],
    }));
  };

  /*
   * 종료가 시작보다 이르거나 같으면 서버가 다음 날로 읽는다. 시각을 잘못 넣은 것처럼 보이는
   * 정상값이라, 입력하는 동안 그 해석을 보여준다 — 저장한 뒤에 알게 되면 되돌리러 와야 한다.
   */
  const crossesMidnight = Boolean(form.startTime && form.endTime && form.endTime <= form.startTime);
  const sameTime = Boolean(form.startTime && form.endTime && form.startTime === form.endTime);
  const canSubmit = form.title.trim() && form.daysOfWeek.length > 0
    && form.startTime && form.endTime && form.effectiveFrom && !sameTime;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!canSubmit || busy) return;
    onSubmit({
      title: form.title.trim(),
      courseId: form.courseId ? Number(form.courseId) : null,
      location: form.location.trim() || null,
      daysOfWeek: form.daysOfWeek,
      startTime: form.startTime,
      endTime: form.endTime,
      effectiveFrom: form.effectiveFrom,
      effectiveUntil: form.effectiveUntil || null,
    });
  };

  return (
    <form className="routine-form" onSubmit={handleSubmit}>
      <div className="routine-form-row">
        <label className="inline-field">
          제목
          <input type="text" value={form.title} maxLength={200} autoFocus
            placeholder="빅데이터분석"
            onChange={(e) => patch({ title: e.target.value })} />
        </label>
        <label className="inline-field">
          프로젝트
          <select value={form.courseId} onChange={(e) => patch({ courseId: e.target.value })}>
            <option value="">없음</option>
            {(courses ?? []).map((course) => (
              <option key={course.courseId} value={course.courseId}>{course.title}</option>
            ))}
          </select>
        </label>
        <label className="inline-field">
          장소
          <input type="text" value={form.location} maxLength={100} placeholder="3-315"
            onChange={(e) => patch({ location: e.target.value })} />
        </label>
      </div>

      <div className="routine-form-row">
        <span className="routine-form-label">요일</span>
        <div className="routine-day-toggles">
          {WEEKDAYS.map((day) => (
            <button
              key={day.value}
              type="button"
              className={`routine-day${form.daysOfWeek.includes(day.value) ? ' is-on' : ''}`}
              aria-pressed={form.daysOfWeek.includes(day.value)}
              onClick={() => toggleDay(day.value)}
            >
              {day.label}
            </button>
          ))}
        </div>
      </div>

      <div className="routine-form-row">
        <label className="inline-field">
          시각
          <input type="time" value={form.startTime}
            onChange={(e) => patch({ startTime: e.target.value })} />
        </label>
        <span className="routine-form-tilde">~</span>
        <label className="inline-field">
          <input type="time" value={form.endTime}
            onChange={(e) => patch({ endTime: e.target.value })} />
        </label>
        <label className="inline-field">
          기간
          <input type="date" value={form.effectiveFrom}
            onChange={(e) => patch({ effectiveFrom: e.target.value })} />
        </label>
        <span className="routine-form-tilde">~</span>
        <label className="inline-field">
          <input type="date" value={form.effectiveUntil}
            onChange={(e) => patch({ effectiveUntil: e.target.value })} />
        </label>
      </div>

      <p className="routine-form-hint">
        끝을 비워 두면 무기한이에요.
        {crossesMidnight && !sameTime && ' 종료가 시작보다 이르면 다음 날로 봐요.'}
        {sameTime && ' 시작과 종료가 같을 수는 없어요.'}
      </p>

      {error && <p className="view-error">{error}</p>}
      {/*
        걸린 예외를 날짜와 사유까지 보여준다. 사유가 없으면 "왜 안 되는지"를 사용자가
        추측해야 하고, 요일과 기간을 한 번에 바꾼 경우에는 둘 다 나온다.
      */}
      {conflicts?.length > 0 && (
        <div className="view-error">
          <p className="routine-conflict-lead">
            이 예외들이 새 요일·기간에 맞지 않아요. 먼저 지우거나 날짜를 고친 뒤 다시 저장해 주세요.
          </p>
          <ul className="routine-conflict-list">
            {conflicts.map((conflict) => (
              <li key={conflict.exceptionId}>
                {formatDateKo(conflict.exceptionDate)} — {conflict.reasons.map(reasonLabel).join(', ')}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="routine-form-actions">
        <button type="submit" className="btn-primary btn-sm" disabled={!canSubmit || busy}>
          {routine ? '저장' : '추가'}
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={onCancel} disabled={busy}>취소</button>
      </div>
    </form>
  );
}
