/**
 * 계획 초안이 일정 탭과 같은 격자 위에 블록으로 보이는지 고정한다.
 * 블록 시각은 배치 미리보기 그대로이고, 기존 반복 일정도 같은 격자에 함께 나온다.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../api/api.js', () => ({
  executionItemAPI: { getByDateRange: vi.fn().mockResolvedValue([]) },
  routineAPI: {
    occurrences: vi.fn().mockResolvedValue([{
      routineId: 1, title: '빅데이터분석', sourceDate: '2026-09-22',
      startAt: '2026-09-22T10:00:00', endAt: '2026-09-22T12:00:00', moved: false,
    }]),
  },
  commitmentAPI: { list: vi.fn().mockRejectedValue(new Error('x')) },
}));

import PlanWeekPreview from './PlanWeekPreview.jsx';

const preview = {
  horizonStart: '2026-09-21',
  horizonEnd: '2026-09-27',
  placedItems: [
    { proposalItemId: 1, scheduledDate: '2026-09-22', scheduledStartAt: '2026-09-22T19:00:00', scheduledEndAt: '2026-09-22T19:40:00' },
    { proposalItemId: 2, scheduledDate: '2026-09-23', scheduledStartAt: '2026-09-23T20:00:00', scheduledEndAt: '2026-09-23T21:00:00' },
  ],
  unplacedItems: [],
};
const items = [
  { proposalItemId: 1, title: '자료구조 3장 복습' },
  { proposalItemId: 2, title: '통계 과제' },
];

describe('PlanWeekPreview', () => {
  it('배치된 항목을 블록으로, 뺀 항목은 흐리게, 기존 반복 일정은 함께 그린다', async () => {
    const { container } = render(<PlanWeekPreview preview={preview} items={items} excluded={new Set([2])} />);

    expect(screen.getByText('자료구조 3장 복습')).toBeInTheDocument();
    const excludedBlock = screen.getByText('통계 과제').closest('.grid-block');
    expect(excludedBlock).toHaveClass('is-excluded');
    expect(container.querySelectorAll('.grid-block.is-draft.is-readonly')).toHaveLength(2);

    expect(await screen.findByText('빅데이터분석')).toBeInTheDocument();
    // 약속을 못 읽었으면 빈 칸을 "아무것도 없다"로 두지 않고 말한다.
    await waitFor(() => expect(screen.getByText(/기존 일정 일부를 불러오지 못해/)).toBeInTheDocument());
  });

  it('미리보기가 없으면 아무것도 그리지 않는다', () => {
    const { container } = render(<PlanWeekPreview preview={null} items={items} excluded={new Set()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
