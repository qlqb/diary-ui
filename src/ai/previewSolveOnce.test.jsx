/**
 * 배치 미리보기의 주인은 제안 하나당 하나다.
 *
 * AI 패널에서 기간 계획을 열면 같은 제안을 두 곳이 본다 — 셸의 초안 훅(useProposalDraft)과 계획 검토 화면
 * (PlanDraftReview). 예전에는 둘이 각자 get → recompute를 불러 같은 입력을 두 번 풀었다.
 */

import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useProposalDraft } from './useProposalDraft.js';
import { acquirePreview, clearPreviewCache, previewInputKey } from './previewSolveCache.js';
import PlanDraftReview from '../views/plan/PlanDraftReview.jsx';
import { planAPI, schedulePreviewAPI } from '../api/api.js';

vi.mock('../api/api.js', () => ({
  proposalAPI: { apply: vi.fn() },
  planAPI: { confirm: vi.fn(), draftProvenance: vi.fn(), saveReviewState: vi.fn() },
  schedulePreviewAPI: { get: vi.fn(), recompute: vi.fn() },
  topicAPI: { updateUserMark: vi.fn() },
}));

const ITEMS = [
  { proposalItemId: 1, operation: 'CREATE', title: '연결 리스트 구현', expectedMinutes: 40, placementType: 'UNSCHEDULED', targetDate: '2026-09-21' },
  { proposalItemId: 2, operation: 'CREATE', title: '과제 2번', expectedMinutes: 60, placementType: 'UNSCHEDULED', targetDate: '2026-09-21' },
];
const PROPOSAL = { proposalId: 77, items: ITEMS };
const PERIOD_DRAFT = {
  proposalId: 77, startDate: '2026-09-21', endDate: '2026-09-27', days: 7, intensity: 'NORMAL',
  targetMinutes: 300, suggestedTitle: '이번 주 계획', proposal: PROPOSAL,
};
const PREVIEW = {
  placedItems: [{ proposalItemId: 1, scheduledDate: '2026-09-22', scheduledStartAt: '2026-09-22T19:00:00', scheduledEndAt: '2026-09-22T19:40:00' }],
  unplacedItems: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  clearPreviewCache();
  planAPI.draftProvenance.mockResolvedValue({ recorded: false, items: [], providedSources: [] });
});

describe('같은 제안의 배치 미리보기는 한 번만 푼다', () => {
  it('★ AI 패널에서 연 기간 계획: 초안 훅과 검토 화면이 함께 떠도 get 1번 · recompute 1번', async () => {
    schedulePreviewAPI.get.mockResolvedValue(null);
    schedulePreviewAPI.recompute.mockResolvedValue(PREVIEW);

    const hook = renderHook(() => useProposalDraft());
    // SSE가 초안을 가져온 순간: 셸은 초안을 열고, 같은 렌더에서 계획 검토 화면도 뜬다.
    let opening;
    act(() => { opening = hook.result.current.openDraft(PROPOSAL); });
    render(<PlanDraftReview draft={PERIOD_DRAFT} todayIso="2026-09-19" />);
    await act(async () => { await opening; });

    // 두 곳 모두 같은 결과를 받았다.
    await waitFor(() => expect(hook.result.current.draft.cards[0].startTime).toBe('19:00'));
    expect(await screen.findByText(/9\/22 화 19:00~19:40/)).toBeInTheDocument();

    expect(schedulePreviewAPI.get).toHaveBeenCalledTimes(1);
    expect(schedulePreviewAPI.recompute).toHaveBeenCalledTimes(1);
  });

  it('초안이 열려 있는 동안 검토 화면이 뒤늦게 떠도 다시 풀지 않는다', async () => {
    schedulePreviewAPI.get.mockResolvedValue(PREVIEW);
    const hook = renderHook(() => useProposalDraft());
    await act(async () => { await hook.result.current.openDraft(PROPOSAL); });
    expect(schedulePreviewAPI.get).toHaveBeenCalledTimes(1);

    render(<PlanDraftReview draft={PERIOD_DRAFT} todayIso="2026-09-19" />);

    expect(await screen.findByText(/9\/22 화 19:00~19:40/)).toBeInTheDocument();
    expect(schedulePreviewAPI.get).toHaveBeenCalledTimes(1);
    expect(schedulePreviewAPI.recompute).not.toHaveBeenCalled();
  });

  it('입력(분량·날짜·항목)이 바뀌면 앞의 결과를 버리고, 저장된 미리보기도 믿지 않고 다시 계산한다', async () => {
    const solve = vi.fn(async ({ stale }) => ({ stale }));
    const first = acquirePreview(77, previewInputKey(77, ITEMS), solve);
    await first.promise;

    const changed = ITEMS.map((item) => (item.proposalItemId === 2 ? { ...item, expectedMinutes: 30 } : item));
    const second = acquirePreview(77, previewInputKey(77, changed), solve);

    expect(await second.promise).toEqual({ stale: true });
    expect(solve).toHaveBeenCalledTimes(2);
    first.release();
    second.release();
  });

  it('같은 입력이면 순서가 달라도 같은 문제다', () => {
    expect(previewInputKey(77, ITEMS)).toBe(previewInputKey(77, [...ITEMS].reverse()));
  });

  it('못 구한 결과는 나눠 주지 않는다 — 다음 요청이 다시 시도한다', async () => {
    const solve = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(PREVIEW);
    const first = acquirePreview(77, 'k', solve);
    await expect(first.promise).rejects.toThrow('network');

    const second = acquirePreview(77, 'k', solve);
    expect(await second.promise).toBe(PREVIEW);
    expect(solve).toHaveBeenCalledTimes(2);
  });
});
