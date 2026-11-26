import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { openPlanWhy } from '../../testing/planItems.js';
import PlanCreateView from './PlanCreateView.jsx';
import { planAPI, schedulePreviewAPI } from '../../api/api.js';

vi.mock('../../api/api.js', () => ({
  planAPI: { createDraft: vi.fn(), confirm: vi.fn(), findCoveringDate: vi.fn(), loadDraft: vi.fn(), saveReviewState: vi.fn() },
  schedulePreviewAPI: { get: vi.fn(), recompute: vi.fn() },
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
  baselineMinutes: 390,
  targetMinutes: 390,
  estimatedAvailableMinutes: 600,
  availabilityConfidenceSummary: '기본 시간대(평일 19~22시, 주말 10~18시)를 사용한 추정',
  reservedBufferMinutes: 210,
  noAvailableTime: false,
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
    sessionStorage.clear();
    planAPI.findCoveringDate.mockResolvedValue([{ planVersionId: 1 }]);
    planAPI.createDraft.mockResolvedValue(DRAFT);
    // 배치 미리보기는 기본적으로 "아직 없음". 있는 경우는 개별 테스트에서 채운다.
    schedulePreviewAPI.get.mockResolvedValue(null);
    schedulePreviewAPI.recompute.mockResolvedValue(null);
  });

  /*
   * 평소에는 기간만 고르고 바로 만든다. 강도·목적·덧붙일 말은 「옵션」 한 줄에 접혀 있고 지금 값이 요약으로 보인다.
   * 첫 계획이면(확정 이력 없음) 강도를 알 수 있게 펼친 채로 시작한다.
   */
  it('강도·목적·덧붙일 말은 「옵션」에 접혀 있고 고른 값이 요약으로 보인다', async () => {
    render(<PlanCreateView projectTitles={PROJECT_TITLES} />);
    const options = await screen.findByRole('button', { name: /^옵션/ });

    expect(options).toHaveAttribute('aria-expanded', 'false');
    expect(options).toHaveTextContent('직전 계획과 같은 강도');
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/덧붙일 말/)).not.toBeInTheDocument();

    await userEvent.click(options);
    expect(screen.getAllByRole('radio').length).toBeGreaterThan(1);
    await userEvent.click(screen.getByRole('button', { name: '시험 준비' }));
    await userEvent.type(screen.getByLabelText(/덧붙일 말/), '개념부터');

    await userEvent.click(options);
    expect(options).toHaveAttribute('aria-expanded', 'false');
    expect(options).toHaveTextContent('직전 계획과 같은 강도 · 시험 준비 · 덧붙일 말 있음');
  });

  it('첫 계획이면 「옵션」을 펼친 채로 시작한다', async () => {
    planAPI.findCoveringDate.mockResolvedValue([]);
    render(<PlanCreateView projectTitles={PROJECT_TITLES} />);

    const options = await screen.findByRole('button', { name: /^옵션/ });
    await waitFor(() => expect(options).toHaveAttribute('aria-expanded', 'true'));
    expect(screen.getByText(/처음이라면 보통으로 그냥 넘어가도 괜찮아요/)).toBeInTheDocument();
  });

  async function openDraft() {
    render(<PlanCreateView projectTitles={PROJECT_TITLES} />);
    await userEvent.click(await screen.findByRole('button', { name: /초안 만들기/ }));
    // 제목은 input의 value라 텍스트로 잡히지 않는다. 초안이 그려졌다는 신호는 게이지다.
    await screen.findByRole('button', { name: '계획 확정' });
    // 예산·판단·참고한 정보는 「왜 이렇게 짰나요?」 안에 있다.
    openPlanWhy();
  }

  it('요약이 선택된 항목의 시간 합을 먼저 보여주고, 체크를 풀면 줄어든다', async () => {
    await openDraft();

    // 40 + 60 + 30 + 20 = 150분 = 2h 30m
    expect(screen.getByText('고른 항목 4개 · 합계 2h 30m')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: /과제 2번/ }));

    // 60분이 빠져 90분 = 1h 30m
    await waitFor(() => expect(screen.getByText('고른 항목 3개 · 합계 1h 30m')).toBeInTheDocument());
  });

  /*
   * 예산은 상한이지 채울 양이 아니다. 그래서 "선택 / 목표" 막대도, 덜 채운 비율도 없다.
   */
  it('예산은 상한이라고 작게 말하고, 덜 채운 비율은 어디에도 없다', async () => {
    await openDraft();

    expect(screen.getByText(/예산\(상한\) 6h 30m — 채워야 하는 양이 아니에요/)).toBeInTheDocument();
    expect(screen.queryByText(/학습 목표/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+\s*%/)).not.toBeInTheDocument();
    expect(screen.queryByText('2h 30m / 6h 30m')).not.toBeInTheDocument();
  });

  it('AI가 기준선을 조정했으면 이유를 한 줄로 보여준다', async () => {
    await openDraft();

    expect(screen.getByText('알바 일정을 고려해 낮게 잡았어요')).toBeInTheDocument();
    // 예산은 서버가 계산한 값(390분 = 6h 30m)이다. 상한으로만 말한다.
    expect(screen.getAllByText(/예산\(상한\) 6h 30m/).length).toBeGreaterThan(0);
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
    await waitFor(() => expect(screen.getByText('고른 항목 2개 · 합계 50m')).toBeInTheDocument());
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

  /*
   * 요약은 고른 양(항목 수·합계)이 먼저고, 남는 시간 추정·여유는 작은 글씨로 뒤따른다. 예산(상한)은 설명이라
   * 「왜 이렇게 짰나요?」 안에 있다. 항목을 빼면 합계와 여유가 바로 바뀐다. 예산보다 적어도 경고하지 않는다.
   */
  it('요약에 고른 합계가 먼저, 남는 시간·여유가 보조로 나오고, 예산은 설명 쪽에 있고, 빼면 여유가 늘어난다', async () => {
    await openDraft();

    expect(screen.getByText('고른 항목 4개 · 합계 2h 30m')).toBeInTheDocument();
    // 600 - 150 = 450분 = 7h 30m
    const overview = screen.getByRole('region', { name: '초안 요약' });
    expect(within(overview).getByText(/남는 시간 추정 10h · 여유\/휴식 약 7h 30m/)).toBeInTheDocument();
    expect(within(overview).queryByText(/예산\(상한\)/)).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: '왜 이렇게 짰나요?' }))
      .getByText(/예산\(상한\) 6h 30m — 채워야 하는 양이 아니에요/)).toBeInTheDocument();
    expect(screen.getByText(/기본 시간대.*추정/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: /과제 2번/ }));

    await waitFor(() => expect(screen.getByText('고른 항목 3개 · 합계 1h 30m')).toBeInTheDocument());
    expect(screen.getByText(/여유\/휴식 약 8h 30m/)).toBeInTheDocument();
    expect(screen.queryByText(/부족|미달|실패/)).not.toBeInTheDocument();
  });

  /*
   * 8일 이상 계획은 강도 예산이 한 계획의 최대(30개 × 120분)를 넘을 수 있다. 서버가 목표를
   * 깎아 보내고, 화면은 그 사실을 실패가 아니라 사실로 말한다.
   */
  it('예산이 상한으로 깎였으면 다 담지 못했다고 말한다', async () => {
    planAPI.createDraft.mockResolvedValue({
      ...DRAFT, days: 31, targetMinutes: 3600, estimatedAvailableMinutes: 7980,
      reservedBufferMinutes: 4380, targetCappedByItemLimit: true, uncoveredMinutes: 3180,
    });
    render(<PlanCreateView projectTitles={PROJECT_TITLES} />);
    await userEvent.click(await screen.findByRole('button', { name: /초안 만들기/ }));

    expect(await screen.findByText(/한 계획에 다 담지는 못했어요/)).toBeInTheDocument();
    expect(screen.getByText(/약 53h이 남아요/)).toBeInTheDocument();
    expect(screen.getByText(/주 단위로 나눠 만들면/)).toBeInTheDocument();
    // 실패가 아니다 — 확정은 그대로 할 수 있다.
    expect(screen.getByRole('button', { name: '계획 확정' })).toBeEnabled();
  });

  it('상한에 닿지 않으면 그 줄을 그리지 않는다', async () => {
    await openDraft();

    expect(screen.queryByText(/한 계획에 다 담지는 못했어요/)).not.toBeInTheDocument();
  });

  it('남는 시간이 0이면 빈 초안 대신 안내와 수정 경로를 보여준다', async () => {
    planAPI.createDraft.mockResolvedValue({
      ...DRAFT, proposalId: null, proposal: null, targetMinutes: 0, estimatedAvailableMinutes: 0,
      noAvailableTime: true, availabilityConfidenceSummary: '배치할 수 있는 시간이 없음',
    });
    const onOpenSchedule = vi.fn();
    render(<PlanCreateView projectTitles={PROJECT_TITLES} onOpenSchedule={onOpenSchedule} />);
    await userEvent.click(await screen.findByRole('button', { name: /초안 만들기/ }));

    expect(await screen.findByText(/배치할 수 있는 시간이 없어요/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '계획 확정' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '일정에서 남는 시간 확인' }));
    expect(onOpenSchedule).toHaveBeenCalled();
  });

  /*
   * 확정 전에 첫 7일의 정확한 시각을 미리보기로 계산해 보여주고, 그 시각을 확정 요청에 그대로
   * 싣는다. 배치 안 된 항목은 실패라고 말하고 원본(미배치) 그대로 간다. OpenAI는 부르지 않는다.
   */
  it('미리보기의 정확한 시각을 보여주고 확정에 그대로 싣는다', async () => {
    schedulePreviewAPI.recompute.mockResolvedValue({
      proposalId: 77, horizonStart: '2026-08-24', horizonEnd: '2026-08-30',
      placedItems: [{
        proposalItemId: 1, title: '연결 리스트 구현', placementType: 'TIME_FIXED', scheduledDate: '2026-08-25',
        scheduledStartAt: '2026-08-25T19:00:00', scheduledEndAt: '2026-08-25T19:40:00',
      }],
      unplacedItems: [{ proposalItemId: 3, title: '통계 복습', reason: '남는 시간이 없어요' }],
    });
    planAPI.confirm.mockResolvedValue({ planVersionId: 9 });
    await openDraft();

    expect(await screen.findByText(/8\/25 화 19:00~19:40/)).toBeInTheDocument();
    // 줄에는 "배치 안 됨"만, 이유는 그 줄을 펼치면 보인다.
    const unplaced = screen.getByText(/배치 안 됨/).closest('li');
    expect(within(unplaced).queryByText('남는 시간이 없어요')).not.toBeInTheDocument();
    await userEvent.click(within(unplaced).getByText(/배치 안 됨/));
    expect(within(unplaced).getByText('남는 시간이 없어요')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '계획 확정' }));
    await waitFor(() => expect(planAPI.confirm).toHaveBeenCalled());
    const [, body] = planAPI.confirm.mock.calls[0];
    expect(body.editedItems).toEqual([{
      proposalItemId: 1, placementType: 'TIME_FIXED', scheduledDate: '2026-08-25',
      scheduledStartAt: '2026-08-25T19:00:00', scheduledEndAt: '2026-08-25T19:40:00',
    }]);
  });

  /*
   * AI 패널에서 만든 기간 계획은 같은 검토 화면으로 들어온다. 기간·강도 폼은 접고 바로 검토다.
   * 5개를 넘는 항목도 그대로 그린다 — 일반 제안의 5개 상한은 여기에 없다.
   */
  it('초안을 만든 뒤 새로고침하면 세션에 남긴 id로 저장된 초안을 다시 읽고, 버리면 잊는다', async () => {
    sessionStorage.clear();
    await openDraft();
    expect(sessionStorage.getItem('plan.create.openProposalId')).toBe('77');

    // 새로고침 = 같은 세션에서 다시 마운트. 서버가 저장한 초안이 원본이고 모델은 부르지 않는다.
    planAPI.loadDraft.mockResolvedValue({ ...DRAFT, proposal: { ...DRAFT.proposal, status: 'PROPOSED' } });
    const { unmount } = render(<PlanCreateView projectTitles={PROJECT_TITLES} />);
    await screen.findByText('새로고침 전에 만들던 초안을 다시 불러왔어요.');
    expect(planAPI.loadDraft).toHaveBeenCalledWith('77');
    expect(planAPI.createDraft).toHaveBeenCalledTimes(1);
    unmount();

    // 이미 처리된 초안(확정·폐기)은 되살리지 않고 기억도 지운다.
    planAPI.loadDraft.mockResolvedValue({ ...DRAFT, proposal: { ...DRAFT.proposal, status: 'DISMISSED' } });
    render(<PlanCreateView projectTitles={PROJECT_TITLES} />);
    await waitFor(() => expect(sessionStorage.getItem('plan.create.openProposalId')).toBeNull());
    expect(screen.queryByText('새로고침 전에 만들던 초안을 다시 불러왔어요.')).not.toBeInTheDocument();
  });

  it('제목·체크를 고치면 검토 상태를 저장하고, 새로고침 뒤 같은 초안을 그 상태로 되돌리며, 확정에 같은 값을 싣는다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      planAPI.saveReviewState.mockImplementation(async (id, state) => ({ ...state, version: (state.version ?? 0) + 1 }));
      await openDraft();
      const titleInput = screen.getByLabelText('계획 이름');
      await userEvent.clear(titleInput);
      await userEvent.type(titleInput, '재귀 따라잡기');
      await userEvent.click(screen.getByRole('checkbox', { name: /과제 2번/ }));
      await vi.advanceTimersByTimeAsync(800);
      await waitFor(() => expect(planAPI.saveReviewState).toHaveBeenLastCalledWith(77, expect.objectContaining({
        title: '재귀 따라잡기', excludedProposalItemIds: [2],
      })));
      // 첫 저장은 version null(저장된 상태 없음), 이후 저장은 서버가 돌려준 version으로 이어진다.
      expect(planAPI.saveReviewState.mock.calls[0][1].version).toBeNull();
    } finally {
      vi.useRealTimers();
    }

    // 새로고침 = 같은 세션에서 다시 마운트. 서버가 저장한 검토 상태가 초안에 붙어 온다.
    cleanup();
    sessionStorage.setItem('plan.create.openProposalId', '77');
    planAPI.loadDraft.mockResolvedValue({
      ...DRAFT,
      proposal: { ...DRAFT.proposal, status: 'PROPOSED' },
      reviewState: { version: 2, title: '재귀 따라잡기', excludedProposalItemIds: [2, 999], editedItems: [], answers: {} },
    });
    const { unmount } = render(<PlanCreateView projectTitles={PROJECT_TITLES} />);
    await screen.findByText('새로고침 전에 만들던 초안을 다시 불러왔어요.');
    expect(screen.getByLabelText('계획 이름')).toHaveValue('재귀 따라잡기');
    expect(screen.getByRole('checkbox', { name: /과제 2번/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /연결 리스트 구현/ })).toBeChecked();

    planAPI.confirm.mockResolvedValue({ planVersionId: 5 });
    await userEvent.click(screen.getByRole('button', { name: '계획 확정' }));
    await waitFor(() => expect(planAPI.confirm).toHaveBeenCalledWith(77, expect.objectContaining({
      excludedItemIds: [2], title: '재귀 따라잡기',
    })));
    unmount();
  });

  it('다른 곳에서 먼저 저장된 검토 상태가 있으면(409) 서버의 최신 상태로 화면을 맞춘다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const stale = Object.assign(new Error('검토 상태가 다른 곳에서 먼저 저장됐어요.'), { code: 'E409_022' });
      planAPI.saveReviewState.mockRejectedValue(stale);
      planAPI.loadDraft.mockResolvedValue({
        ...DRAFT, proposal: { ...DRAFT.proposal, status: 'PROPOSED' },
        reviewState: { version: 3, title: '다른 탭 제목', excludedProposalItemIds: [1] },
      });
      await openDraft();
      await userEvent.click(screen.getByRole('checkbox', { name: /과제 2번/ }));
      await vi.advanceTimersByTimeAsync(800);
      await waitFor(() => expect(screen.getByText('다른 곳에서 먼저 저장된 검토 상태를 불러왔어요.')).toBeInTheDocument());
      expect(screen.getByLabelText('계획 이름')).toHaveValue('다른 탭 제목');
      expect(screen.getByRole('checkbox', { name: /연결 리스트 구현/ })).not.toBeChecked();
      expect(screen.getByRole('checkbox', { name: /과제 2번/ })).toBeChecked();
    } finally {
      vi.useRealTimers();
    }
  });

  it('AI 대화에서 넘어온 초안은 바로 검토로 시작하고 5개 넘는 항목도 그린다', async () => {
    const manyItems = Array.from({ length: 9 }, (_, i) => ({
      proposalItemId: 100 + i, title: `항목 ${i + 1}`, expectedMinutes: 30, courseId: 6, targetDate: null,
      placementType: 'UNSCHEDULED',
    }));
    const fromAi = { ...DRAFT, proposalId: 88, proposal: { proposalId: 88, items: manyItems } };
    render(<PlanCreateView projectTitles={PROJECT_TITLES} initialDraft={fromAi} />);

    expect(await screen.findByText(/AI 대화에서 만든 기간 계획이에요/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /초안 만들기/ })).not.toBeInTheDocument();
    for (let i = 1; i <= 9; i++) {
      expect(screen.getByText(`항목 ${i}`)).toBeInTheDocument();
    }
    expect(screen.getAllByRole('checkbox').length).toBeGreaterThanOrEqual(9);
    expect(screen.getByRole('button', { name: '계획 확정' })).toBeInTheDocument();
    // 일반 제안의 "변경 N개 적용" 바는 여기서 쓰지 않는다. 확정은 하단 확정 바의 [계획 확정] 하나다.
    expect(screen.queryByRole('button', { name: /변경 \d+개 적용/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '적용' })).not.toBeInTheDocument();
    expect(planAPI.createDraft).not.toHaveBeenCalled();
  });
});
