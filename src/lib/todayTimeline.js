/**
 * 오늘 화면의 "시간 점유" 계산.
 *
 * classifyToday()와 나눠 두는 이유가 이 파일의 존재 이유다.
 *
 *   ExecutionItem ──> classifyToday() ──> 실행 상태
 *                                        focus / overdue / finished / remainingMinutes
 *
 *   ExecutionItem ─┐
 *   RoutineOccurrence ─┤ ──> buildTodayTimeline() ──> 시간 상태
 *                                        currentBusy / nextEntry / minutesToNext
 *
 * classifyToday는 단순 정렬 함수가 아니라 status === 'PLANNED'를 전제로 밀린 항목과
 * 남은 실행량을 판단하는 ExecutionItem 전용 규칙이다. 루틴에는 그런 상태가 없다.
 * 루틴을 거기에 넣으면 필터에서 조용히 사라지거나, PLANNED를 억지로 붙여 루틴이 실행
 * 조각처럼 취급된다. 무엇보다 remainingMinutes("오늘 남은 실행량")에 수업 3시간이
 * 섞이면 "남은 예정 5시간"이 "해야 할 일 2시간 + 수업 3시간"이 되어 숫자가 거짓말을 한다.
 *
 * 그래서 합치는 것은 저장이 아니라 화면이다. 여기서 만드는 TodayTimelineEntry는 읽기
 * 전용 모델이고, 저장하지 않으며 API 응답 형태도 바꾸지 않는다. 원본은 셋 그대로
 * 분리된 채 남는다.
 *
 * TodayTimelineEntry {
 *   kind       'EXECUTION' | 'ROUTINE'   (다음: 'COMMITMENT')
 *   title
 *   startAt / endAt   표시용 원본 값
 *   location
 *   sourceRef  executionItemId, 또는 routineId + date
 *   startMinutes / endMinutes   오늘 자정 기준 분. 계산은 전부 이 둘로 한다
 * }
 */

import { minutesOf, parseDateString, toHHmm } from './datetime.js';
import { isTimed } from './today.js';

const DAY = 24 * 60;

/**
 * 오늘 자정 기준 분으로 바꾼다. 어제 시작이면 음수, 내일 끝이면 1440을 넘는다.
 *
 * 자르지 않고 그대로 돌려준다 — 자르는 것은 판정하는 쪽의 일이고, 여기서 미리 잘라 두면
 * "어제 시작한 것"과 "오늘 0시에 시작한 것"을 구분할 수 없게 된다.
 */
function minutesFromToday(isoDateTime, today) {
  if (!isoDateTime || !today) return null;
  const minutes = minutesOf(toHHmm(isoDateTime));
  if (minutes == null) return null;
  const date = String(isoDateTime).slice(0, 10);
  const dayOffset = Math.round(
    (parseDateString(date) - parseDateString(today)) / (DAY * 60 * 1000),
  );
  return dayOffset * DAY + minutes;
}

/**
 * 실행 조각 → 타임라인 항목.
 *
 * 시각이 정해진 PLANNED만 시간을 점유한다. 끝난 것(DONE/PARTIAL/HOLD/CANCELLED)은
 * 사용자가 이미 판단을 내린 것이라 앞으로의 시간을 막지 않고, 시각 없는 항목은 애초에
 * 어느 시간을 막는지 알 수 없다.
 */
function fromExecutionItem(item, today) {
  if (item.status !== 'PLANNED' || !isTimed(item)) return null;
  const date = item.scheduledDate ?? today;
  if (date !== today) return null;
  const startMinutes = minutesOf(item.startTime);
  const endMinutes = minutesOf(item.endTime);
  // 백엔드는 하루를 넘는 실행 조각을 만들지 않는다. 그 전제가 깨진 데이터는 버린다.
  if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) return null;
  return {
    kind: 'EXECUTION',
    title: item.title,
    startAt: item.startTime,
    endAt: item.endTime,
    location: null,
    sourceRef: { executionItemId: item.executionItemId },
    startMinutes,
    endMinutes,
  };
}

/**
 * 루틴 발생분 → 타임라인 항목.
 *
 * startAt/endAt이 절대 시각(ISO)이라 자정 넘김이 그대로 실려 온다. 22:00~02:00이면
 * 어제 시작한 발생분의 startMinutes가 음수가 되는데, 그게 정확하다 — 지금이 01:00이면
 * 이 알바는 진행 중이다.
 */
function fromRoutineOccurrence(occurrence, today) {
  const startMinutes = minutesFromToday(occurrence.startAt, today);
  const endMinutes = minutesFromToday(occurrence.endAt, today);
  if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) return null;
  // 오늘과 한 순간도 겹치지 않으면 오늘의 시간을 점유하지 않는다(반열린 구간).
  if (endMinutes <= 0 || startMinutes >= DAY) return null;
  return {
    kind: 'ROUTINE',
    title: occurrence.title,
    startAt: occurrence.startAt,
    endAt: occurrence.endAt,
    location: occurrence.location ?? null,
    sourceRef: { routineId: occurrence.routineId, date: String(occurrence.startAt).slice(0, 10) },
    startMinutes,
    endMinutes,
  };
}

/**
 * 시간을 점유하는 소스 목록.
 *
 * 소스를 늘릴 때 여기에 한 줄을 추가한다 — 일회성 약속(COMMITMENT)이 다음에 이 자리로
 * 들어온다. 아래 계산은 kind를 보고 분기하지 않으므로 소스가 늘어도 고칠 곳이 없다.
 */
const TIMELINE_SOURCES = [
  { key: 'items', map: fromExecutionItem },
  { key: 'occurrences', map: fromRoutineOccurrence },
];

/** 같은 시각에 여럿이면 짧은 것부터. 화면이 매번 같은 순서로 그려지기만 하면 된다. */
function byStartThenEnd(a, b) {
  return a.startMinutes - b.startMinutes
    || a.endMinutes - b.endMinutes
    || String(a.kind).localeCompare(String(b.kind))
    || String(a.title).localeCompare(String(b.title));
}

/**
 * 오늘 시간을 점유하는 것들을 한 줄로 세운다.
 *
 * @param sources { items, occurrences, ... } 원본 그대로. 소스별 형태를 여기서 흡수한다
 * @param today   'YYYY-MM-DD'
 */
export function buildTodayTimeline(sources, today) {
  const entries = [];
  for (const source of TIMELINE_SOURCES) {
    for (const raw of sources?.[source.key] ?? []) {
      const entry = source.map(raw, today);
      if (entry) entries.push(entry);
    }
  }
  return entries.sort(byStartThenEnd);
}

/**
 * 지금 시각 기준의 시간 상태.
 *
 * busy는 지금 진행 중인 것 전부다. 하나로 줄이지 않는다 — 수업과 실행 조각이 겹칠 수 있고,
 * 어느 쪽을 "지금"의 주인공으로 삼을지는 화면이 정할 문제다.
 */
export function todayOccupancy(entries, now) {
  const all = entries ?? [];
  const busy = all.filter((e) => e.startMinutes <= now && now < e.endMinutes);
  const nextEntry = all.find((e) => e.startMinutes > now) ?? null;
  return {
    busy,
    nextEntry,
    minutesToNext: nextEntry ? nextEntry.startMinutes - now : null,
  };
}

/** 실행 조각이 아닌 점유(루틴·약속). "지금 이걸 하세요"를 띄우면 안 되는 근거가 된다. */
export function blockingEntries(entries) {
  return (entries ?? []).filter((e) => e.kind !== 'EXECUTION');
}
