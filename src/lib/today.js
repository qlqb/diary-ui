/**
 * 오늘 화면이 "지금 상황"을 판단하는 규칙.
 *
 * 이 파일이 답하는 질문은 하나다: 계획이 이미 틀어졌는지 어떻게 아는가.
 *
 * 지나간 항목(overdue)의 정의는 좁게 잡는다 — 넓게 잡으면 아직 아무 문제도 없는 하루에
 * "밀렸어요"라고 말하게 되고, 그건 이 앱이 하지 않기로 한 압박이다.
 *   - 아직 결론이 나지 않은 것(PLANNED)만. DONE/PARTIAL/HOLD/CANCELLED는 사용자가 이미
 *     판단을 내린 상태이므로 다시 들이밀지 않는다.
 *   - 시각이 정해진 것만. 시각을 정하지 않은 항목은 "오후가 됐다"는 이유만으로 밀린 게 아니다.
 *   - 오늘 날짜의 항목만. 다른 날짜는 오늘 재조정 대상이 아니다.
 *   - 종료 시각이 지금을 지났을 때만. 진행 중(시작은 지났지만 종료 전)은 "지금"이지 밀린 게 아니다.
 *
 * 상태와 사건을 섞지 않는다는 기존 원칙 그대로, 여기서 새 status를 만들지 않는다 —
 * overdue는 저장되는 상태가 아니라 지금 시각으로 계산하는 화면상의 판단이다.
 */

import { minutesOf } from './datetime.js';

const PRIORITY_RANK = { MUST: 0, SHOULD: 1, OPTIONAL: 2 };

/** 시작/종료 시각이 모두 있는 항목인지. 백엔드 placementType=TIME_FIXED와 같은 의미다. */
export function isTimed(item) {
  return Boolean(item.startTime && item.endTime);
}

function startOf(item) {
  return minutesOf(item.startTime);
}

/**
 * 종료 시각(분). 종료가 시작보다 앞이면 자정을 넘긴 것으로 보고 null을 돌려준다 —
 * 그런 항목은 "지금 시각보다 이르다"는 계산 자체가 성립하지 않으므로 밀린 것으로 보지 않는다.
 * (현재 백엔드는 하루를 넘는 실행 조각을 만들 수 없다. 여기서 새 규칙을 만드는 게 아니라,
 *  그 전제가 깨진 데이터가 와도 오판하지 않게 방어할 뿐이다.)
 */
function endOf(item) {
  const start = startOf(item);
  const end = minutesOf(item.endTime);
  if (start == null || end == null) return null;
  return end > start ? end : null;
}

export function isOverdue(item, now, today) {
  if (item.status !== 'PLANNED') return false;
  if (today && item.scheduledDate && item.scheduledDate !== today) return false;
  if (!isTimed(item)) return false;
  const end = endOf(item);
  return end != null && end <= now;
}

function isRunning(item, now) {
  if (item.status !== 'PLANNED' || !isTimed(item)) return false;
  const start = startOf(item);
  const end = endOf(item);
  return end != null && now >= start && now < end;
}

function byPriorityThenOrder(a, b) {
  return (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1)
    || (a.displayOrder ?? 0) - (b.displayOrder ?? 0)
    || (a.executionItemId ?? 0) - (b.executionItemId ?? 0);
}

function byStartTime(a, b) {
  return String(a.startTime).localeCompare(String(b.startTime));
}

/**
 * 오늘 항목을 "지금 화면이 물어야 할 것"으로 나눈다.
 *
 * nowState는 지금 영역이 무엇을 보여줄지 하나로 정해준다:
 *   RUNNING   지금 실행할 일정이 있다
 *   OVERDUE   지금 할 것은 없는데 예정 시간이 지난 항목이 있다 — 남은 하루를 다시 잡을 때
 *   FOCUS     시각 없는 항목 중 가장 중요한 하나를 지금 할 것으로 제안한다
 *   UPCOMING  지금은 비어 있고 다음 일정만 남았다
 *   EMPTY     오늘 잡힌 것이 아예 없다
 */
export function classifyToday(items, now, today) {
  const all = items ?? [];
  const planned = all.filter((i) => i.status === 'PLANNED');

  const overdue = planned.filter((i) => isOverdue(i, now, today)).sort(byStartTime);
  const running = planned.filter((i) => isRunning(i, now)).sort(byStartTime);
  const upcoming = planned.filter((i) => isTimed(i) && startOf(i) > now).sort(byStartTime);
  const untimed = planned.filter((i) => !isTimed(i)).sort(byPriorityThenOrder);
  const finished = all.filter((i) => i.status !== 'PLANNED');

  const focus = running[0] ?? (overdue.length > 0 ? null : untimed[0] ?? null);

  let nowState;
  if (running.length > 0) nowState = 'RUNNING';
  else if (overdue.length > 0) nowState = 'OVERDUE';
  else if (untimed.length > 0) nowState = 'FOCUS';
  else if (upcoming.length > 0) nowState = 'UPCOMING';
  else nowState = 'EMPTY';

  // "남은 오늘"에 놓을 것: 지금 자리에 올라간 하나만 빼고, 지나간 것과 앞으로 할 것을 나눈다.
  const rest = [...untimed, ...upcoming].filter((i) => i !== focus);

  return {
    nowState,
    focus,
    overdue,
    upcoming,
    untimed,
    rest,
    finished,
    /** 다음 시각 고정 일정까지 남은 분. 없으면 null. */
    minutesToNext: upcoming.length > 0 ? startOf(upcoming[0]) - now : null,
    nextItem: upcoming[0] ?? null,
    remainingMinutes: planned.reduce((sum, i) => sum + (i.estimatedMinutes ?? 0), 0),
  };
}

/** 이 항목을 하는 데 걸릴 것으로 보는 시간. 예상 분이 없으면 잡혀 있던 길이를 쓴다. */
export function durationOf(item) {
  if (item.estimatedMinutes != null) return item.estimatedMinutes;
  const start = startOf(item);
  const end = endOf(item);
  return start != null && end != null ? end - start : 30;
}
