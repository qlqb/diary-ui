/**
 * 오늘 화면의 "시간 점유" 계산.
 *
 * classifyToday()와 나눠 두는 이유가 이 파일의 존재 이유다.
 *
 *   ExecutionItem ──> classifyToday() ──> 실행 상태
 *                                        focus / overdue / finished / remainingMinutes
 *
 *   ExecutionItem ─┐
 *   RoutineOccurrence ─┤ ──> buildTodayTimeline() ──> classifyTimeline() ──> 시간 상태
 *   Commitment ────────┘                      currentEntries / nextTimed / minutesToNext
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
 *   key          목록 렌더 키. 원본이 달라도 충돌하지 않게 kind를 앞에 붙인다
 *   kind         'EXECUTION' | 'ROUTINE' | 'COMMITMENT'
 *   title
 *   startAt      'YYYY-MM-DDTHH:mm' 로컬 시각. HH:mm만으로는 자정 넘김을 표현할 수 없다
 *   endAt
 *   locationText
 *   sourceRef    'execution:12' / 'routine:9:2026-09-03' / 'commitment:5'
 *   startMinutes / endMinutes   오늘 자정 기준 분. 계산은 전부 이 둘로 한다
 * }
 *
 * ★ 시각을 HH:mm으로만 들고 있지 않는다. 22:00~02:00 루틴에서 "어제 22:00"과
 *   "오늘 22:00"이 같은 값이 되어, 지금 진행 중인지를 판단할 수 없게 된다.
 *   시간대 변환 체계를 새로 만들지는 않는다 — 서버/클라이언트 모두 로컬 시각 의미 그대로다.
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
function minutesFromToday(localDateTime, today) {
  if (!localDateTime || !today) return null;
  const minutes = minutesOf(toHHmm(localDateTime));
  if (minutes == null) return null;
  const date = String(localDateTime).slice(0, 10);
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
 *
 * 장소 개념이 실행 조각에는 아직 없다. 없는 것을 지어내지 않고 null로 둔다.
 */
function fromExecutionItem(item, today) {
  if (item.status !== 'PLANNED' || !isTimed(item)) return null;
  const date = item.scheduledDate ?? today;
  if (date !== today) return null;
  const start = minutesOf(item.startTime);
  const end = minutesOf(item.endTime);
  // 백엔드는 하루를 넘는 실행 조각을 만들지 않는다. 그 전제가 깨진 데이터는 버린다.
  if (start == null || end == null || end <= start) return null;
  return {
    key: `EXECUTION:${item.executionItemId}`,
    kind: 'EXECUTION',
    title: item.title,
    startAt: `${date}T${toHHmm(item.startTime)}`,
    endAt: `${date}T${toHHmm(item.endTime)}`,
    locationText: null,
    sourceRef: `execution:${item.executionItemId}`,
    startMinutes: start,
    endMinutes: end,
  };
}

/**
 * 루틴 발생분 → 타임라인 항목.
 *
 * startAt/endAt이 이미 날짜를 포함한 값이라 자정 넘김이 그대로 실려 온다. 22:00~02:00이면
 * 어제 시작한 발생분의 startMinutes가 음수가 되는데, 그게 정확하다 — 지금이 01:00이면
 * 이 알바는 진행 중이다.
 *
 * sourceRef의 날짜는 규칙상 원래 날짜(sourceDate)다. 이동해 온 발생분(보강)이 원본과
 * 같은 키를 갖지 않게 하려면 이동 전 날짜가 아니라 실제 발생일이어야 하므로 startAt의
 * 날짜를 쓴다.
 */
function fromRoutineOccurrence(occurrence, today) {
  const startMinutes = minutesFromToday(occurrence.startAt, today);
  const endMinutes = minutesFromToday(occurrence.endAt, today);
  if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) return null;
  // 오늘과 한 순간도 겹치지 않으면 오늘의 시간을 점유하지 않는다(반열린 구간).
  if (endMinutes <= 0 || startMinutes >= DAY) return null;
  const occurredOn = String(occurrence.startAt).slice(0, 10);
  return {
    key: `ROUTINE:${occurrence.routineId}:${occurredOn}`,
    kind: 'ROUTINE',
    title: occurrence.title,
    startAt: occurrence.startAt,
    endAt: occurrence.endAt,
    locationText: occurrence.location ?? null,
    sourceRef: `routine:${occurrence.routineId}:${occurredOn}`,
    startMinutes,
    endMinutes,
  };
}

/**
 * 일회성 약속 → 타임라인 항목.
 *
 * 루틴과 거의 같다 — 다른 것은 반복이냐 한 번이냐뿐이고, 시간을 막는다는 의미는 같다.
 * 그래서 판정 함수들은 이 둘을 구분하지 않는다(kind로 분기하지 않는다).
 *
 * startAt/endAt이 서버에서 이미 날짜를 포함한 값으로 온다. 22:00~다음날 02:00이 그대로
 * 실려 오므로 자정 넘김 추론이 필요 없다.
 */
function fromCommitment(commitment, today) {
  const startMinutes = minutesFromToday(commitment.startAt, today);
  const endMinutes = minutesFromToday(commitment.endAt, today);
  if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) return null;
  if (endMinutes <= 0 || startMinutes >= DAY) return null;
  return {
    key: `COMMITMENT:${commitment.commitmentId}`,
    kind: 'COMMITMENT',
    title: commitment.title,
    startAt: commitment.startAt,
    endAt: commitment.endAt,
    locationText: commitment.locationText ?? null,
    sourceRef: `commitment:${commitment.commitmentId}`,
    startMinutes,
    endMinutes,
  };
}

/**
 * 시간을 점유하는 소스 목록.
 *
 * 소스를 늘릴 때 여기에 한 줄을 추가한다. 아래 계산은 kind를 보고 분기하지 않으므로
 * 소스가 늘어도 고칠 곳이 없다.
 */
const TIMELINE_SOURCES = [
  { key: 'items', map: fromExecutionItem },
  { key: 'occurrences', map: fromRoutineOccurrence },
  { key: 'commitments', map: fromCommitment },
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
 * @param sources { items, occurrences, commitments } 원본 그대로. 형태를 여기서 흡수한다
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
 * currentEntries는 지금 진행 중인 것 전부다. 하나로 줄이지 않는다 — 수업과 실행 조각이
 * 겹칠 수 있고(14~17시 수업 안의 15~16시 조각), 어느 쪽을 "지금"의 주인공으로 삼을지는
 * 화면이 정할 문제다. 여기서 충돌을 자동으로 해결하지 않는다.
 */
export function classifyTimeline(entries, now) {
  const all = entries ?? [];
  const currentEntries = all.filter((e) => e.startMinutes <= now && now < e.endMinutes);
  const nextTimed = all.find((e) => e.startMinutes > now) ?? null;
  return {
    currentEntries,
    nextTimed,
    minutesToNext: nextTimed ? nextTimed.startMinutes - now : null,
  };
}

/** 실행 조각이 아닌 점유(루틴·약속). "지금 이걸 하세요"를 띄우면 안 되는 근거가 된다. */
export function blockingEntries(entries) {
  return (entries ?? []).filter((e) => e.kind !== 'EXECUTION');
}
