import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlanCreateView from './PlanCreateView.jsx';
import { planAPI } from '../../api/api.js';

vi.mock('../../api/api.js', () => ({
  planAPI: { createDraft: vi.fn(), confirm: vi.fn(), findCoveringDate: vi.fn() },
}));

/**
 * 초안 검토에서 증명하려는 것은 "사용자가 조정하는 대상이 개수가 아니라 부하"라는 점이다.
 * 체크를 풀면 게이지 합계가 줄어야 하고, 그룹 헤더 체크는 하위 전체를 한 번에 토글해야 한다
 * ("이번 주는 빅데이터 빼자"가 한 번에 되어야 한다).
 */
const DRAFT = {
  proposalId: 77,
  startDate: '2026-08-24',
  endDate: '2026-08-30',
  days: 7,
  intensity: 'FOCUSED',
  baselineMinutes: 1080,
  targetMinutes: 390,
  targetMinutesReason: '알바 일정을 고려해 낮게 잡았어요',
  suggestedTitle: '이번 주 계획',
  goalSummary: '3장까지 훑기',
  proposal: {
    proposalId: 77,
    items: [
      { proposalItemId: 1, title: '연결 리스트 구현', expectedMinutes: 40, courseId: 6, targetDate: null },
      { proposalItemId: 2, title: '과제 2번', expectedMinutes: 60, courseId: 6, targetDate: '2026-08-26' },
      { proposalItemId: 3, title: '통계 복습', expectedMinutes: 30, courseId: 7, targetDate: null },
      { proposalItemId: 4, title: '병원 예약', expectedMinutes: 20, courseId: null, targetDate: null },
    ],
  },
};

const PROJECT_TITLES = { 6: '자료구조', 7: '빅데이터분석' };

describe('계획 초안 검토', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    planAPI.findCoveringDate.mockResolvedValue([{ planVersionId: 1 }]);
    planAPI.createDraft.mockResolvedValue(DRAFT);
  });

  async function openDraft() {
    render(<PlanCreateView projectTitles={PROJECT_TITLES} />);
    await userEvent.click(await screen.findByRole('button', { name: /초안 만들기/ }));
    // 제목은 input의 value라 텍스트로 잡히지 않는다. 초안이 그려졌다는 신호는 게이지다.
    await screen.findByRole('button', { name: '계획 확정' });
  }

  it('게이지가 선택된 항목의 시간 합을 보여주고, 체크를 풀면 줄어든다', async () => {
    await openDraft();

    // 40 + 60 + 30 + 20 = 150분 = 2h 30m
    expect(screen.getByText('2h 30m / 6h 30m')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: /과제 2번/ }));

    // 60분이 빠져 90분 = 1h 30m
    await waitFor(() => expect(screen.getByText('1h 30m / 6h 30m')).toBeInTheDocument());
  });

  it('AI가 기준선을 조정했으면 이유를 한 줄로 보여준다', async () => {
    await openDraft();

    expect(screen.getByText('알바 일정을 고려해 낮게 잡았어요')).toBeInTheDocument();
    // 목표는 기준선(1080분)이 아니라 조정된 값(390분 = 6h 30m)이다.
    expect(screen.getByText(/목표 6h 30m/)).toBeInTheDocument();
  });

  it('조정이 없으면 이유 줄을 그리지 않는다', async () => {
    planAPI.createDraft.mockResolvedValue({
      ...DRAFT, targetMinutes: 1080, targetMinutesReason: null,
    });
    await openDraft();

    expect(screen.queryByText('알바 일정을 고려해 낮게 잡았어요')).not.toBeInTheDocument();
  });

  it('프로젝트별로 묶고, courseId가 없으면 기타로 보낸다', async () => {
    await openDraft();

    expect(screen.getByText('자료구조')).toBeInTheDocument();
    expect(screen.getByText('빅데이터분석')).toBeInTheDocument();
    expect(screen.getByText('기타')).toBeInTheDocument();
    // "미분류"라고 쓰지 않는다.
    expect(screen.queryByText('미분류')).not.toBeInTheDocument();
  });

  it('그룹 헤더 체크가 그 그룹 항목 전체를 한 번에 끈다', async () => {
    await openDraft();

    await userEvent.click(screen.getByRole('checkbox', { name: '자료구조 전체 선택' }));

    // 자료구조의 40 + 60이 빠지고 30 + 20 = 50분만 남는다.
    await waitFor(() => expect(screen.getByText('50m / 6h 30m')).toBeInTheDocument());
    expect(screen.getByRole('checkbox', { name: /연결 리스트 구현/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /과제 2번/ })).not.toBeChecked();
  });

  it('확정 요청에 기간·강도·목표를 보내지 않는다', async () => {
    planAPI.confirm.mockResolvedValue({ planVersionId: 9 });
    await openDraft();

    await userEvent.click(screen.getByRole('checkbox', { name: /병원 예약/ }));
    await userEvent.click(screen.getByRole('button', { name: '계획 확정' }));

    await waitFor(() => expect(planAPI.confirm).toHaveBeenCalled());
    const [proposalId, body] = planAPI.confirm.mock.calls[0];
    expect(proposalId).toBe(77);
    expect(body.excludedItemIds).toEqual([4]);
    // 서버가 초안 시점의 값을 갖고 있다. 다시 보내면 다른 값으로 확정될 수 있다.
    expect(body).not.toHaveProperty('startDate');
    expect(body).not.toHaveProperty('intensity');
    expect(body).not.toHaveProperty('targetMinutes');
  });

  it('프로젝트 범위로 들어오면 그 사실을 보여주고 courseIds를 함께 보낸다', async () => {
    render(<PlanCreateView projectTitles={PROJECT_TITLES} scopeCourseId={6} onClearScope={() => {}} />);

    // 범위를 조용히 적용하면 "왜 다른 프로젝트 항목이 안 나오지"를 알 방법이 없다.
    expect(await screen.findByText(/자료구조 항목만 제안받아요/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '전체 프로젝트로' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /초안 만들기/ }));

    await waitFor(() => expect(planAPI.createDraft).toHaveBeenCalled());
    expect(planAPI.createDraft.mock.calls[0][0].courseIds).toEqual([6]);
  });

  it('범위가 없으면 courseIds를 보내지 않는다', async () => {
    render(<PlanCreateView projectTitles={PROJECT_TITLES} />);
    await userEvent.click(await screen.findByRole('button', { name: /초안 만들기/ }));

    await waitFor(() => expect(planAPI.createDraft).toHaveBeenCalled());
    expect(planAPI.createDraft.mock.calls[0][0].courseIds).toBeNull();
    expect(screen.queryByText(/항목만 제안받아요/)).not.toBeInTheDocument();
  });

  it('항목을 전부 빼면 확정할 수 없다', async () => {
    await openDraft();

    for (const name of ['연결 리스트 구현', '과제 2번', '통계 복습', '병원 예약']) {
      await userEvent.click(screen.getByRole('checkbox', { name: new RegExp(name) }));
    }

    expect(screen.getByRole('button', { name: '계획 확정' })).toBeDisabled();
  });
});
