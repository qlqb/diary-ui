/**
 * 시간 점유 계산이 실행 상태와 섞이지 않는지 고정한다.
 *
 * 여기서 지키는 선은 하나다: 루틴은 시간을 막지만 실행 상태를 갖지 않는다.
 * 그 선이 무너지면 "남은 예정 5시간"이 해야 할 일 2시간과 수업 3시간을 합친 숫자가 된다.
 */

import { describe, it, expect } from 'vitest';
import { blockingEntries, buildTodayTimeline, todayOccupancy } from './todayTimeline.js';
import { classifyToday } from './today.js';

const TODAY = '2026-09-03';
const YESTERDAY = '2026-09-02';

function item(id, startTime, endTime, extra = {}) {
  return {
    executionItemId: id,
    title: `할 일 ${id}`,
    scheduledDate: TODAY,
    startTime,
    endTime,
    estimatedMinutes: 60,
    status: 'PLANNED',
    priority: 'SHOULD',
    version: 0,
    ...extra,
  };
}

function occurrence(routineId, title, startAt, endAt, extra = {}) {
  return { routineId, courseId: null, title, location: null, startAt, endAt, moved: false, ...extra };
}

const at = (hhmm, date = TODAY) => `${date}T${hhmm}:00`;

describe('buildTodayTimeline', () => {
  it('실행 조각과 루틴을 시간순 한 줄로 세운다', () => {
    const timeline = buildTodayTimeline({
      items: [item(1, '15:00', '16:00')],
      occurrences: [occurrence(9, '웹서버 수업', at('14:00'), at('17:00'))],
    }, TODAY);

    expect(timeline.map((e) => e.kind)).toEqual(['ROUTINE', 'EXECUTION']);
    expect(timeline[0].title).toBe('웹서버 수업');
    expect(timeline[0].sourceRef).toEqual({ routineId: 9, date: TODAY });
    expect(timeline[1].sourceRef).toEqual({ executionItemId: 1 });
  });

  it('끝난 실행 조각은 시간을 막지 않는다', () => {
    const timeline = buildTodayTimeline({
      items: [item(1, '15:00', '16:00', { status: 'DONE' })],
      occurrences: [],
    }, TODAY);

    expect(timeline).toHaveLength(0);
  });

  it('시각 없는 실행 조각은 어느 시간을 막는지 알 수 없으므로 넣지 않는다', () => {
    const timeline = buildTodayTimeline({
      items: [item(1, null, null)],
      occurrences: [],
    }, TODAY);

    expect(timeline).toHaveLength(0);
  });

  it('전날 시작해 오늘까지 이어지는 루틴이 사라지지 않는다', () => {
    // 22:00~02:00 알바. 서버가 창 하루 앞부터 전개해 이 발생분을 오늘 응답에 담아 준다.
    const timeline = buildTodayTimeline({
      items: [],
      occurrences: [occurrence(9, '알바', at('22:00', YESTERDAY), at('02:00'))],
    }, TODAY);

    expect(timeline).toHaveLength(1);
    // 어제 시작이므로 오늘 자정 기준으로는 음수다 — 잘라 버리면 "지금 진행 중"을 놓친다.
    expect(timeline[0].startMinutes).toBe(-120);
    expect(timeline[0].endMinutes).toBe(120);
  });

  it('오늘과 한 순간도 겹치지 않는 발생분은 오늘 시간을 막지 않는다', () => {
    const timeline = buildTodayTimeline({
      items: [],
      occurrences: [occurrence(9, '어제 수업', at('09:00', YESTERDAY), at('11:00', YESTERDAY))],
    }, TODAY);

    expect(timeline).toHaveLength(0);
  });
});

describe('todayOccupancy', () => {
  const timeline = () => buildTodayTimeline({
    items: [item(1, '18:00', '19:00')],
    occurrences: [occurrence(9, '웹서버 수업', at('14:00'), at('17:00'))],
  }, TODAY);

  it('실행 조각보다 루틴이 먼저면 다음 일정은 루틴이다', () => {
    const { nextEntry, minutesToNext } = todayOccupancy(timeline(), 13 * 60);

    expect(nextEntry.title).toBe('웹서버 수업');
    expect(nextEntry.kind).toBe('ROUTINE');
    expect(minutesToNext).toBe(60);
  });

  it('루틴이 지나가면 다음 일정은 실행 조각이 된다', () => {
    const { nextEntry, minutesToNext } = todayOccupancy(timeline(), 17 * 60);

    expect(nextEntry.kind).toBe('EXECUTION');
    expect(minutesToNext).toBe(60);
  });

  it('진행 중이면 busy에 담기고 다음 일정으로는 세지 않는다', () => {
    const { busy, nextEntry } = todayOccupancy(timeline(), 15 * 60);

    expect(busy.map((e) => e.title)).toEqual(['웹서버 수업']);
    expect(nextEntry.kind).toBe('EXECUTION');
  });

  it('자정 넘긴 알바가 새벽에도 진행 중으로 잡힌다', () => {
    const overnight = buildTodayTimeline({
      items: [],
      occurrences: [occurrence(9, '알바', at('22:00', YESTERDAY), at('02:00'))],
    }, TODAY);

    expect(todayOccupancy(overnight, 60).busy.map((e) => e.title)).toEqual(['알바']);
    expect(todayOccupancy(overnight, 10 * 60).busy).toEqual([]);
  });

  it('끝나는 순간은 진행 중이 아니다', () => {
    expect(todayOccupancy(timeline(), 17 * 60).busy).toEqual([]);
  });
});

describe('실행 상태와의 분리', () => {
  const items = [item(1, '18:00', '19:00')];
  const occurrences = [occurrence(9, '웹서버 수업', at('14:00'), at('17:00'))];

  it('remainingMinutes에 루틴 시간이 더해지지 않는다', () => {
    const { remainingMinutes } = classifyToday(items, 13 * 60, TODAY);

    // 실행 조각 60분만. 수업 180분이 섞이면 "남은 예정"이 못 쓰는 시간까지 센 숫자가 된다.
    expect(remainingMinutes).toBe(60);
  });

  it('루틴은 classifyToday의 어떤 분류에도 들어가지 않는다', () => {
    const timelineEntries = buildTodayTimeline({ items, occurrences }, TODAY);
    const result = classifyToday(items, 15 * 60, TODAY);

    // 타임라인은 수업을 안다.
    expect(timelineEntries).toHaveLength(2);
    // 실행 상태는 모른다 — 여기에 수업이 섞이면 밀린 항목이나 focus로 잡힐 수 있다.
    expect(result.overdue).toHaveLength(0);
    expect(result.upcoming.map((i) => i.executionItemId)).toEqual([1]);
    expect(result.finished).toHaveLength(0);
  });

  it('blockingEntries는 실행 조각이 아닌 것만 고른다', () => {
    const entries = buildTodayTimeline({ items, occurrences }, TODAY);

    expect(blockingEntries(entries).map((e) => e.kind)).toEqual(['ROUTINE']);
  });
});
