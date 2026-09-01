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
import { Clock, Sparkles, Check, X, RotateCcw, Trash2 } from 'lucide-react';
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

/** 낙관적 잠금이 걸린 응답. 자동 재시도 대신 사람에게 넘긴다 — 목록이 이미 다르기 때문이다. */
const VERSION_CONFLICT = 'E409_004';

/**
 * 실제 소요시간 입력을 읽는다.
 *
 * 빈 값은 0이 아니라 "안 쟀다"(null)이다. 관찰 데이터에 계획값이나 추론값을 채우지 않는
 * 것이 이 입력의 전부이므로, 비어 있음과 0을 섞으면 나중에 "0분 만에 끝냈다"와
 * "재지 않았다"를 구분할 수 없게 된다.
 *
 * 상한은 두지 않는다. 이상치는 화면이 아니라 모인 데이터를 보고 판단할 문제다.
 */
function readMinutes(raw) {
  const text = String(raw ?? '').trim();
  if (text === '') return { valid: true, value: null };
  const value = Number(text);
  const valid = Number.isInteger(value) && value >= 1;
  return { valid, value: valid ? value : null };
}

/** 값이 있을 때만 actualMinutes를 싣는다 — 없으면 필드 자체를 보내지 않는다. */
function withActualMinutes(base, input) {
  return input.value == null ? base : { ...base, actualMinutes: input.value };
}

/**
 * 실패 문구. 버전 충돌만 따로 말한다 — 다시 눌러도 같은 결과라서, "잠시 후 다시"는
 * 거짓말이 된다. 사용자가 할 일은 재시도가 아니라 새로고침이다.
 */
function failureMessage(result) {
  if (result?.code === VERSION_CONFLICT) {
    return '목록이 바뀌었어요. 새로고침 후 다시 기록해 주세요';
  }
  return result?.message || '기록하지 못했어요. 잠시 후 다시 시도해 주세요.';
}

/**
 * 삭제 버튼.
 *
 * 확인을 묻지 않는다. 되돌리기가 있기 때문이다 — 확인 창은 "지우기 전에 한 번 더 생각하게"
 * 하지만, 실제로는 매번 누르는 관문이 되어 읽히지 않는다. 지운 뒤 되돌릴 수 있으면
 * 잘못 눌러도 비용이 0에 가깝고, 맞게 누른 사람은 방해받지 않는다.
 *
 * 되돌리기를 못 쓰게 되는 순간(다른 항목을 또 지우거나, 안내가 사라진 뒤)에도 항목은
 * soft delete라 서버에 남아 있다 — 여기서 사라지는 것은 되돌릴 "길"이지 데이터가 아니다.
 */
function DeleteButton({ busy, onDelete }) {
  return (
    <button type="button" className="btn-ghost btn-sm exec-row-delete" disabled={busy}
      title="삭제 (Ctrl+Z로 되돌릴 수 있어요)" onClick={onDelete}>
      <Trash2 size={13} /> 삭제
    </button>
  );
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
  const [tray, setTray] = useState(null); // null | 'complete' | 'partial' | 'reduce' | 'move'
  const [reduceMinutes, setReduceMinutes] = useState(item.estimatedMinutes ?? 30);
  const [partialPercent, setPartialPercent] = useState(50);
  const [moveDate, setMoveDate] = useState('');
  const [laterTime, setLaterTime] = useState(() => suggestLaterStart(item));
  /*
   * 실제 소요시간은 문자열로 들고 있는다. 숫자로 바꿔 두면 빈 칸이 0이 되어,
   * "재지 않았다"가 "0분"으로 조용히 바뀐다.
   *
   * 기본값·placeholder로 estimatedMinutes를 넣지 않는다. 예상값을 보여주면 사용자가
   * 그 근처를 고르게 되고(앵커링), 그러면 관찰 데이터가 계획 데이터의 메아리가 된다.
   */
  const [completeMinutes, setCompleteMinutes] = useState('');
  const [partialMinutes, setPartialMinutes] = useState('');
  const [trayError, setTrayError] = useState(null);

  const isDone = item.status === 'DONE';
  const isHold = item.status === 'HOLD';
  const canAct = item.status === 'PLANNED' && onAction;
  // 보류는 "당분간 실행 대상에서 빼둔 것"이지 끝난 것이 아니다 — 여기서 다시 꺼내거나
  // 지울 수 없으면 사용자가 손댈 방법이 없는 유령 항목이 된다. 반대로 이미 끝난
  // (DONE/CANCELLED) 항목에는 "다시 시작"을 노출하지 않는다.
  const canRevive = isHold && Boolean(onAction);
  // 같은 날 안에서 시각만 뒤로 미는 것은 시각이 정해진 항목에만 뜻이 있다.
  const canMoveLaterToday = Boolean(item.startTime && item.endTime && item.scheduledDate === todayString());

  const completeInput = readMinutes(completeMinutes);
  const partialInput = readMinutes(partialMinutes);

  const openTray = (name) => {
    setTray(name);
    setTrayError(null);
  };

  const closeTray = () => {
    setTray(null);
    setTrayError(null);
  };

  /**
   * 액션 실행. 성공했을 때만 트레이를 닫는다.
   *
   * 전에는 요청을 보내기 전에 닫았다. 실패하면 사용자가 친 값이 통째로 사라지고, 화면
   * 위쪽 오류 문구만 남아 무엇을 다시 입력해야 하는지도 알 수 없었다.
   *
   * 오류를 여기서 다시 잡지 않는다 — 부모가 이미 catch해서 문구를 세우고 결과를
   * 돌려준다. 두 층이 각자 잡으면 어느 쪽이 화면에 남았는지 알 수 없어진다.
   * 반환값이 없는 호출부(예전 계약)는 성공으로 본다.
   */
  const run = async (action, payload) => {
    setTrayError(null);
    const result = await onAction?.(action, item, payload);
    if (result === false || result?.ok === false) {
      setTrayError(failureMessage(result));
      return false;
    }
    setTray(null);
    setCompleteMinutes('');
    setPartialMinutes('');
    return true;
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

      {canRevive && (
        <div className="exec-row-actions">
          <button type="button" className="btn-primary btn-sm" disabled={busy}
            onClick={() => run('resume')}>
            <RotateCcw size={13} /> 다시 시작
          </button>
          <DeleteButton busy={busy} onDelete={() => run('delete')} />
        </div>
      )}

      {canAct && (
        <div className="exec-row-actions">
          {tray === null && (
            <>
              <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={() => openTray('complete')}>
                완료
              </button>
              <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => openTray('partial')}>
                일부 했어요
              </button>
              <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => openTray('reduce')}>
                줄이기
              </button>
              {/* "미루기"가 아니라 "이동"이다 — 언제 할지를 바꾸는 것이고, 오늘 안에서 뒤로
                  미는 것도 여기에 포함된다. 보류("당분간 실행 대상에서 빼두기")는 의미가 달라
                  이 버튼에 합치지 않는다. */}
              <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => openTray('move')}>
                이동
              </button>
              <DeleteButton busy={busy} onDelete={() => run('delete')} />
            </>
          )}

          {/*
            완료를 누르면 바로 보내지 않고 여기서 한 번 멈춘다. 실제로 걸린 시간은 끝난
            직후가 아니면 다시 물어볼 자리가 없기 때문이다.

            입력은 어디까지나 선택이다 — 시간을 모른다고 완료를 막으면, 기록하기 싫은
            사람은 완료 자체를 안 누르게 되고 그러면 상태까지 같이 틀어진다.
          */}
          {tray === 'complete' && (
            <div className="exec-tray exec-tray-record">
              <span className="exec-tray-lead">실제로 얼마나 걸렸어요?</span>
              <label className="inline-field">
                <input type="number" min="1" step="1" inputMode="numeric"
                  aria-label="실제 걸린 시간(분)"
                  value={completeMinutes}
                  onChange={(e) => setCompleteMinutes(e.target.value)} />
                <span>분</span>
              </label>
              <button type="button" className="btn-primary btn-sm" disabled={busy || !completeInput.valid}
                onClick={() => run('complete', withActualMinutes({}, completeInput))}>
                <Check size={13} /> 완료 기록
              </button>
              {/* 모른다고 하면 그대로 미측정이다. 예상값을 대신 채워 넣지 않는다. */}
              <button type="button" className="btn-ghost btn-sm" disabled={busy}
                onClick={() => run('complete', {})}>
                모르겠어요
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={closeTray} aria-label="완료 기록 취소">
                <X size={13} />
              </button>
              {trayError && <p className="exec-tray-error">{trayError}</p>}
            </div>
          )}

          {tray === 'partial' && (
            <div className="exec-tray exec-tray-record">
              <label className="inline-field">
                <span>얼마나</span>
                <select value={partialPercent} onChange={(e) => setPartialPercent(Number(e.target.value))}>
                  <option value={25}>조금 (25%)</option>
                  <option value={50}>절반 (50%)</option>
                  <option value={75}>거의 다 (75%)</option>
                </select>
              </label>
              {/* 시간은 곁들이는 값이다. 없다고 PARTIAL 기록 자체를 막지 않는다. */}
              <label className="inline-field">
                <span>실제 시간</span>
                <input type="number" min="1" step="1" inputMode="numeric"
                  aria-label="실제 걸린 시간(분)"
                  value={partialMinutes}
                  onChange={(e) => setPartialMinutes(e.target.value)} />
                <span>분</span>
              </label>
              <button type="button" className="btn-primary btn-sm" disabled={busy || !partialInput.valid}
                onClick={() => run('partial', withActualMinutes({ completionPercent: partialPercent }, partialInput))}>
                <Check size={13} /> 기록
              </button>
              <button type="button" className="btn-ghost btn-sm" disabled={busy}
                onClick={() => run('partial', { completionPercent: partialPercent })}>
                시간은 모르겠어요
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={closeTray} aria-label="일부 수행 기록 취소">
                <X size={13} />
              </button>
              {trayError && <p className="exec-tray-error">{trayError}</p>}
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
              <button type="button" className="btn-ghost btn-sm" onClick={closeTray} aria-label="줄이기 취소">
                <X size={13} />
              </button>
              {trayError && <p className="exec-tray-error">{trayError}</p>}
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
              <button type="button" className="btn-ghost btn-sm" onClick={closeTray} aria-label="이동 취소">
                <X size={13} />
              </button>
              {trayError && <p className="exec-tray-error">{trayError}</p>}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
