/**
 * 격자에 장소가 글자로 나오는지 고정한다.
 *
 * 전에는 장소가 title 속성에만 있었다 — 마우스를 올려야만 보이고, 터치에서는 아예 볼 수
 * 없었다. "어디로 가야 하나"는 시간표를 볼 때마다 필요한 값이라 블록 안에 적는다.
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import WeekGrid from './WeekGrid.jsx';

const DATES = [
  '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10',
  '2026-09-11', '2026-09-12', '2026-09-13',
];

const lecture = {
  routineId: 3,
  title: '빅데이터분석',
  location: '공학관 401',
  sourceDate: '2026-09-08',
  startAt: '2026-09-08T15:00:00',
  endAt: '2026-09-08T17:00:00',
  moved: false,
};

const meetup = {
  commitmentId: 5,
  title: '친구 약속',
  locationText: '홍대',
  startAt: '2026-09-09T19:00:00',
  endAt: '2026-09-09T21:00:00',
};

function renderGrid(props = {}) {
  return render(
    <WeekGrid
      dates={DATES}
      items={[]}
      draftCards={[]}
      occurrences={[lecture]}
      commitments={[meetup]}
      todayDate="2026-09-08"
      onPatchCard={vi.fn()}
      onSelectItem={vi.fn()}
      onSelectCommitment={vi.fn()}
      {...props}
    />,
  );
}

describe('주간 격자의 장소', () => {
  it('반복 일정의 장소가 블록 안에 나온다', () => {
    renderGrid();
    expect(screen.getByText('공학관 401')).toBeInTheDocument();
  });

  it('약속의 장소가 블록 안에 나온다', () => {
    renderGrid();
    expect(screen.getByText('홍대')).toBeInTheDocument();
  });

  it('장소가 없으면 빈 자리를 만들지 않는다', () => {
    renderGrid({
      occurrences: [{ ...lecture, location: null }],
      commitments: [{ ...meetup, locationText: null }],
    });
    expect(screen.getByText('빅데이터분석')).toBeInTheDocument();
    expect(screen.queryByText('공학관 401')).not.toBeInTheDocument();
    expect(screen.queryByText('홍대')).not.toBeInTheDocument();
  });
});
