import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlanDraftReview from './PlanDraftReview.jsx';
import ExecutionItemEvidence from './ExecutionItemEvidence.jsx';
import { forgetItemEvidence } from '../../lib/evidenceCache.js';
import { planAPI, schedulePreviewAPI } from '../../api/api.js';

vi.mock('../../api/api.js', () => ({
  planAPI: {
    createDraft: vi.fn(), confirm: vi.fn(), findCoveringDate: vi.fn(), regenerateItems: vi.fn(),
    draftProvenance: vi.fn(), itemProvenance: vi.fn(),
  },
  schedulePreviewAPI: { get: vi.fn(), recompute: vi.fn() },
  topicAPI: { updateUserMark: vi.fn() },
}));

/**
 * 여기서 증명하려는 것은 <b>세 가지가 화면에서 서로 다른 것으로 보인다</b>는 점이다.
 *
 * 등록한 일정(원본 정보)과 서버가 계산한 남는 시간과 AI가 적어 낸 예상 시간이 한 덩어리로
 * 보이면, 사용자는 추정을 확정된 사실로 읽는다. 출처가 붙어 있다는 이유로 "확인됐다"고
 * 말하지 않는 것도 같은 이유다 — 인용이 맞는 것과 내용이 맞는 것은 다른 질문이다.
 */
const PROVENANCE = {
  recorded: true,
  proposalId: 77,
  generationId: 'gen-1',
  capturedAt: '2026-09-10T15:00:00',
  timezone: 'Asia/Seoul',
  startDate: '2026-09-10',
  endDate: '2026-09-13',
  generator: 'AI',
  modelName: 'test-model',
  providedSources: [
    {
      refId: 's1',
      sourceType: 'COMMITMENT',
      sourceId: 17,
      representation: 'SELECTED_FIELDS',
      providedValue: { label: '근무' },
      promptLine: '9/11 목 18:00~23:00 근무 [s1]',
      link: { available: true, target: 'COMMITMENT', targetId: 17, unavailableReason: null },
    },
    {
      refId: 's2',
      sourceType: 'TOPIC',
      sourceId: 101,
      representation: 'SELECTED_FIELDS',
      providedValue: { courseId: 6, title: '재귀' },
      promptLine: '- 재귀 (2주차) [s2]',
      link: { available: false, target: null, unavailableReason: '원본이 지워졌거나 볼 수 없어요' },
    },
  ],
  serverCalculations: [
    {
      calculationId: 'calc-1',
      kind: 'AVAILABILITY_ESTIMATE',
      providedToModel: true,
      inputRefIds: ['s1'],
      inputLineage: 'PARTIAL',
      lineageNote: '기본 창은 서버 상수다',
      result: { availableMinutes: 925, confidenceSummary: '기본 시간대를 사용한 추정' },
    },
  ],
  items: [
    {
      proposalItemId: 1,
      title: '자료구조 · 재귀',
      recorded: true,
      generationId: 'gen-1',
      refIds: ['s2'],
      reason: '2주차 진도라서',
      aiEstimates: ['예상 소요 시간 40분'],
      serverCalculationIds: [],
      evidenceStatus: 'CURRENT',
      staleReasons: [],
      unknownRefCount: 1,
    },
  ],
};

const DRAFT = {
  proposalId: 77,
  startDate: '2026-09-10',
  endDate: '2026-09-13',
  days: 4,
  intensity: 'NORMAL',
  targetMinutes: 600,
  estimatedAvailableMinutes: 925,
  noAvailableTime: false,
  suggestedTitle: '이번 주 계획',
  strategy: null,
  proposal: {
    proposalId: 77,
    items: [{
      proposalItemId: 1, topicId: 101, courseId: 6, title: '자료구조 · 재귀',
      expectedMinutes: 40, priority: 'MUST', placementType: 'UNSCHEDULED', targetDate: null,
      reason: '2주차 진도라서',
    }],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  schedulePreviewAPI.get.mockResolvedValue(null);
  schedulePreviewAPI.recompute.mockResolvedValue({ placedItems: [], unplacedItems: [] });
  planAPI.draftProvenance.mockResolvedValue(PROVENANCE);
  planAPI.itemProvenance.mockResolvedValue({ ...PROVENANCE, planVersionId: 9 });
});

describe('생성 시 참고한 정보', () => {
  it('접혀 있다가 열리고, 준 정보와 서버 계산을 나눠서 보여준다', async () => {
    const user = userEvent.setup();
    render(<PlanDraftReview draft={DRAFT} todayIso="2026-09-10" />);

    await waitFor(() => expect(planAPI.draftProvenance).toHaveBeenCalledWith(77));
    // 접혀 있는 동안에는 본문이 없다 — 훑어보는 화면의 무게중심을 옮기지 않는다.
    expect(screen.queryByText(/근무/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /생성 시 참고한 정보/ }));

    expect(screen.getByText(/9\/11 목 18:00~23:00 근무/)).toBeInTheDocument();
    // 인용 번호는 AI에게 준 표식이지 사용자에게 보일 값이 아니다.
    expect(screen.queryByText(/\[s1\]/)).not.toBeInTheDocument();
    // 남는 시간은 "준 정보"가 아니라 "서버가 계산한 것"으로 따로 선다.
    expect(screen.getByText('서버가 계산한 것')).toBeInTheDocument();
    expect(screen.getByText(/남는 시간 약 925분/)).toBeInTheDocument();
    // 확인됐다고 말하지 않는다.
    expect(screen.getByText(/모두 그대로 반영된다는 뜻은 아니에요/)).toBeInTheDocument();
  });

  it('출처 기록이 없는 초안은 없다고 말한다 — 지금 DB로 채워 넣지 않는다', async () => {
    planAPI.draftProvenance.mockResolvedValue({ recorded: false, items: [] });
    const user = userEvent.setup();
    render(<PlanDraftReview draft={DRAFT} todayIso="2026-09-10" />);

    await waitFor(() => expect(planAPI.draftProvenance).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: /생성 시 참고한 정보/ }));

    expect(screen.getByText(/생성 당시 출처 기록이 없어요/)).toBeInTheDocument();
  });
});

describe('항목별 근거', () => {
  it('원본 정보·서버 계산·AI 판단을 나눠 보여주고, 버린 인용을 숨기지 않는다', async () => {
    const user = userEvent.setup();
    render(<PlanDraftReview draft={DRAFT} todayIso="2026-09-10" />);

    await waitFor(() => expect(planAPI.draftProvenance).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: /근거 보기/ }));

    expect(screen.getByText('근거로 연결한 정보')).toBeInTheDocument();
    expect(screen.getByText(/재귀 \(2주차\)/)).toBeInTheDocument();
    expect(screen.getByText('AI가 판단한 것')).toBeInTheDocument();
    expect(screen.getByText('예상 소요 시간 40분')).toBeInTheDocument();
    expect(screen.getByText(/AI가 그렇게 봤다는 뜻이에요/)).toBeInTheDocument();
    // 없는 출처를 인용했다는 사실을 조용히 지우지 않는다.
    expect(screen.getByText(/없던 출처 1건/)).toBeInTheDocument();
  });

  it('지워진 원본은 링크 대신 이유를 보여준다', async () => {
    const user = userEvent.setup();
    render(<PlanDraftReview draft={DRAFT} todayIso="2026-09-10" onOpenSource={vi.fn()} />);

    await waitFor(() => expect(planAPI.draftProvenance).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: /근거 보기/ }));

    expect(screen.getByText('원본이 지워졌거나 볼 수 없어요')).toBeInTheDocument();
  });

  it('수정 전 제안의 근거라는 표식이 붙는다', async () => {
    planAPI.draftProvenance.mockResolvedValue({
      ...PROVENANCE,
      items: [{
        ...PROVENANCE.items[0],
        evidenceStatus: 'EDITED_BY_USER',
        staleReasons: ['확정할 때 내용이나 분량을 바꿨어요. 아래는 수정 전 제안의 근거예요.'],
      }],
    });
    render(<PlanDraftReview draft={DRAFT} todayIso="2026-09-10" />);

    await waitFor(() => expect(planAPI.draftProvenance).toHaveBeenCalled());
    expect(screen.getByText('수정 전 제안의 근거')).toBeInTheDocument();
  });
});

describe('적용된 항목의 근거', () => {
  beforeEach(() => forgetItemEvidence());

  it('펼칠 때만 불러오고, 같은 회차의 근거를 보여준다', async () => {
    const user = userEvent.setup();
    render(<ExecutionItemEvidence executionItemId={501} version={1} />);

    // 목록에 수십 개가 있어도 열기 전에는 요청하지 않는다.
    expect(planAPI.itemProvenance).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /근거 보기/ }));

    await waitFor(() => expect(planAPI.itemProvenance).toHaveBeenCalledWith(501));
    expect(await screen.findByText('근거로 연결한 정보')).toBeInTheDocument();
    // 항목 근거 아래에 회차 전체 정보도 함께 열 수 있다.
    expect(screen.getByRole('button', { name: /생성 시 참고한 정보/ })).toBeInTheDocument();
  });

  /**
   * 옮기거나 줄이면 조각의 version이 오른다. 그때 옛 응답을 계속 보여주면 "적용 후 바뀜"
   * 표식이 뜨지 않아 사용자가 지금 배치를 AI가 낸 것으로 읽는다.
   */
  it('조각이 바뀌면(version) 옛 응답을 버리고 다시 불러와 적용 후 바뀜을 보여준다', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ExecutionItemEvidence executionItemId={501} version={1} />);
    await user.click(screen.getByRole('button', { name: /근거 보기/ }));
    await waitFor(() => expect(planAPI.itemProvenance).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('적용 후 바뀜')).not.toBeInTheDocument();

    planAPI.itemProvenance.mockResolvedValue({
      ...PROVENANCE,
      items: [{ ...PROVENANCE.items[0], afterApplyChanges: ['적용한 뒤 분량을 줄였어요. 아래는 줄이기 전 제안의 근거예요.'] }],
    });
    rerender(<ExecutionItemEvidence executionItemId={501} version={2} />);

    await waitFor(() => expect(planAPI.itemProvenance).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('적용 후 바뀜')).toBeInTheDocument();
    expect(screen.getByText(/적용한 뒤 분량을 줄였어요/)).toBeInTheDocument();
    // 근거 자체는 그대로 보인다.
    expect(screen.getByText(/재귀 \(2주차\)/)).toBeInTheDocument();
  });

  it('같은 조각·같은 version은 다시 부르지 않고, 실패한 요청은 다시 시도할 수 있다', async () => {
    const user = userEvent.setup();
    planAPI.itemProvenance.mockRejectedValueOnce(new Error('네트워크가 끊겼어요'));
    render(<ExecutionItemEvidence executionItemId={502} version={3} />);
    await user.click(screen.getByRole('button', { name: /근거 보기/ }));
    expect(await screen.findByText(/네트워크가 끊겼어요/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /다시 시도/ }));
    expect(await screen.findByText('근거로 연결한 정보')).toBeInTheDocument();
    expect(planAPI.itemProvenance).toHaveBeenCalledTimes(2);

    // 닫았다 열어도, 다른 화면에서 같은 조각을 열어도 다시 부르지 않는다.
    await user.click(screen.getByRole('button', { name: /근거 보기/ }));
    await user.click(screen.getByRole('button', { name: /근거 보기/ }));
    render(<ExecutionItemEvidence executionItemId={502} version={3} />);
    expect(planAPI.itemProvenance).toHaveBeenCalledTimes(2);
  });
});
