/**
 * 계획 기간 안에 못 넣은 항목 — 검토 화면 위 묶음에서 바로 처리하고, 고른 시각이 확정 요청에 실린다.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PlanDraftReview from './PlanDraftReview.jsx';
import { planAPI, schedulePreviewAPI } from '../../api/api.js';
import { clearPreviewCache } from '../../ai/previewSolveCache.js';

vi.mock('../../api/api.js', () => ({
  proposalAPI: { apply: vi.fn() },
  planAPI: { confirm: vi.fn(), draftProvenance: vi.fn(), saveReviewState: vi.fn() },
  schedulePreviewAPI: { get: vi.fn(), recompute: vi.fn() },
  topicAPI: { updateUserMark: vi.fn() },
}));

const ITEMS = [
  { proposalItemId: 1, operation: 'CREATE', title: '센서 개념 정리', expectedMinutes: 60, placementType: 'UNSCHEDULED', targetDate: '2026-11-18' },
  { proposalItemId: 2, operation: 'CREATE', title: '센서 예제 풀이', expectedMinutes: 90, placementType: 'UNSCHEDULED', targetDate: '2026-11-18' },
];
const DRAFT = {
  proposalId: 4462, startDate: '2026-11-18', endDate: '2026-11-18', days: 1, intensity: 'NORMAL',
  targetMinutes: 180, suggestedTitle: '오늘 계획', proposal: { proposalId: 4462, items: ITEMS },
};
const PREVIEW = {
  horizonStart: '2026-11-18', horizonEnd: '2026-11-18',
  placedItems: [{ proposalItemId: 1, scheduledDate: '2026-11-18', scheduledStartAt: '2026-11-18T21:00:00', scheduledEndAt: '2026-11-18T22:00:00' }],
  unplacedItems: [{
    proposalItemId: 2, title: '센서 예제 풀이', reason: '배치 가능한 시간이 부족함', expectedMinutes: 90,
    nextSlotStartAt: '2026-11-19T15:00:00', nextSlotEndAt: '2026-11-19T16:30:00',
    fitMinutes: 45, fitStartAt: '2026-11-18T22:15:00',
  }],
};

beforeEach(() => {
  vi.clearAllMocks();
  clearPreviewCache();
  planAPI.draftProvenance.mockResolvedValue({ recorded: false, items: [], providedSources: [] });
  planAPI.confirm.mockResolvedValue({ planVersionId: 1 });
  schedulePreviewAPI.get.mockResolvedValue(PREVIEW);
});

describe('계획 검토: 못 넣은 항목 묶음', () => {
  it('다음 빈 시간에 넣으면 목록이 그 시각을 보여 주고 확정 요청에 TIME_FIXED로 실린다', async () => {
    render(<PlanDraftReview draft={DRAFT} todayIso="2026-11-18" />);
    expect(await screen.findByText('기간 안에 못 넣은 항목 1개')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /11\/19\(목\) 15:00~16:30에 넣기/ }));
    expect(screen.getByText('못 넣은 항목을 모두 정리했어요')).toBeInTheDocument();
    expect(screen.queryByText(/배치 안 됨/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '계획 확정' }));
    await waitFor(() => expect(planAPI.confirm).toHaveBeenCalled());
    const { editedItems } = planAPI.confirm.mock.calls[0][1];
    expect(editedItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ proposalItemId: 2, placementType: 'TIME_FIXED', scheduledStartAt: '2026-11-19T15:00:00', scheduledEndAt: '2026-11-19T16:30:00' }),
      expect.objectContaining({ proposalItemId: 1, placementType: 'TIME_FIXED', scheduledStartAt: '2026-11-18T21:00:00' }),
    ]));
  });

  it('줄여 넣으면 줄인 길이와 그 시각을 함께 싣고, 되돌리면 원래대로 미배치다', async () => {
    render(<PlanDraftReview draft={DRAFT} todayIso="2026-11-18" />);
    fireEvent.click(await screen.findByRole('button', { name: /45분으로 줄여 22:15에 넣기/ }));
    expect(screen.getByText(/45분으로 줄임/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '계획 확정' }));
    await waitFor(() => expect(planAPI.confirm).toHaveBeenCalledTimes(1));
    expect(planAPI.confirm.mock.calls[0][1].editedItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ proposalItemId: 2, expectedMinutes: 45, scheduledStartAt: '2026-11-18T22:15:00', scheduledEndAt: '2026-11-18T23:00:00' }),
    ]));
  });

  it('되돌리기는 시각과 줄인 길이를 함께 되돌린다', async () => {
    render(<PlanDraftReview draft={DRAFT} todayIso="2026-11-18" />);
    fireEvent.click(await screen.findByRole('button', { name: /45분으로 줄여/ }));
    fireEvent.click(screen.getByRole('button', { name: /되돌리기/ }));
    expect(screen.getByText('기간 안에 못 넣은 항목 1개')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '계획 확정' }));
    await waitFor(() => expect(planAPI.confirm).toHaveBeenCalledTimes(1));
    const edited = planAPI.confirm.mock.calls[0][1].editedItems ?? [];
    expect(edited.find((e) => e.proposalItemId === 2)).toBeUndefined();
  });

  it('빼기는 이번 확정에서 그 항목을 뺀다', async () => {
    render(<PlanDraftReview draft={DRAFT} todayIso="2026-11-18" />);
    fireEvent.click(await screen.findByRole('button', { name: /빼기/ }));
    expect(screen.getByText('이번 계획에서 뺐어요')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '계획 확정' }));
    await waitFor(() => expect(planAPI.confirm).toHaveBeenCalledTimes(1));
    expect(planAPI.confirm.mock.calls[0][1].excludedItemIds).toEqual([2]);
  });
});
