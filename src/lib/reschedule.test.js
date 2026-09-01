/**
 * 재조정 초안의 계약을 고정한다.
 *
 * 가장 중요한 것: 초안을 만드는 동안에는 어떤 서버 호출도 일어나지 않고, 적용은 반드시 기존
 * 도메인 액션(move/reduce/hold)을 통한다 — status/date를 직접 갈아끼워 이벤트 기록을 우회하는
 * 경로가 생기면 나중에 무엇을 왜 옮겼는지 되짚을 수 없다.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DECISIONS, applyReschedule, buildRescheduleDraft, freeWindow } from './reschedule.js';
import { executionItemAPI } from '../api/api.js';

vi.mock('../api/api.js', () => ({
  executionItemAPI: {
    move: vi.fn(),
    reduce: vi.fn(),
    hold: vi.fn(),
  },
}));

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
    version: 0,
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  executionItemAPI.reduce.mockResolvedValue({ version: 1 });
  executionItemAPI.move.mockResolvedValue({});
  executionItemAPI.hold.mockResolvedValue({});
});

describe('남은 시간 계산', () => {
  it('다음 고정 일정이 오늘의 경계가 된다', () => {
    const window = freeWindow(AFTERNOON, [timed(9, '17:00', '23:00')]);

    expect(window.start).toBe(15 * 60 + 40); // 이미 5분 경계
    expect(window.end).toBe(17 * 60);
    expect(window.boundary.executionItemId).toBe(9);
  });

  it('시작은 다음 5분 경계로 올린다', () => {
    expect(freeWindow(15 * 60 + 43, []).start).toBe(15 * 60 + 45);
  });
});

describe('초안 생성', () => {
  it('서버를 부르지 않는다', () => {
    buildRescheduleDraft([timed(1, '10:00', '10:30')], [], AFTERNOON, TODAY);

    expect(executionItemAPI.move).not.toHaveBeenCalled();
    expect(executionItemAPI.reduce).not.toHaveBeenCalled();
    expect(executionItemAPI.hold).not.toHaveBeenCalled();
  });

  it('남은 시간에 들어가는 것은 오늘 뒤로 옮긴다', () => {
    const draft = buildRescheduleDraft(
      [timed(1, '10:00', '10:15', { estimatedMinutes: 15 })],
      [timed(9, '17:00', '23:00')],
      AFTERNOON, TODAY,
    );

    expect(draft[0].decision).toBe(DECISIONS.LATER_TODAY);
    expect(draft[0].toDate).toBe(TODAY);
    expect(draft[0].startTime).toBe('15:40');
    expect(draft[0].endTime).toBe('15:55');
    expect(draft[0].expectedMinutes).toBe(15);
  });

  it('여러 개를 넣을 때 서로 겹치지 않게 이어 붙인다', () => {
    const draft = buildRescheduleDraft(
      [timed(1, '10:00', '10:15', { estimatedMinutes: 15 }), timed(2, '10:30', '11:00', { estimatedMinutes: 30 })],
      [timed(9, '17:00', '23:00')],
      AFTERNOON, TODAY,
    );

    expect(draft[0].endTime).toBe('15:55');
    expect(draft[1].startTime).toBe('16:00');
    expect(draft[1].endTime).toBe('16:30');
  });

  it('다 들어가지 않으면 줄여서라도 오늘 안에 둔다', () => {
    // 16:00까지 20분 남았는데 60분짜리 — 20분으로 줄여 오늘에 남긴다.
    const draft = buildRescheduleDraft(
      [timed(1, '10:00', '11:00', { estimatedMinutes: 60 })],
      [timed(9, '16:00', '17:00')],
      AFTERNOON, TODAY,
    );

    expect(draft[0].decision).toBe(DECISIONS.LATER_TODAY);
    expect(draft[0].expectedMinutes).toBe(20);
    expect(draft[0].endTime).toBe('16:00');
  });

  it('남은 시간이 없으면 꼭 해야 하는 것은 내일로, 여유 있으면 하는 것은 보류로 나눈다', () => {
    const draft = buildRescheduleDraft(
      [timed(1, '10:00', '11:00', { priority: 'MUST' }), timed(2, '10:00', '11:00', { priority: 'OPTIONAL' })],
      [timed(9, '15:45', '17:00')],
      AFTERNOON, TODAY,
    );

    expect(draft[0].decision).toBe(DECISIONS.TOMORROW);
    expect(draft[0].toDate).toBe('2026-08-16');
    expect(draft[1].decision).toBe(DECISIONS.HOLD);
  });

  it('전부 내일로 밀거나 전부 축소하지 않는다', () => {
    const draft = buildRescheduleDraft(
      [
        timed(1, '10:00', '10:15', { estimatedMinutes: 15 }),
        timed(2, '10:30', '11:20', { estimatedMinutes: 50 }),
        timed(3, '11:30', '11:50', { estimatedMinutes: 20, priority: 'OPTIONAL' }),
      ],
      [timed(9, '17:00', '23:00')],
      AFTERNOON, TODAY,
    );

    const decisions = new Set(draft.map((e) => e.decision));
    expect(decisions.size).toBeGreaterThan(0);
    expect(draft.every((e) => e.decision === DECISIONS.TOMORROW)).toBe(false);
  });

  it('화면에 보여줄 순서는 원래 시간순 그대로다', () => {
    const draft = buildRescheduleDraft(
      [timed(1, '10:00', '10:15'), timed(2, '09:00', '09:30', { priority: 'MUST' })],
      [],
      AFTERNOON, TODAY,
    );

    expect(draft.map((e) => e.executionItemId)).toEqual([1, 2]);
  });
});

describe('적용', () => {
  const itemsById = (items) => new Map(items.map((i) => [i.executionItemId, i]));

  it('오늘 뒤로는 같은 날짜 + 새 시각으로 move를 부른다', async () => {
    const item = timed(1, '10:00', '10:30');
    const entries = [{
      executionItemId: 1, title: '항목 1',
      beforeStartTime: '10:00', beforeEndTime: '10:30', beforeExpectedMinutes: 30,
      decision: DECISIONS.LATER_TODAY, toDate: TODAY, startTime: '16:00', endTime: '16:30', expectedMinutes: 30,
    }];

    const result = await applyReschedule(entries, itemsById([item]), '다시 잡기: 기상 늦음');

    expect(executionItemAPI.move).toHaveBeenCalledWith(1, TODAY, 0, {
      reason: '다시 잡기: 기상 늦음', startTime: '16:00', endTime: '16:30',
    });
    expect(executionItemAPI.reduce).not.toHaveBeenCalled();
    expect(result).toEqual({ applied: 1, failures: [] });
  });

  it('줄이면서 옮길 때는 reduce -> move 순서로 부르고 새 version을 이어 쓴다', async () => {
    const item = timed(1, '10:00', '11:00', { estimatedMinutes: 60, version: 4 });
    executionItemAPI.reduce.mockResolvedValue({ version: 5 });
    const entries = [{
      executionItemId: 1, title: '항목 1',
      beforeStartTime: '10:00', beforeEndTime: '11:00', beforeExpectedMinutes: 60,
      decision: DECISIONS.LATER_TODAY, toDate: TODAY, startTime: '16:00', endTime: '16:30', expectedMinutes: 30,
    }];

    await applyReschedule(entries, itemsById([item]), '다시 잡기');

    expect(executionItemAPI.reduce).toHaveBeenCalledWith(1, {
      version: 4, expectedMinutes: 30, reason: '다시 잡기',
    });
    expect(executionItemAPI.move).toHaveBeenCalledWith(1, TODAY, 5, {
      reason: '다시 잡기', startTime: '16:00', endTime: '16:30',
    });
  });

  it('보류는 hold를 부른다 — 삭제하지 않는다', async () => {
    const item = timed(1, '10:00', '10:30');
    const entries = [{
      executionItemId: 1, title: '항목 1',
      beforeStartTime: '10:00', beforeEndTime: '10:30', beforeExpectedMinutes: 30,
      decision: DECISIONS.HOLD, expectedMinutes: 30,
    }];

    await applyReschedule(entries, itemsById([item]), '다시 잡기');

    expect(executionItemAPI.hold).toHaveBeenCalledWith(1, 0, '다시 잡기');
    expect(executionItemAPI.move).not.toHaveBeenCalled();
  });

  it('유지는 아무 액션도 부르지 않는다', async () => {
    const item = timed(1, '10:00', '10:30');
    const entries = [{
      executionItemId: 1, title: '항목 1',
      beforeStartTime: '10:00', beforeEndTime: '10:30', beforeExpectedMinutes: 30,
      decision: DECISIONS.KEEP, expectedMinutes: 30,
    }];

    const result = await applyReschedule(entries, itemsById([item]), '다시 잡기');

    expect(executionItemAPI.move).not.toHaveBeenCalled();
    expect(executionItemAPI.reduce).not.toHaveBeenCalled();
    expect(executionItemAPI.hold).not.toHaveBeenCalled();
    expect(result.applied).toBe(0);
  });

  it('하나가 실패해도 나머지는 그대로 반영하고 무엇이 실패했는지 알려준다', async () => {
    const items = [timed(1, '10:00', '10:30'), timed(2, '10:30', '11:00')];
    executionItemAPI.move
      .mockRejectedValueOnce(new Error('이미 바뀐 항목이에요.'))
      .mockResolvedValueOnce({});
    const entries = [
      {
        executionItemId: 1, title: '항목 1',
        beforeStartTime: '10:00', beforeEndTime: '10:30', beforeExpectedMinutes: 30,
        decision: DECISIONS.TOMORROW, toDate: '2026-08-16', expectedMinutes: 30,
      },
      {
        executionItemId: 2, title: '항목 2',
        beforeStartTime: '10:30', beforeEndTime: '11:00', beforeExpectedMinutes: 30,
        decision: DECISIONS.TOMORROW, toDate: '2026-08-16', expectedMinutes: 30,
      },
    ];

    const result = await applyReschedule(entries, itemsById(items), '다시 잡기');

    expect(result.applied).toBe(1);
    expect(result.failures).toEqual([{ title: '항목 1', message: '이미 바뀐 항목이에요.' }]);
  });
});
