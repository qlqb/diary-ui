/**
 * 한 반복 일정의 예외 목록과 추가 폼.
 *
 * 예외는 두 가지뿐이다 — 그 주만 쉬거나(SKIP), 다른 날로 옮기거나(MOVED). 옮길 때
 * 시각·장소를 비워 두면 원래 값을 그대로 쓴다. 보강은 강의실이 바뀌는 경우가 흔하지만
 * 강의계획서에 안 적혀 있어 대부분 비워 두게 되고, 나중에 채우면 된다.
 */

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { formatDateKo } from '../../lib/datetime.js';
import { formatDays, dayOfWeekOf } from './routineDays.js';

const EMPTY = {
  exceptionDate: '',
  type: 'SKIP',
  movedDate: '',
  movedStartTime: '',
  movedEndTime: '',
  movedLocation: '',
  note: '',
};

export default function RoutineExceptions({ routine, busy, error, onAdd, onRemove }) {
  const [form, setForm] = useState(EMPTY);
  const [adding, setAdding] = useState(false);

  const patch = (changes) => setForm((prev) => ({ ...prev, ...changes }));
  const moved = form.type === 'MOVED';

  /*
   * 예외 날짜는 그 루틴이 실제로 도는 날이어야 한다 — 목요일 수업에 화요일 예외를 달면
   * 서버가 400으로 막는다. 그 사실을 보내기 전에 보여준다. 반대로 옮길 날짜(movedDate)는
   * 아무 날이나 된다. 종강 뒤 보강이 정상이기 때문이다.
   */
  const wrongWeekday = Boolean(form.exceptionDate)
    && !routine.daysOfWeek.includes(dayOfWeekOf(form.exceptionDate));
  const halfTime = Boolean(form.movedStartTime) !== Boolean(form.movedEndTime);
  const canSubmit = form.exceptionDate && !wrongWeekday && !halfTime
    && (!moved || form.movedDate);

  const submit = (event) => {
    event.preventDefault();
    if (!canSubmit || busy) return;
    onAdd({
      exceptionDate: form.exceptionDate,
      type: form.type,
      movedDate: moved ? form.movedDate : null,
      movedStartTime: moved && form.movedStartTime ? form.movedStartTime : null,
      movedEndTime: moved && form.movedEndTime ? form.movedEndTime : null,
      movedLocation: moved && form.movedLocation.trim() ? form.movedLocation.trim() : null,
      note: form.note.trim() || null,
    });
    setForm(EMPTY);
    setAdding(false);
  };

  return (
    <div className="routine-exceptions">
      {routine.exceptions.length === 0 && !adding && (
        <p className="view-dim">예외가 없어요.</p>
      )}

      {routine.exceptions.length > 0 && (
        <ul className="routine-exception-list">
          {routine.exceptions.map((exception) => (
            <li key={exception.routineExceptionId} className="routine-exception">
              <span className="routine-exception-date">{formatDateKo(exception.exceptionDate)}</span>
              <span className={`chip ${exception.type === 'SKIP' ? 'chip-status' : 'chip-warn'}`}>
                {exception.type === 'SKIP' ? '쉬어요' : '보강'}
              </span>
              {exception.type === 'MOVED' && (
                <span className="routine-exception-moved">
                  → {formatDateKo(exception.movedDate)}
                  {exception.movedStartTime && ` ${exception.movedStartTime.slice(0, 5)}`}
                  {exception.movedLocation && ` · ${exception.movedLocation}`}
                </span>
              )}
              {exception.note && <span className="routine-exception-note">{exception.note}</span>}
              <button type="button" className="icon-btn" aria-label="예외 삭제" disabled={busy}
                onClick={() => onRemove(exception.routineExceptionId)}>
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="view-error">{error}</p>}

      {!adding ? (
        <button type="button" className="btn-ghost btn-sm" onClick={() => setAdding(true)}>
          + 예외 추가
        </button>
      ) : (
        <form className="routine-form" onSubmit={submit}>
          <div className="routine-form-row">
            <label className="inline-field">
              날짜
              <input type="date" value={form.exceptionDate} autoFocus
                onChange={(e) => patch({ exceptionDate: e.target.value })} />
            </label>
            <label className="inline-field">
              <input type="radio" name="routine-exception-type" checked={!moved}
                onChange={() => patch({ type: 'SKIP' })} />
              쉬어요
            </label>
            <label className="inline-field">
              <input type="radio" name="routine-exception-type" checked={moved}
                onChange={() => patch({ type: 'MOVED' })} />
              다른 날로 옮겨요
            </label>
          </div>

          {moved && (
            <div className="routine-form-row">
              <label className="inline-field">
                옮길 날짜
                <input type="date" value={form.movedDate}
                  onChange={(e) => patch({ movedDate: e.target.value })} />
              </label>
              <label className="inline-field">
                시각
                <input type="time" value={form.movedStartTime}
                  onChange={(e) => patch({ movedStartTime: e.target.value })} />
              </label>
              <span className="routine-form-tilde">~</span>
              <label className="inline-field">
                <input type="time" value={form.movedEndTime}
                  onChange={(e) => patch({ movedEndTime: e.target.value })} />
              </label>
              <label className="inline-field">
                장소
                <input type="text" value={form.movedLocation} maxLength={100}
                  onChange={(e) => patch({ movedLocation: e.target.value })} />
              </label>
            </div>
          )}

          <div className="routine-form-row">
            <label className="inline-field routine-form-note">
              메모
              <input type="text" value={form.note} maxLength={200} placeholder="추석 보강"
                onChange={(e) => patch({ note: e.target.value })} />
            </label>
          </div>

          <p className="routine-form-hint">
            {wrongWeekday
              ? `이 반복 일정은 ${formatDays(routine.daysOfWeek)}요일에만 있어요. 그날 중 하나를 골라 주세요.`
              : moved
                ? '시각·장소를 비워 두면 원래 값을 그대로 써요. 옮길 날짜는 기간 밖이어도 괜찮아요.'
                : '그 주에는 이 일정이 없는 것으로 봐요.'}
          </p>

          <div className="routine-form-actions">
            <button type="submit" className="btn-primary btn-sm" disabled={!canSubmit || busy}>추가</button>
            <button type="button" className="btn-ghost btn-sm" disabled={busy}
              onClick={() => { setForm(EMPTY); setAdding(false); }}>취소</button>
          </div>
        </form>
      )}
    </div>
  );
}
