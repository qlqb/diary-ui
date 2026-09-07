import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlanCreateView from './PlanCreateView.jsx';
import { planAPI, routineAPI, schedulePreviewAPI } from '../../api/api.js';

vi.mock('../../api/api.js', () => ({
  planAPI: { createDraft: vi.fn(), confirm: vi.fn(), findCoveringDate: vi.fn() },
  routineAPI: { pendingLeadMinutes: vi.fn(), updateLeadMinutes: vi.fn() },
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
    planAPI.findCoveringDate.mockResolvedValue([{ planVersionId: 1 }]);
    planAPI.createDraft.mockResolvedValue(DRAFT);
    // 물을 이동시간이 없는 것이 기본이다. 있는 경우는 개별 테스트에서 채운다.
    routineAPI.pendingLeadMinutes.mockResolvedValue([]);
    routineAPI.updateLeadMinutes.mockResolvedValue([]);
    // 배치 미리보기는 기본적으로 "아직 없음". 있는 경우는 개별 테스트에서 채운다.
    schedulePreviewAPI.get.mockResolvedValue(null);
    schedulePreviewAPI.recompute.mockResolvedValue(null);
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
    // 목표는 서버가 계산한 값(390분 = 6h 30m)이다. 요약 줄과 게이지 라벨 두 곳에 나온다.
    expect(screen.getAllByText(/목표 6h 30m/).length).toBeGreaterThan(0);
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

  /*
   * 강도는 남는 시간의 비율이다. 요약 줄에 추정 남는 시간·학습 목표·선택 합계·여유를 함께
   * 보여주고, 항목을 빼면 합계와 여유가 바로 바뀐다. 목표보다 적어도 경고하지 않는다.
   */
  it('요약에 추정 남는 시간·목표·선택 합계·여유를 보여주고, 빼면 여유가 늘어난다', async () => {
    await openDraft();

    expect(screen.getByText(/추정 남는 시간 10h · 학습 목표 6h 30m/)).toBeInTheDocument();
    // 600 - 150 = 450분 = 7h 30m
    expect(screen.getByText(/선택한 항목 4개 · 합계 2h 30m · 여유\/휴식 약 7h 30m/)).toBeInTheDocument();
    expect(screen.getByText(/기본 시간대.*추정/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: /과제 2번/ }));

    await waitFor(() => expect(screen.getByText(/선택한 항목 3개 · 합계 1h 30m · 여유\/휴식 약 8h 30m/)).toBeInTheDocument());
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
    expect(screen.getByText(/배치 안 됨 · 남는 시간이 없어요/)).toBeInTheDocument();

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
    expect(screen.queryByRole('button', { name: /적용/ })).not.toBeInTheDocument();
    expect(planAPI.createDraft).not.toHaveBeenCalled();
  });
});

/**
 * 이동시간을 아직 정하지 않은 반복 일정이 있으면 초안보다 먼저 묻는다. 여기서 고정하는 것은
 * 순서다 — 카드가 떠 있는 동안 초안 요청이 나가지 않고, 답하면 저장 → 초안, 「나중에」면
 * 저장 없이 초안이다.
 */
describe('초안 전 이동시간 질문', () => {
  const PENDING = [{
    groupKey: 'class', label: '수업', routineIds: [1, 7],
    sample: [{ dayOfWeek: 'TUESDAY', startTime: '14:00:00' }, { dayOfWeek: 'THURSDAY', startTime: '10:00:00' }],
  }];

  beforeEach(() => {
    vi.clearAllMocks();
    planAPI.findCoveringDate.mockResolvedValue([{ planVersionId: 1 }]);
    planAPI.createDraft.mockResolvedValue(DRAFT);
    routineAPI.updateLeadMinutes.mockResolvedValue([]);
    schedulePreviewAPI.get.mockResolvedValue(null);
    schedulePreviewAPI.recompute.mockResolvedValue(null);
  });

  it('정하지 않은 이동시간이 있으면 카드가 먼저 뜨고 초안은 아직 만들지 않는다', async () => {
    routineAPI.pendingLeadMinutes.mockResolvedValue(PENDING);
    render(<PlanCreateView projectTitles={PROJECT_TITLES} />);

    await userEvent.click(await screen.findByRole('button', { name: /초안 만들기/ }));

    expect(await screen.findByText('수업 전 이동시간은 얼마나 걸리나요?')).toBeInTheDocument();
    expect(planAPI.createDraft).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /초안 만들기/ })).not.toBeInTheDocument();
    // 기간을 함께 보낸다 — 그 기간에 도는 수업만 묻는다.
    expect(routineAPI.pendingLeadMinutes).toHaveBeenCalledWith(
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  });

  it('답하면 저장한 뒤 초안을 만든다', async () => {
    routineAPI.pendingLeadMinutes.mockResolvedValue(PENDING);
    render(<PlanCreateView projectTitles={PROJECT_TITLES} />);
    await userEvent.click(await screen.findByRole('button', { name: /초안 만들기/ }));
    await screen.findByText('수업 전 이동시간은 얼마나 걸리나요?');

    await userEvent.click(screen.getByRole('button', { name: '1시간' }));
    await userEvent.click(screen.getByRole('button', { name: '이대로 저장' }));

    await screen.findByRole('button', { name: '계획 확정' });
    expect(routineAPI.updateLeadMinutes).toHaveBeenCalledWith([{ routineId: 1, leadMinutes: 60 }, { routineId: 7, leadMinutes: 60 }]);
    expect(planAPI.createDraft).toHaveBeenCalledTimes(1);
  });

  it('「나중에」면 저장 없이 초안을 만든다', async () => {
    routineAPI.pendingLeadMinutes.mockResolvedValue(PENDING);
    render(<PlanCreateView projectTitles={PROJECT_TITLES} />);
    await userEvent.click(await screen.findByRole('button', { name: /초안 만들기/ }));
    await screen.findByText('수업 전 이동시간은 얼마나 걸리나요?');

    await userEvent.click(screen.getByRole('button', { name: '나중에' }));

    await screen.findByRole('button', { name: '계획 확정' });
    expect(routineAPI.updateLeadMinutes).not.toHaveBeenCalled();
    expect(planAPI.createDraft).toHaveBeenCalledTimes(1);
  });

  it('물을 것이 없으면 바로 초안을 만든다', async () => {
    routineAPI.pendingLeadMinutes.mockResolvedValue([]);
    render(<PlanCreateView projectTitles={PROJECT_TITLES} />);

    await userEvent.click(await screen.findByRole('button', { name: /초안 만들기/ }));

    await screen.findByRole('button', { name: '계획 확정' });
    expect(routineAPI.updateLeadMinutes).not.toHaveBeenCalled();
  });

  it('이동시간 조회가 안 되면 묻지 않고 초안으로 간다', async () => {
    routineAPI.pendingLeadMinutes.mockRejectedValue(new Error('network'));
    render(<PlanCreateView projectTitles={PROJECT_TITLES} />);

    await userEvent.click(await screen.findByRole('button', { name: /초안 만들기/ }));

    await screen.findByRole('button', { name: '계획 확정' });
    expect(planAPI.createDraft).toHaveBeenCalledTimes(1);
  });
});
