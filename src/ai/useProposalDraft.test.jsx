/**
 * 초안 상태의 계약을 고정한다.
 *
 * 가장 중요한 것: apply()를 부르기 전에는 어떤 서버 호출도 일어나지 않는다(승인 전 미반영).
 * 그리고 apply()가 보내는 payload는 "화면에서 사용자가 마지막으로 본 값"이어야 한다 —
 * 사용자가 고친 값이 조용히 원본으로 되돌아가면 안 된다.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useProposalDraft, adjustmentFor, cardsForDate } from './useProposalDraft.js';
import { proposalAPI, schedulePreviewAPI } from '../api/api.js';

vi.mock('../api/api.js', () => ({
  proposalAPI: { apply: vi.fn() },
  schedulePreviewAPI: { get: vi.fn(), recompute: vi.fn() },
}));

const createProposal = {
  proposalId: 7,
  items: [{
    proposalItemId: 71,
    operation: 'CREATE',
    title: '자료구조 복습',
    description: '연결 리스트',
    expectedMinutes: 30,
    priority: 'MUST',
    placementType: 'DATE_ONLY',
    targetDate: '2026-08-15',
  }],
};

const adjustProposal = {
  proposalId: 8,
  items: [{
    proposalItemId: 81,
    operation: 'REDUCE',
    title: '자료구조 복습',
    expectedMinutes: 20,
    priority: 'MUST',
    targetDate: '2026-08-15',
    targetExecutionItemId: 500,
    beforeTitle: '자료구조 복습',
    beforeExpectedMinutes: 30,
    beforeScheduledDate: '2026-08-15',
    reason: '오늘 피곤하다고 해서',
  }],
};

beforeEach(() => {
  vi.clearAllMocks();
  proposalAPI.apply.mockResolvedValue({});
});

describe('useProposalDraft', () => {
  it('초안을 여는 것만으로는 서버를 바꾸지 않는다', async () => {
    const { result } = renderHook(() => useProposalDraft({}));

    await act(async () => { await result.current.openDraft(createProposal); });

    expect(result.current.draft.cards).toHaveLength(1);
    expect(proposalAPI.apply).not.toHaveBeenCalled();
  });

  it('사용자가 고친 값 그대로 적용한다', async () => {
    const onApplied = vi.fn();
    const { result } = renderHook(() => useProposalDraft({ onApplied }));
    await act(async () => { await result.current.openDraft(createProposal); });

    act(() => {
      result.current.patchCard(71, { expectedMinutes: 20, startTime: '16:00', endTime: '16:20' });
    });
    await act(async () => { await result.current.apply(); });

    const [proposalId, editedItems, excluded] = proposalAPI.apply.mock.calls[0];
    expect(proposalId).toBe(7);
    expect(excluded).toEqual([]);
    expect(editedItems[0]).toMatchObject({
      proposalItemId: 71,
      expectedMinutes: 20,
      placementType: 'TIME_FIXED',
      scheduledDate: '2026-08-15',
      scheduledStartAt: '2026-08-15T16:00:00',
      scheduledEndAt: '2026-08-15T16:20:00',
    });
    expect(onApplied).toHaveBeenCalled();
    await waitFor(() => expect(result.current.draft).toBeNull());
  });

  it('뺀 항목은 excludedItemIds로 보내고 적용 목록에서 제외한다', async () => {
    const { result } = renderHook(() => useProposalDraft({}));
    await act(async () => { await result.current.openDraft(createProposal); });

    act(() => { result.current.toggleExclude(71); });
    await act(async () => { await result.current.apply(); });

    // 남은 것이 하나도 없으면 적용하지 않는다 — 빈 묶음을 반영해버리지 않기 위해서다.
    expect(proposalAPI.apply).not.toHaveBeenCalled();
    expect(result.current.applyError).toContain('적용할 변경이 없어요');
  });

  it('조정 제안은 대상 항목에 무엇을 할지만 보낸다', async () => {
    const { result } = renderHook(() => useProposalDraft({}));
    await act(async () => { await result.current.openDraft(adjustProposal); });

    expect(adjustmentFor(result.current.draft, 500)).toMatchObject({
      operation: 'REDUCE', beforeExpectedMinutes: 30, expectedMinutes: 20,
    });

    await act(async () => { await result.current.apply(); });
    const editedItems = proposalAPI.apply.mock.calls[0][1];
    expect(editedItems[0]).toEqual({
      proposalItemId: 81,
      title: '자료구조 복습',
      expectedMinutes: 20,
      scheduledDate: '2026-08-15',
      // 시각은 "오늘 뒤로"처럼 같은 날 안에서 옮기는 이동에서만 채워진다. 비어 있으면 서버가
      // 제안에 담겨 있던 값을 그대로 쓴다.
      scheduledStartAt: null,
      scheduledEndAt: null,
    });
    // 새 항목을 만드는 필드가 섞여 나가면 안 된다.
    expect(editedItems[0].placementType).toBeUndefined();
  });

  it('같은 날 안에서 시각만 옮기는 조정은 그 시각을 그대로 보낸다', async () => {
    const { result } = renderHook(() => useProposalDraft({}));
    await act(async () => {
      await result.current.openDraft({
        proposalId: 9,
        items: [{
          proposalItemId: 91,
          operation: 'MOVE',
          title: '프로젝트 우선작업',
          expectedMinutes: 30,
          priority: 'MUST',
          targetExecutionItemId: 501,
          targetDate: '2026-08-15',
          beforeScheduledDate: '2026-08-15',
          scheduledStartAt: '2026-08-15T16:00:00',
          scheduledEndAt: '2026-08-15T16:30:00',
        }],
      });
    });

    await act(async () => { await result.current.apply(); });

    expect(proposalAPI.apply.mock.calls[0][1][0]).toMatchObject({
      proposalItemId: 91,
      scheduledDate: '2026-08-15',
      scheduledStartAt: '2026-08-15T16:00:00',
      scheduledEndAt: '2026-08-15T16:30:00',
    });
  });

  it('날짜가 정해지지 않은 후보는 서버 배치 결과를 받아 실제 시각을 갖는다', async () => {
    schedulePreviewAPI.get.mockResolvedValue(null);
    schedulePreviewAPI.recompute.mockResolvedValue({
      placedItems: [{
        proposalItemId: 91,
        scheduledDate: '2026-08-18',
        scheduledStartAt: '2026-08-18T19:00:00',
        scheduledEndAt: '2026-08-18T19:30:00',
      }],
      unplacedItems: [],
    });

    const { result } = renderHook(() => useProposalDraft({}));
    await act(async () => {
      await result.current.openDraft({
        proposalId: 9,
        items: [{ proposalItemId: 91, operation: 'CREATE', title: '공부', expectedMinutes: 30, placementType: 'UNSCHEDULED' }],
      });
    });

    await waitFor(() => {
      expect(result.current.draft.cards[0]).toMatchObject({
        scheduledDate: '2026-08-18', startTime: '19:00', endTime: '19:30', autoPlaced: true,
      });
    });
  });

  it('cardsForDate는 그 날짜에 영향을 주는 카드만 고른다', async () => {
    const { result } = renderHook(() => useProposalDraft({}));
    await act(async () => { await result.current.openDraft(createProposal); });

    expect(cardsForDate(result.current.draft, '2026-08-15')).toHaveLength(1);
    expect(cardsForDate(result.current.draft, '2026-08-16')).toHaveLength(0);
  });
});
