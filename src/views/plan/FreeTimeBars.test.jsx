import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import FreeTimeBars from './FreeTimeBars.jsx';
import { freeTimeByDay } from '../../lib/freeTime.js';

const PREVIEW = {
  availabilityWindows: [
    { startAt: '2026-11-19T16:00:00', endAt: '2026-11-19T19:00:00' },
    { startAt: '2026-11-19T21:20:00', endAt: '2026-11-20T00:00:00' },
    { startAt: '2026-11-20T10:15:00', endAt: '2026-11-20T18:00:00' },
  ],
  placedItems: [
    { proposalItemId: 1, scheduledStartAt: '2026-11-19T16:00:00', scheduledEndAt: '2026-11-19T18:00:00' },
    { proposalItemId: 2, scheduledStartAt: '2026-11-20T10:45:00', scheduledEndAt: '2026-11-20T11:45:00' },
  ],
};

describe('FreeTimeBars — 비어 있는 시간 막대', () => {
  it('날짜별로 가용 구간과 배치된 초안 시간을 더한다(서버가 준 구간 그대로)', () => {
    expect(freeTimeByDay(PREVIEW)).toEqual([
      { date: '2026-11-19', free: 340, used: 120 },
      { date: '2026-11-20', free: 465, used: 60 },
    ]);
  });

  it('제외한 항목은 쓰는 시간에서 뺀다', () => {
    expect(freeTimeByDay(PREVIEW, new Set([2]))[1].used).toBe(0);
  });

  it('합계와 날짜별 숫자를 보여준다', () => {
    render(<FreeTimeBars preview={PREVIEW} excluded={new Set()} />);
    expect(screen.getByText('비어 있는 시간')).toBeInTheDocument();
    expect(screen.getByText(/13h 25m 중 이번 초안 3h/)).toBeInTheDocument();
  });

  it('미리보기가 없으면 그리지 않는다', () => {
    const { container } = render(<FreeTimeBars preview={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
