/**
 * 계획 검토: 분량 3층과 비어 있는 시간 막대.
 * 예시는 프로토타입의 과소추정 사례(목요일 저녁 3시간 ↔ 지난 4주 평균 1시간 40분)다.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PlanDraftReview from './PlanDraftReview.jsx';
import { planAPI, schedulePreviewAPI } from '../../api/api.js';
import { clearPreviewCache } from '../../ai/previewSolveCache.js';

vi.mock('../../api/api.js', () => ({
  proposalAPI: { apply: vi.fn() },
  planAPI: { confirm: vi.fn(), draftProvenance: vi.fn(), saveReviewState: vi.fn(), slotHistory: vi.fn(), fixedSchedule: vi.fn() },
  schedulePreviewAPI: { get: vi.fn(), recompute: vi.fn() },
  topicAPI: { updateUserMark: vi.fn() },
}));

const ITEMS = [
  { proposalItemId: 1, operation: 'CREATE', courseId: 14, title: '소켓 서버 과제', expectedMinutes: 180, placementType: 'UNSCHEDULED', targetDate: '2026-11-19' },
  { proposalItemId: 2, operation: 'CREATE', courseId: 13, title: '힙 정렬 직접 구현', expectedMinutes: 60, placementType: 'UNSCHEDULED', targetDate: '2026-11-20' },
];
const DRAFT = {
  proposalId: 501, startDate: '2026-11-19', endDate: '2026-11-20', days: 2, intensity: 'NORMAL',
  targetMinutes: 300, suggestedTitle: '이번 주', proposal: { proposalId: 501, items: ITEMS },
};
const PREVIEW = {
  horizonStart: '2026-11-19', horizonEnd: '2026-11-20',
  availabilityWindows: [
    { startAt: '2026-11-19T19:00:00', endAt: '2026-11-19T23:00:00' },
    { startAt: '2026-11-20T10:30:00', endAt: '2026-11-20T15:00:00' },
  ],
  placedItems: [
    { proposalItemId: 1, scheduledDate: '2026-11-19', scheduledStartAt: '2026-11-19T19:00:00', scheduledEndAt: '2026-11-19T22:00:00' },
    { proposalItemId: 2, scheduledDate: '2026-11-20', scheduledStartAt: '2026-11-20T10:45:00', scheduledEndAt: '2026-11-20T11:45:00' },
  ],
  unplacedItems: [],
};
const HISTORY = [
  {
    key: '1', courseId: 14, dayOfWeek: 'THURSDAY', band: 'EVENING',
    weeks: [
      { date: '2026-10-22', plannedMinutes: 180, actualMinutes: 90 },
      { date: '2026-10-29', plannedMinutes: 180, actualMinutes: 110 },
      { date: '2026-11-05', plannedMinutes: 150, actualMinutes: 80 },
      { date: '2026-11-12', plannedMinutes: 180, actualMinutes: 120 },
    ],
    averageActualMinutes: 100, underestimateCount: 4, sizeMinutes: 120, suggestedMinutes: 120,
  },
  // 기록이 없는 자리(첫 주) — 아무것도 말하지 않는다.
  { key: '2', courseId: 13, dayOfWeek: 'FRIDAY', band: 'MORNING', weeks: [], averageActualMinutes: null, underestimateCount: 0 },
];

beforeEach(() => {
  vi.clearAllMocks();
  clearPreviewCache();
  planAPI.draftProvenance.mockResolvedValue({ recorded: false, items: [], providedSources: [] });
  planAPI.confirm.mockResolvedValue({ planVersionId: 1 });
  planAPI.slotHistory.mockResolvedValue(HISTORY);
  planAPI.fixedSchedule.mockResolvedValue([
    { title: '자료구조', startAt: '2026-11-20T09:00:00', endAt: '2026-11-20T10:15:00', kind: 'ROUTINE' },
  ]);
  schedulePreviewAPI.get.mockResolvedValue(PREVIEW);
});

describe('계획 검토: 분량 3층', () => {
  it('놓인 자리를 물어보고, 분량이 자리보다 크면 사실 → 제안 → 관점을 항목 아래에 보여 준다', async () => {
    render(<PlanDraftReview draft={DRAFT} todayIso="2026-11-19" />);

    expect(await screen.findByText(/3시간으로 잡으셨네요\. 지난 4주 목요일 저녁\(18~24시\)에 이 과목은 평균 1시간 40분이었어요/)).toBeInTheDocument();
    expect(planAPI.slotHistory).toHaveBeenCalledWith([
      { key: '1', courseId: 14, startAt: '2026-11-19T19:00:00', plannedMinutes: 180 },
      { key: '2', courseId: 13, startAt: '2026-11-20T10:45:00', plannedMinutes: 60 },
    ]);
    expect(screen.getByText('2시간으로 두고, 남으면 더 하는 쪽은 어떠세요?')).toBeInTheDocument();
    expect(screen.getByText(/지난 4번 잡은 시간보다 짧게 끝났어요/)).toBeInTheDocument();
    // 기록 없는 자리는 말하지 않는다(카드는 하나뿐).
    expect(screen.getAllByRole('group', { name: /분량 확인/ })).toHaveLength(1);
    expect(screen.getByRole('group', { name: '소켓 서버 과제 분량 확인' })).toBeInTheDocument();
  });

  it('제안을 받으면 그 항목 분량만 고치고 카드가 사라진다. 확정 요청에 고친 분량이 실린다', async () => {
    render(<PlanDraftReview draft={DRAFT} todayIso="2026-11-19" />);
    fireEvent.click(await screen.findByRole('button', { name: '소켓 서버 과제: 2시간으로 둘게요' }));

    expect(screen.queryByRole('group', { name: /분량 확인/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '계획 확정' }));
    await waitFor(() => expect(planAPI.confirm).toHaveBeenCalled());
    expect(planAPI.confirm.mock.calls[0][1].editedItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ proposalItemId: 1, expectedMinutes: 120 }),
    ]));
  });

  it('그대로 두면 카드를 닫고 분량은 그대로 확정한다(막지 않는다)', async () => {
    render(<PlanDraftReview draft={DRAFT} todayIso="2026-11-19" />);
    fireEvent.click(await screen.findByRole('button', { name: '소켓 서버 과제: 그대로 둘게요' }));

    expect(screen.queryByRole('group', { name: /분량 확인/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '계획 확정' }));
    await waitFor(() => expect(planAPI.confirm).toHaveBeenCalled());
    const edited = planAPI.confirm.mock.calls[0][1].editedItems ?? [];
    expect(edited.find((e) => e.proposalItemId === 1)?.expectedMinutes ?? 180).toBe(180);
  });

  it('자리 기록을 못 읽어도 검토는 그대로 된다', async () => {
    planAPI.slotHistory.mockRejectedValue(new Error('x'));
    render(<PlanDraftReview draft={DRAFT} todayIso="2026-11-19" />);

    expect(await screen.findByText('비어 있는 시간')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /분량 확인/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '계획 확정' })).toBeEnabled();
  });
});

describe('계획 검토: 비어 있는 시간 막대', () => {
  it('미리보기의 가용 구간과 배치로 날짜별 막대를 그린다', async () => {
    render(<PlanDraftReview draft={DRAFT} todayIso="2026-11-19" />);
    expect(await screen.findByText('8h 30m 중 이번 초안 4h')).toBeInTheDocument();
  });
});

describe('계획 검토: 앞 일정 기준 표현', () => {
  it('놓인 시각 앞에 앞 일정에 이은 표현을 붙인다(저장하지 않고 그릴 때 계산)', async () => {
    render(<PlanDraftReview draft={DRAFT} todayIso="2026-11-19" />);
    expect(await screen.findByText(/자료구조 끝나고 30분 뒤 · /)).toBeInTheDocument();
    expect(planAPI.fixedSchedule).toHaveBeenCalledWith('2026-11-19', '2026-11-20');
  });

  it('고정 일정을 못 읽어도 시각은 그대로 보인다', async () => {
    planAPI.fixedSchedule.mockRejectedValue(new Error('x'));
    render(<PlanDraftReview draft={DRAFT} todayIso="2026-11-19" />);
    expect(await screen.findByText('비어 있는 시간')).toBeInTheDocument();
    expect(screen.queryByText(/끝나고 30분 뒤/)).not.toBeInTheDocument();
  });
});
