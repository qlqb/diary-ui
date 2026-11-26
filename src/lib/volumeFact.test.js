import { describe, it, expect } from 'vitest';
import { chunkSlots, slotsKey, slotsOf, volumeFact } from './volumeFact.js';

const HISTORY = {
  key: '1', courseId: 14, dayOfWeek: 'THURSDAY', band: 'EVENING',
  weeks: [
    { date: '2026-10-22', plannedMinutes: 180, actualMinutes: 90 },
    { date: '2026-10-29', plannedMinutes: 180, actualMinutes: 110 },
    { date: '2026-11-05', plannedMinutes: 150, actualMinutes: 80 },
    { date: '2026-11-12', plannedMinutes: 180, actualMinutes: 120 },
  ],
  averageActualMinutes: 100,
  underestimateCount: 4,
  sizeMinutes: 120,
};

describe('volumeFact — 분량 3층', () => {
  it('잡은 시간이 자리 평균보다 크면 사실·제안·관점을 낸다', () => {
    const v = volumeFact(HISTORY, 180);
    expect(v.fact).toBe('3시간으로 잡으셨네요. 지난 4주 목요일 저녁(18~24시)에 이 과목은 평균 1시간 40분이었어요.');
    expect(v.suggestedMinutes).toBe(120);
    expect(v.suggestion).toBe('2시간으로 두고, 남으면 더 하는 쪽은 어떠세요?');
    expect(v.perspective).toContain('지난 4번 잡은 시간보다 짧게 끝났어요');
    expect(v.weeks).toHaveLength(4);
  });

  it('적게 잡은 날이 3번 미만이면 관점은 꺼내지 않는다', () => {
    expect(volumeFact({ ...HISTORY, underestimateCount: 2 }, 180).perspective).toBeNull();
  });

  it('이미 자리 크기 안쪽으로 잡았으면 아무것도 말하지 않는다', () => {
    expect(volumeFact(HISTORY, 120)).toBeNull();
    expect(volumeFact(HISTORY, 90)).toBeNull();
  });

  it('자리 크기는 서버 값을 쓴다(반올림한 평균으로 다시 올리지 않는다)', () => {
    expect(volumeFact({ ...HISTORY, averageActualMinutes: 120, sizeMinutes: 150 }, 180).suggestedMinutes).toBe(150);
    expect(volumeFact({ ...HISTORY, sizeMinutes: null }, 180)).toBeNull();
    expect(volumeFact({ ...HISTORY, sizeMinutes: 0 }, 180)).toBeNull();
  });

  it('기록이 없으면(첫 주) 아무것도 말하지 않는다', () => {
    expect(volumeFact({ ...HISTORY, weeks: [], averageActualMinutes: null }, 180)).toBeNull();
    expect(volumeFact(null, 180)).toBeNull();
  });

  it('금지 표현과 사람을 탓하는 표현을 쓰지 않는다', () => {
    const v = volumeFact(HISTORY, 180);
    for (const text of [v.fact, v.suggestion, v.perspective]) {
      expect(text).not.toMatch(/실패|미완료|이행률|달성률|연속|의지|성실|못 하/);
    }
  });
});

describe('slotsOf — 서버에 물을 자리', () => {
  it('과목이 있고 시각이 정해진 항목만, 지금 잡은 분량과 함께', () => {
    const items = [
      { proposalItemId: 1, courseId: 14, expectedMinutes: 180 },
      { proposalItemId: 2, courseId: null, expectedMinutes: 60 },
      { proposalItemId: 3, courseId: 13, expectedMinutes: 60 },
    ];
    const placed = new Map([
      [1, { scheduledStartAt: '2026-11-19T19:00:00' }],
      [2, { scheduledStartAt: '2026-11-20T10:00:00' }],
    ]);
    const slots = slotsOf(items, placed, (i) => (i.proposalItemId === 1 ? 120 : i.expectedMinutes));
    expect(slots).toEqual([{ key: '1', courseId: 14, startAt: '2026-11-19T19:00:00', plannedMinutes: 120 }]);
    expect(slotsKey(slots)).toBe('1:14:2026-11-19T19:00:00');
  });
});

describe('chunkSlots', () => {
  it('서버 상한(60개)에 맞게 나눈다', () => {
    const slots = Array.from({ length: 61 }, (_, i) => ({ key: String(i) }));
    expect(chunkSlots(slots).map((c) => c.length)).toEqual([60, 1]);
    expect(chunkSlots([])).toEqual([]);
  });
});
