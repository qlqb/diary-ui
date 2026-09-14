/**
 * "남은 오늘 다시 잡기"의 초안 계산과 적용.
 *
 * 두 가지를 분명히 한다.
 *
 * 1) 초안은 아직 아무것도 바꾸지 않은 제안이다. buildRescheduleDraft()는 순수 계산이고
 *    서버를 부르지 않는다. 사용자가 검토하고 고친 뒤 applyReschedule()을 부를 때만 실제
 *    데이터가 바뀐다. 취소하면 초안을 버리는 것으로 끝난다.
 *
 * 2) 적용은 반드시 기존 도메인 액션을 통한다. status/date를 직접 PATCH하지 않는다 —
 *    이동은 move(MOVED 이벤트), 축소는 reduce(REDUCED 이벤트), 보류는 hold(HOLD 이벤트)로
 *    남아야 나중에 "기상 늦음이었던 날 무엇을 옮겼나"를 되짚을 수 있다.
 *
 * 추천 규칙은 AI가 아니라 규칙 기반이다(버튼을 누르는 순간 OpenAI를 부르지 않는다).
 * 지금부터 다음 고정 일정까지 실제로 남은 시간에 들어가는 것만 오늘 뒤로 옮기고,
 * 반쯤이라도 들어가면 줄여서 오늘 안에 두고, 그래도 안 되면 내일로 옮기거나(꼭 해야 하는 것)
 * 보류한다(여유 있으면 하는 것). "전부 내일로" 같은 일괄 처리는 하지 않는다.
 */

import { executionItemAPI } from '../api/api.js';
import { ceilToStep, clampToDay, hhmmOf, minutesOf, shiftDate } from './datetime.js';
import { durationOf, isTimed } from './today.js';

/** 다음 일정이 없을 때 오늘을 어디까지로 볼지. 자정까지 밀어 넣지 않는다. */
export const DAY_END_MINUTES = 22 * 60;

/** 조각 사이 최소 숨 돌릴 틈. */
const GAP_MINUTES = 5;

/** 이보다 작게 줄이면 실행이 아니라 형식이 된다. */
const MIN_CHUNK_MINUTES = 15;

const STEP_MINUTES = 5;

const PRIORITY_RANK = { MUST: 0, SHOULD: 1, OPTIONAL: 2 };

export const DECISIONS = {
  KEEP: 'KEEP',
  LATER_TODAY: 'LATER_TODAY',
  TOMORROW: 'TOMORROW',
  PICK_DATE: 'PICK_DATE',
  HOLD: 'HOLD',
};

/** 오늘 안에서 지금부터 실제로 쓸 수 있는 구간. 다음 고정 일정이 경계가 된다. */
export function freeWindow(now, upcoming) {
  const start = clampToDay(ceilToStep(now, STEP_MINUTES));
  const nextFixed = (upcoming ?? []).find((i) => isTimed(i));
  const end = nextFixed ? minutesOf(nextFixed.startTime) : DAY_END_MINUTES;
  return { start, end: Math.max(start, end), boundary: nextFixed ?? null };
}

/**
 * 지나간 항목들에 대한 재조정 초안.
 *
 * @param overdue  예정 시간이 지난 미완료 항목들
 * @param upcoming 오늘 남아있는 시각 고정 일정들(경계로만 쓴다 — 이 항목들은 건드리지 않는다)
 */
export function buildRescheduleDraft(overdue, upcoming, now, today) {
  const window = freeWindow(now, upcoming);
  const ordered = [...(overdue ?? [])].sort((a, b) =>
    (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1)
    || String(a.startTime).localeCompare(String(b.startTime)));

  let cursor = window.start;
  const byId = new Map();

  for (const item of ordered) {
    const wanted = durationOf(item);
    const available = window.end - cursor;

    if (available >= wanted) {
      byId.set(item.executionItemId, laterToday(item, cursor, wanted, today));
      cursor += wanted + GAP_MINUTES;
      continue;
    }

    const shrunk = Math.floor(available / STEP_MINUTES) * STEP_MINUTES;
    if (shrunk >= MIN_CHUNK_MINUTES) {
      byId.set(item.executionItemId, laterToday(item, cursor, shrunk, today));
      cursor = window.end;
      continue;
    }

    byId.set(item.executionItemId, item.priority === 'OPTIONAL'
      ? entry(item, DECISIONS.HOLD, { reasonText: '오늘은 빼두기' })
      : entry(item, DECISIONS.TOMORROW, { toDate: shiftDate(today, 1), reasonText: '오늘 남은 시간에 들어가지 않아요' }));
  }

  // 원래 순서(시간순)로 돌려준다 — 사용자가 화면에서 보는 순서는 추천 계산 순서가 아니다.
  return (overdue ?? []).map((item) => byId.get(item.executionItemId)).filter(Boolean);
}

function laterToday(item, startMinutes, minutes, today) {
  const start = clampToDay(startMinutes);
  const end = clampToDay(start + minutes);
  const shrunk = minutes < durationOf(item);
  return entry(item, DECISIONS.LATER_TODAY, {
    toDate: today,
    startTime: hhmmOf(start),
    endTime: hhmmOf(end),
    expectedMinutes: minutes,
    reasonText: shrunk ? `${minutes}분으로 줄여 오늘 안에` : '오늘 남은 시간에 그대로',
  });
}

function entry(item, decision, extra = {}) {
  return {
    executionItemId: item.executionItemId,
    title: item.title,
    beforeStartTime: item.startTime,
    beforeEndTime: item.endTime,
    beforeExpectedMinutes: item.estimatedMinutes ?? durationOf(item),
    priority: item.priority,
    decision,
    startTime: null,
    endTime: null,
    expectedMinutes: item.estimatedMinutes ?? durationOf(item),
    toDate: null,
    ...extra,
    /** 규칙이 처음 제안한 값. 사용자가 고친 뒤에도 "추천은 이거였다"를 보여주기 위해 남긴다. */
    recommended: { decision, ...extra },
  };
}

/** 한 항목에 실제로 걸릴 변경이 있는지. KEEP이거나 아무것도 안 달라지면 부르지 않는다. */
export function hasChange(entryValue) {
  if (entryValue.decision === DECISIONS.KEEP) return false;
  if (entryValue.decision === DECISIONS.LATER_TODAY) {
    return entryValue.startTime !== entryValue.beforeStartTime
      || entryValue.endTime !== entryValue.beforeEndTime
      || entryValue.expectedMinutes !== entryValue.beforeExpectedMinutes;
  }
  return true;
}

/**
 * 초안을 실제 데이터에 반영한다. 항목마다 기존 도메인 액션을 순서대로 부른다.
 *
 * 일괄 적용 API를 새로 만들지 않는다 — 항목 사이에 지켜야 할 불변식이 없고(A를 옮기는 것이
 * B의 유효성을 바꾸지 않는다), 각 액션은 그 자체로 원자적이며 낙관적 락과 이벤트 기록을 이미
 * 갖고 있다. 도중에 하나가 실패하면 그 항목만 실패로 보고하고 나머지는 그대로 반영된 상태로
 * 둔다(그게 사용자가 화면에서 보는 것과도 일치한다).
 *
 * 한 항목에 줄이기와 이동이 함께 필요하면 reduce -> move 순서로 부르고, reduce가 돌려준
 * version을 move에 그대로 넘긴다 — 중간에 version을 다시 조회하지 않는다.
 *
 * @param itemsById 화면이 들고 있는 실제 항목(version을 여기서 읽는다)
 * @param reason    이 조정이 왜 일어났는지. 이벤트에 그대로 남는다(예: "다시 잡기: 기상 늦음")
 */
export async function applyReschedule(entries, itemsById, reason) {
  const failures = [];
  let applied = 0;

  for (const value of entries) {
    if (!hasChange(value)) continue;
    const item = itemsById.get(value.executionItemId);
    if (!item) {
      failures.push({ title: value.title, message: '항목을 찾을 수 없어요.' });
      continue;
    }

    try {
      let version = item.version;

      if (value.decision !== DECISIONS.HOLD
          && value.expectedMinutes != null
          && value.expectedMinutes !== value.beforeExpectedMinutes) {
        const reduced = await executionItemAPI.reduce(value.executionItemId, {
          version,
          expectedMinutes: value.expectedMinutes,
          reason,
        });
        version = reduced.version;
      }

      if (value.decision === DECISIONS.HOLD) {
        await executionItemAPI.hold(value.executionItemId, version, reason);
      } else if (value.decision === DECISIONS.LATER_TODAY) {
        await executionItemAPI.move(value.executionItemId, value.toDate, version, {
          reason,
          startTime: value.startTime,
          endTime: value.endTime,
        });
      } else {
        await executionItemAPI.move(value.executionItemId, value.toDate, version, { reason });
      }
      applied += 1;
    } catch (err) {
      failures.push({ title: value.title, message: err.message || '처리하지 못했습니다.' });
    }
  }

  return { applied, failures };
}
