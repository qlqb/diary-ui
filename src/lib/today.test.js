/**
 * 계획이 틀어졌는지 판단하는 규칙을 고정한다.
 *
 * 여기서 지켜야 하는 것은 두 방향이다. 밀린 것을 놓치지 않는 것과, 밀리지 않은 것을 밀렸다고
 * 말하지 않는 것. 후자가 더 중요하다 — 아무 문제 없는 하루에 "3개 밀렸어요"라고 말하는 화면은
 * 사용자가 다시는 믿지 않는다.
 */

import { describe, it, expect } from 'vitest';
import { classifyToday, isOverdue } from './today.js';

const TODAY = '2026-08-15';
const AFTERNOON = 15 * 60 + 40; // 15:40

function timed(id, startTime, endTime, extra = {}) {
  return {
    executionItemId: id,
    title: `항목 ${id}`,
    scheduledDate: TODAY,
    startTime,
    endTime,
    estimatedMinutes: 30,
    status: 'PLANNED',
    priority: 'SHOULD',
    displayOrder: id,
    ...extra,
  };
}

function untimed(id, extra = {}) {
  return {
    executionItemId: id,
    title: `항목 ${id}`,
    scheduledDate: TODAY,
    startTime: null,
    endTime: null,
    estimatedMinutes: 30,
    status: 'PLANNED',
    priority: 'SHOULD',
    displayOrder: id,
    ...extra,
  };
}

describe('시나리오 1: 오전 일정이 전부 밀린 오후', () => {
  const items = [
    timed(1, '10:00', '10:15'),
    timed(2, '10:30', '11:20'),
    timed(3, '11:30', '11:50'),
    timed(4, '17:00', '23:00'),
  ];

  it('지금 영역이 "지난 일정 3개" 상태가 된다', () => {
    const result = classifyToday(items, AFTERNOON, TODAY);

    expect(result.nowState).toBe('OVERDUE');
    expect(result.overdue.map((i) => i.executionItemId)).toEqual([1, 2, 3]);
    // 지나간 항목이 있을 때 "지금 할 것"을 억지로 하나 골라 밀린 사실을 가리지 않는다.
    expect(result.focus).toBeNull();
  });

  it('17시 일정은 앞으로 할 일로 분리된다', () => {
    const result = classifyToday(items, AFTERNOON, TODAY);

    expect(result.upcoming.map((i) => i.executionItemId)).toEqual([4]);
    expect(result.nextItem.executionItemId).toBe(4);
    expect(result.minutesToNext).toBe(17 * 60 - AFTERNOON);
  });
});

describe('시나리오 2: 오전 3개 중 2개를 이미 끝냈다', () => {
  it('결론이 난 항목은 다시 들이밀지 않는다', () => {
    const items = [
      timed(1, '10:00', '10:15', { status: 'DONE' }),
      timed(2, '10:30', '11:20', { status: 'DONE' }),
      timed(3, '11:30', '11:50'),
    ];

    const result = classifyToday(items, AFTERNOON, TODAY);

    expect(result.overdue.map((i) => i.executionItemId)).toEqual([3]);
    expect(result.finished).toHaveLength(2);
  });

  it('보류·취소도 재조정 대상이 아니다', () => {
    const items = [
      timed(1, '10:00', '10:15', { status: 'HOLD' }),
      timed(2, '10:30', '11:20', { status: 'CANCELLED' }),
    ];

    expect(classifyToday(items, AFTERNOON, TODAY).overdue).toHaveLength(0);
  });
});

describe('시나리오 3: 시각을 정하지 않은 항목', () => {
  it('오후가 됐다는 이유만으로 밀린 것으로 보지 않는다', () => {
    const result = classifyToday([untimed(1)], AFTERNOON, TODAY);

    expect(result.overdue).toHaveLength(0);
    // 지나간 것이 없으면 시각 없는 항목 중 하나가 "지금 할 것"이 된다(기존 동작).
    expect(result.nowState).toBe('FOCUS');
    expect(result.focus.executionItemId).toBe(1);
  });

  it('시각 없는 항목만 있으면 재조정 CTA를 띄우지 않는다', () => {
    expect(classifyToday([untimed(1), untimed(2)], AFTERNOON, TODAY).nowState).not.toBe('OVERDUE');
  });
});

describe('경계 조건', () => {
  it('진행 중인 일정은 밀린 것이 아니라 "지금"이다', () => {
    const items = [timed(1, '15:30', '16:10')];
    const result = classifyToday(items, AFTERNOON, TODAY);

    expect(result.nowState).toBe('RUNNING');
    expect(result.focus.executionItemId).toBe(1);
    expect(result.overdue).toHaveLength(0);
  });

  it('진행 중인 일정이 있어도 밀린 항목은 따로 집계된다', () => {
    const items = [timed(1, '10:00', '10:15'), timed(2, '15:30', '16:10')];
    const result = classifyToday(items, AFTERNOON, TODAY);

    expect(result.nowState).toBe('RUNNING');
    expect(result.overdue.map((i) => i.executionItemId)).toEqual([1]);
  });

  it('오늘이 아닌 날짜는 오늘 재조정 대상이 아니다', () => {
    const item = timed(1, '10:00', '10:15', { scheduledDate: '2026-08-14' });

    expect(isOverdue(item, AFTERNOON, TODAY)).toBe(false);
  });

  it('종료 시각이 시작보다 앞이면(자정 넘김) 밀린 것으로 보지 않는다', () => {
    const item = timed(1, '23:00', '01:00');

    expect(isOverdue(item, AFTERNOON, TODAY)).toBe(false);
  });

  it('종료 시각이 아직 지나지 않았으면 밀린 것이 아니다', () => {
    expect(isOverdue(timed(1, '15:00', '15:41'), AFTERNOON, TODAY)).toBe(false);
    expect(isOverdue(timed(1, '15:00', '15:40'), AFTERNOON, TODAY)).toBe(true);
  });

  it('오늘 아무것도 없으면 빈 상태다', () => {
    const result = classifyToday([], AFTERNOON, TODAY);

    expect(result.nowState).toBe('EMPTY');
    expect(result.focus).toBeNull();
  });

  it('앞으로 올 일정만 있으면 남은 시간을 알려주는 상태다', () => {
    const result = classifyToday([timed(1, '16:30', '17:00')], AFTERNOON, TODAY);

    expect(result.nowState).toBe('UPCOMING');
    expect(result.minutesToNext).toBe(50);
  });
});
