/**
 * 실행 조각 한 줄. 오늘/프로젝트/일정 화면이 공유한다.
 *
 * 두 가지를 한 자리에서 보여준다:
 * 1) 지금 있는 그대로의 항목과 그 자리에서 바로 할 수 있는 행동(완료/일부/줄이기/미루기)
 * 2) AI가 이 항목을 바꾸려는 제안(adjustment)이 있으면 변경 전 -> 변경 후를 겹쳐서
 *
 * 행동은 별도 화면이나 모달로 보내지 않고 이 줄 안에서 펼친다 — 실행 중에 화면이 바뀌면
 * "지금 뭘 하고 있었는지"를 잃기 때문이다.
 */

import { useState } from 'react';
import { Clock, Sparkles, Check, X } from 'lucide-react';
import {
  ceilToStep, clampToDay, formatDateShort, formatMinutes, hhmmOf, minutesOf, nowMinutes, shiftDate, todayString,
} from '../lib/datetime.js';

const PRIORITY_LABEL = { MUST: '꼭', SHOULD: '하면 좋음', OPTIONAL: '여유 있으면' };
const STATUS_LABEL = { PLANNED: '', DONE: '완료', HOLD: '보류', CANCELLED: '취소', PARTIAL: '일부' };

function timeLabel(item) {
  if (item.startTime && item.endTime) return `${item.startTime}–${item.endTime}`;
  if (!item.scheduledDate) return '날짜 미정';
  return item.estimatedMinutes ? formatMinutes(item.estimatedMinutes) : '시각 미정';
}

/** AI 조정 제안을 사람이 읽는 한 줄로. 무엇이 어떻게 바뀌는지가 한눈에 보여야 한다. */
function adjustmentLabel(adjustment) {
  if (adjustment.operation === 'REDUCE') {
    const before = adjustment.beforeExpectedMinutes;
    const after = adjustment.expectedMinutes;
    if (before != null && after != null && before !== after) {
      return `${before}분 → ${after}분`;
    }
    return `제목: ${adjustment.title}`;
  }
  if (adjustment.operation === 'MOVE') {
    // 같은 날 안에서 시각만 미는 이동은 날짜를 두 번 보여줘봐야 읽히지 않는다 — 시각을 보여준다.
    const sameDay = adjustment.beforeScheduledDate === adjustment.scheduledDate;
    if (sameDay && adjustment.startTime) {
      return `오늘 ${adjustment.startTime}${adjustment.endTime ? `–${adjustment.endTime}` : ''}로`;
    }
    return `${formatDateShort(adjustment.beforeScheduledDate)} → ${formatDateShort(adjustment.scheduledDate)}`;
  }
  return '오늘 목록에서 빼기 (보류, 되돌릴 수 있어요)';
}

function durationMinutes(item) {
  if (item.estimatedMinutes != null) return item.estimatedMinutes;
  const start = minutesOf(item.startTime);
  const end = minutesOf(item.endTime);
  return start != null && end != null && end > start ? end - start : 30;
}

/** "오늘 뒤로"의 기본값은 지금 바로 다음 5분 경계다 — 어중간한 15:43이 아니라 15:45. */
function suggestLaterStart(item) {
  if (!item.startTime) return '';
  return hhmmOf(clampToDay(ceilToStep(nowMinutes(), 5)));
}

export default function ExecutionRow({
  item,
  projectTitle,
  adjustment,
  onAdjustmentPatch,
  onAdjustmentExclude,
  onAction,
  busy,
  compact,
}) {
  const [tray, setTray] = useState(null); // null | 'partial' | 'reduce' | 'move'
  const [reduceMinutes, setReduceMinutes] = useState(item.estimatedMinutes ?? 30);
  const [partialPercent, setPartialPercent] = useState(50);
  const [moveDate, setMoveDate] = useState('');
  const [laterTime, setLaterTime] = useState(() => suggestLaterStart(item));

  const isDone = item.status === 'DONE';
  const isHold = item.status === 'HOLD';
  const canAct = item.status === 'PLANNED' && onAction;
  // 같은 날 안에서 시각만 뒤로 미는 것은 시각이 정해진 항목에만 뜻이 있다.
  const canMoveLaterToday = Boolean(item.startTime && item.endTime && item.scheduledDate === todayString());

  const run = async (action, payload) => {
    setTray(null);
    await onAction?.(action, item, payload);
  };

  const runLaterToday = () => {
    const start = minutesOf(laterTime);
    if (start == null) return;
    const end = clampToDay(start + durationMinutes(item));
    run('move', {
      toDate: item.scheduledDate,
      startTime: hhmmOf(start),
      endTime: hhmmOf(end),
    });
  };

  return (
    <article className={`exec-row${isDone ? ' is-done' : ''}${isHold ? ' is-hold' : ''}${adjustment ? ' has-draft' : ''}${compact ? ' is-compact' : ''}`}>
      <div className="exec-row-main">
        <div className="exec-row-headline">
          <span className="exec-row-title">{item.title}</span>
          {projectTitle && <span className="chip chip-project">{projectTitle}</span>}
        </div>
        <div className="exec-row-meta">
          <span className="exec-row-time">
            {item.startTime && <Clock size={13} />}
            {timeLabel(item)}
          </span>
          {item.estimatedMinutes != null && item.startTime && (
            <span className="exec-row-dim">{formatMinutes(item.estimatedMinutes)}</span>
          )}
          {item.priority && item.priority !== 'SHOULD' && !isDone && (
            <span className="chip">{PRIORITY_LABEL[item.priority]}</span>
          )}
          {(isDone || isHold) && <span className="chip chip-status">{STATUS_LABEL[item.status]}</span>}
        </div>

        {adjustment && !adjustment.excluded && (
          <div className="exec-row-draft">
            <span className="draft-badge"><Sparkles size={12} /> AI 초안 · 적용 전</span>
            <span className="exec-row-draft-change">{adjustmentLabel(adjustment)}</span>
            {adjustment.operation === 'REDUCE' && (
              <label className="inline-field">
                <span>분</span>
                <input
                  type="number"
                  min="5"
                  step="5"
                  value={adjustment.expectedMinutes ?? ''}
                  onChange={(e) => onAdjustmentPatch?.(adjustment.proposalItemId, {
                    expectedMinutes: Number(e.target.value) || 0,
                  })}
                />
              </label>
            )}
            {adjustment.operation === 'MOVE' && (
              <label className="inline-field">
                <span>날짜</span>
                <input
                  type="date"
                  value={adjustment.scheduledDate ?? ''}
                  onChange={(e) => onAdjustmentPatch?.(adjustment.proposalItemId, { scheduledDate: e.target.value })}
                />
              </label>
            )}
            <button type="button" className="btn-ghost btn-sm"
              onClick={() => onAdjustmentExclude?.(adjustment.proposalItemId)}>
              이건 빼기
            </button>
          </div>
        )}
        {adjustment?.excluded && (
          <div className="exec-row-draft is-excluded">
            <span>이 변경은 적용하지 않아요</span>
            <button type="button" className="btn-ghost btn-sm"
              onClick={() => onAdjustmentExclude?.(adjustment.proposalItemId)}>
              되돌리기
            </button>
          </div>
        )}

        {adjustment?.reason && !adjustment.excluded && (
          <p className="exec-row-reason">{adjustment.reason}</p>
        )}
      </div>

      {canAct && (
        <div className="exec-row-actions">
          {tray === null && (
            <>
              <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={() => run('complete')}>
                완료
              </button>
              <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => setTray('partial')}>
                일부 했어요
              </button>
              <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => setTray('reduce')}>
                줄이기
              </button>
              {/* "미루기"가 아니라 "이동"이다 — 언제 할지를 바꾸는 것이고, 오늘 안에서 뒤로
                  미는 것도 여기에 포함된다. 보류("당분간 실행 대상에서 빼두기")는 의미가 달라
                  이 버튼에 합치지 않는다. */}
              <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => setTray('move')}>
                이동
              </button>
            </>
          )}

          {tray === 'partial' && (
            <div className="exec-tray">
              <label className="inline-field">
                <span>얼마나</span>
                <select value={partialPercent} onChange={(e) => setPartialPercent(Number(e.target.value))}>
                  <option value={25}>조금 (25%)</option>
                  <option value={50}>절반 (50%)</option>
                  <option value={75}>거의 다 (75%)</option>
                </select>
              </label>
              <button type="button" className="btn-primary btn-sm" disabled={busy}
                onClick={() => run('partial', { completionPercent: partialPercent })}>
                <Check size={13} /> 기록
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setTray(null)}>
                <X size={13} />
              </button>
            </div>
          )}

          {tray === 'reduce' && (
            <div className="exec-tray">
              <label className="inline-field">
                <span>분</span>
                <input type="number" min="5" step="5" value={reduceMinutes}
                  onChange={(e) => setReduceMinutes(Number(e.target.value) || 0)} />
              </label>
              <button type="button" className="btn-primary btn-sm" disabled={busy || reduceMinutes <= 0}
                onClick={() => run('reduce', { expectedMinutes: reduceMinutes })}>
                <Check size={13} /> 줄이기
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setTray(null)}>
                <X size={13} />
              </button>
            </div>
          )}

          {tray === 'move' && (
            <div className="exec-tray exec-tray-move">
              {canMoveLaterToday && (
                <span className="exec-tray-group">
                  <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={runLaterToday}>
                    오늘 뒤로
                  </button>
                  <input type="time" step="300" aria-label="오늘 뒤로 옮길 시각"
                    value={laterTime} onChange={(e) => setLaterTime(e.target.value)} />
                </span>
              )}
              <button type="button" className="btn-ghost btn-sm" disabled={busy}
                onClick={() => run('move', { toDate: shiftDate(item.scheduledDate ?? todayString(), 1) })}>
                내일로
              </button>
              <span className="exec-tray-group">
                <input type="date" aria-label="옮길 날짜"
                  value={moveDate} onChange={(e) => setMoveDate(e.target.value)} />
                <button type="button" className="btn-primary btn-sm" disabled={busy || !moveDate}
                  onClick={() => run('move', { toDate: moveDate })}>
                  <Check size={13} /> 이 날짜로
                </button>
              </span>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setTray(null)} aria-label="이동 취소">
                <X size={13} />
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
