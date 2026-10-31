/**
 * 초안 첫 화면 요약의 계약(PlanDraftReview 맨 위 — 계획 탭과 상담 작업 공간이 같은 것을 본다).
 *
 *  - 실제 제안량이 먼저고 예산은 상한일 뿐이다.
 *  - "검토하지 못함"은 "뺐다"가 아니다. 셋(못 봄 / 못 정함 / 이번에 뺌)을 각자의 말로 부른다.
 *  - 일정이 없어서 가정한 것과 일정을 못 읽은 것은 다른 사실이다.
 *  - 낡은 초안은 "이전 버전"이라고 표시하고 다시 만들게 한다.
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PlanDraftReview from './PlanDraftReview.jsx';
import { planAPI, schedulePreviewAPI } from '../../api/api.js';

vi.mock('../../api/api.js', () => ({
  planAPI: { confirm: vi.fn(), draftProvenance: vi.fn(), saveReviewState: vi.fn() },
  schedulePreviewAPI: { get: vi.fn(), recompute: vi.fn() },
  topicAPI: { updateUserMark: vi.fn() },
}));

const PROJECTS = [
  {
    courseId: 6, courseTitle: '자료구조', disposition: 'INCLUDED', reason: '수업이 가장 빨라요', decidedBy: 'MODEL',
    materialState: 'TEXT_DELIVERED', itemCount: 2, itemMinutes: 100, sectionIds: [11], nextAction: null,
  },
  {
    courseId: 7, courseTitle: '빅데이터분석', disposition: 'NOT_REVIEWED', reason: '입력 한도 때문에 자료를 열어 보지 못했어요',
    decidedBy: 'SERVER', materialState: 'NOT_LISTED', itemCount: 0, itemMinutes: 0, sectionIds: [], nextAction: 'NARROW_SCOPE',
  },
  {
    courseId: 8, courseTitle: '운영체제', disposition: 'UNDECIDED', reason: '시험 범위를 아직 몰라요',
    decidedBy: 'MODEL', materialState: 'ANALYSIS_PENDING', itemCount: 0, itemMinutes: 0, sectionIds: [], nextAction: 'ANSWER_QUESTION',
  },
  {
    courseId: 9, courseTitle: '영어회화', disposition: 'EXCLUDED_BY_CHOICE', reason: '이번 주는 쉬기로 했어요',
    decidedBy: 'MODEL', materialState: 'NO_MATERIAL', itemCount: 0, itemMinutes: 0, sectionIds: [], nextAction: 'REVIEW_LATER',
  },
];

const DRAFT = {
  proposalId: 77, startDate: '2026-09-21', endDate: '2026-09-27', days: 7, intensity: 'NORMAL',
  targetMinutes: 390, proposedMinutes: 100, estimatedAvailableMinutes: 600, availabilityBasis: 'ALL_ASSUMED',
  suggestedTitle: '이번 주 계획',
  strategy: { projects: PROJECTS, openQuestions: ['운영체제 시험 범위가 어디까지예요?', '두 번째 질문'] },
  proposal: {
    proposalId: 77,
    items: [
      {
        proposalItemId: 1, title: '연결 리스트 구현', expectedMinutes: 60, courseId: 6, priority: 'MUST',
        reason: '화요일 실습에서 바로 써요', doneCriteria: '삽입·삭제를 직접 구현한다', sourceLocator: 'p.3~4',
        deadlineAt: '2026-09-22T14:00:00', deadlineSource: 'CLASS', evidence: { origin: 'SOURCE_TASK' },
      },
      {
        proposalItemId: 2, title: '복잡도 연습', expectedMinutes: 40, courseId: 6, priority: 'SHOULD',
        deadlineAt: '2026-09-24T23:59:00', deadlineSource: 'AI_PROPOSED', evidence: { origin: 'AI_PRACTICE' },
      },
      { proposalItemId: 3, title: '발표 준비', expectedMinutes: 30, courseId: 6, priority: 'MUST', evidence: { origin: 'USER_REQUEST' } },
    ],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  planAPI.draftProvenance.mockResolvedValue({ recorded: false, items: [], providedSources: [] });
  planAPI.saveReviewState.mockResolvedValue({ version: 1 });
  schedulePreviewAPI.get.mockResolvedValue({ placedItems: [], unplacedItems: [] });
  schedulePreviewAPI.recompute.mockResolvedValue({ placedItems: [], unplacedItems: [] });
});

describe('첫 화면 요약', () => {
  it('실제 항목 수와 합계가 먼저, 예산은 상한이라고만 말한다', async () => {
    render(<PlanDraftReview draft={DRAFT} todayIso="2026-09-19" />);
    const overview = await screen.findByRole('region', { name: '초안 요약' });

    expect(within(overview).getByText('고른 항목 3개 · 합계 2h 10m')).toBeInTheDocument();
    expect(within(overview).getByText(/예산\(상한\) 6h 30m — 채워야 하는 양이 아니에요/)).toBeInTheDocument();
    expect(within(overview).queryByText(/%/)).not.toBeInTheDocument();
  });

  it('★ 검토하지 못한 프로젝트를 "뺐다"고 부르지 않는다 — 셋을 각자의 말로, 이유·자료 상태·다음 길과 함께', async () => {
    render(<PlanDraftReview draft={DRAFT} todayIso="2026-09-19" />);
    const missing = await screen.findByRole('list', { name: '이번 초안에 들어가지 않은 프로젝트' });
    const rows = within(missing).getAllByRole('listitem');
    expect(rows).toHaveLength(3);

    const notReviewed = rows.find((row) => within(row).queryByText('빅데이터분석'));
    expect(within(notReviewed).getByText('검토하지 못했어요 — 중요도 판단이 아니에요')).toBeInTheDocument();
    expect(within(notReviewed).queryByText(/뺐어요|제외|미룸/)).not.toBeInTheDocument();
    expect(within(notReviewed).getByText('입력 한도 때문에 자료를 열어 보지 못했어요')).toBeInTheDocument();
    expect(within(notReviewed).getByText(/자료: 자료가 후보 목록에 오르지 못했어요/)).toBeInTheDocument();
    expect(within(notReviewed).getByText(/범위를 좁혀서 다시 만들면 볼 수 있어요/)).toBeInTheDocument();

    const undecided = rows.find((row) => within(row).queryByText('운영체제'));
    expect(within(undecided).getByText('아직 정하지 못했어요')).toBeInTheDocument();
    const excluded = rows.find((row) => within(row).queryByText('영어회화'));
    expect(within(excluded).getByText('이번에는 뺐어요')).toBeInTheDocument();

    expect(screen.getByText(/포함한 프로젝트 1개/)).toBeInTheDocument();
  });

  it('등록된 일정이 없어 가정한 시간이면 배치가 임시라고 말한다', async () => {
    render(<PlanDraftReview draft={DRAFT} todayIso="2026-09-19" />);
    expect(await screen.findByText(/등록된 일정이 없어 가능한 시간은 가정이에요. 배치는 임시예요/)).toBeInTheDocument();
    expect(screen.getByText('배치 임시')).toBeInTheDocument();
  });

  it('★ 일정을 못 읽었으면 "일정이 없어서"라고 말하지 않고, 못 읽었다고 말하고 다시 시도하게 한다', async () => {
    schedulePreviewAPI.get.mockRejectedValueOnce(new Error('network'));
    const user = userEvent.setup();
    render(<PlanDraftReview draft={DRAFT} todayIso="2026-09-19" />);

    expect(await screen.findByText(/일정을 불러오지 못했어요/)).toBeInTheDocument();
    expect(screen.queryByText(/등록된 일정이 없어/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '다시 시도' }));

    await waitFor(() => expect(schedulePreviewAPI.get).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/등록된 일정이 없어 가능한 시간은 가정이에요/)).toBeInTheDocument();
    expect(screen.queryByText(/일정을 불러오지 못했어요/)).not.toBeInTheDocument();
  });

  it('열려 있는 핵심 질문 하나와 [답하기]를 보여 주고, 누르면 그 질문을 넘긴다', async () => {
    const onAnswerQuestion = vi.fn();
    const user = userEvent.setup();
    render(<PlanDraftReview draft={DRAFT} todayIso="2026-09-19" onAnswerQuestion={onAnswerQuestion} />);

    const overview = await screen.findByRole('region', { name: '초안 요약' });
    expect(within(overview).getByText(/운영체제 시험 범위가 어디까지예요\?/)).toBeInTheDocument();
    expect(within(overview).queryByText('두 번째 질문')).not.toBeInTheDocument();
    await user.click(within(overview).getByRole('button', { name: '답하기' }));
    expect(onAnswerQuestion).toHaveBeenCalledWith('운영체제 시험 범위가 어디까지예요?');
  });

  it('[적용]은 계획 확정과 같은 요청이고, [계속 상담]은 대화로 돌아간다', async () => {
    const onContinueConsult = vi.fn();
    const onConfirmed = vi.fn();
    planAPI.confirm.mockResolvedValue({ planVersionId: 5 });
    const user = userEvent.setup();
    render(<PlanDraftReview draft={DRAFT} todayIso="2026-09-19" onContinueConsult={onContinueConsult} onConfirmed={onConfirmed} />);

    const overview = await screen.findByRole('region', { name: '초안 요약' });
    await user.click(within(overview).getByRole('button', { name: '계속 상담' }));
    expect(onContinueConsult).toHaveBeenCalled();

    await user.click(within(overview).getByRole('button', { name: '적용' }));
    await waitFor(() => expect(planAPI.confirm).toHaveBeenCalledWith(77, expect.objectContaining({ excludedItemIds: [] })));
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledWith({ planVersionId: 5 }));
  });
});

describe('낡은 초안', () => {
  it('서버가 낡았다고 알려 주면 "이전 버전 · 최신 답변 반영 전"과 [다시 만들기]를 보여 준다', async () => {
    const onRemake = vi.fn();
    const user = userEvent.setup();
    render(
      <PlanDraftReview todayIso="2026-09-19" onRemake={onRemake}
        draft={{ ...DRAFT, freshness: { state: 'STALE', reasons: ['가능한 시간이 달라졌어요'] } }} />,
    );

    expect(await screen.findByText('이전 버전 · 최신 답변 반영 전')).toBeInTheDocument();
    expect(screen.getByText(/이 초안은 최신 답변을 반영하기 전 버전이에요/)).toBeInTheDocument();
    expect(screen.getByText(/가능한 시간이 달라졌어요/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '다시 만들기' }));
    expect(onRemake).toHaveBeenCalled();
  });

  it('최신 초안이면 그 표시가 없다', async () => {
    render(<PlanDraftReview todayIso="2026-09-19" draft={{ ...DRAFT, freshness: { state: 'CURRENT', reasons: [] } }} onRemake={vi.fn()} />);
    await screen.findByRole('region', { name: '초안 요약' });
    expect(screen.queryByText('이전 버전 · 최신 답변 반영 전')).not.toBeInTheDocument();
  });

  it('다시 만드는 동안에는 이전 버전을 그대로 보여 주고 적용을 막는다', async () => {
    render(<PlanDraftReview todayIso="2026-09-19" draft={DRAFT} stale remaking remakeStageLabel="계획 정리 중" onRemake={vi.fn()} />);

    expect(await screen.findByText(/새 초안을 만드는 중이에요 — 계획 정리 중. 아래는 이전 버전이에요/)).toBeInTheDocument();
    expect(screen.getByText('연결 리스트 구현')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '적용' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: '다시 만들기' })).not.toBeInTheDocument();
  });

  it('다시 만든 뒤에는 무엇이 바뀌었나·옮겨 온 편집·부딪친 편집(기본은 내 값)을 보여 준다', async () => {
    const outcome = {
      changes: [{ what: '과제 2번을 앞으로 옮겼어요', why: '금요일 마감' }],
      carriedEdits: [{ title: '연결 리스트 구현', fields: ['expectedMinutes'] }],
      editConflicts: [{ title: '복잡도 연습', field: 'expectedMinutes', yours: 20, suggested: 40 }],
    };
    const user = userEvent.setup();
    render(<PlanDraftReview todayIso="2026-09-19" draft={DRAFT} outcome={outcome} />);

    expect(await screen.findByText('무엇이 바뀌었나')).toBeInTheDocument();
    expect(screen.getByText(/과제 2번을 앞으로 옮겼어요 — 금요일 마감/)).toBeInTheDocument();
    expect(screen.getByText(/직접 고친 값은 새 초안에 그대로 옮겼어요/)).toBeInTheDocument();
    expect(screen.getByText(/연결 리스트 구현 \(예상 시간\)/)).toBeInTheDocument();

    const yours = screen.getByRole('radio', { name: /내 값 유지: 20/ });
    expect(yours).toBeChecked();
    // 새 제안을 고르면 그 항목의 시간이 그 값이 된다(합계가 바뀌지 않는다 — 원래 값과 같으므로 편집이 아니다).
    await user.click(screen.getByRole('radio', { name: /새 제안으로: 40/ }));
    expect(screen.getByText('고른 항목 3개 · 합계 2h 10m')).toBeInTheDocument();
    await user.click(yours);
    expect(await screen.findByText('고른 항목 3개 · 합계 1h 50m')).toBeInTheDocument();
  });
});

describe('항목 카드', () => {
  it('학습 목표는 서버가 정한 근거와 함께 보이고, 목차에서 추론한 목표는 그렇다고 말한다', async () => {
    const draft = {
      ...DRAFT,
      proposal: {
        proposalId: 77,
        items: [
          {
            proposalItemId: 11, title: 'have to 예약 문장 말하기', expectedMinutes: 20, courseId: 9, priority: 'SHOULD',
            evidence: { origin: 'AI_PRACTICE' }, learningGoal: 'have to로 해야 할 일 말하기', learningGoalBasis: 'TOC_AI',
          },
          {
            proposalItemId: 12, title: '주말 질문', expectedMinutes: 20, courseId: 9, priority: 'SHOULD',
            learningGoal: '과거시제로 주말 질문하기', learningGoalBasis: 'USER',
          },
          { proposalItemId: 13, title: '목표 없는 항목', expectedMinutes: 20, courseId: 9, priority: 'SHOULD' },
        ],
      },
    };
    render(<PlanDraftReview draft={draft} todayIso="2026-09-19" projectTitles={{ 9: '영어회화' }} />);
    await screen.findByRole('region', { name: '초안 요약' });

    const first = screen.getByText('have to 예약 문장 말하기').closest('li');
    expect(within(first).getByText('have to로 해야 할 일 말하기')).toBeInTheDocument();
    const basis = within(first).getByText('목차에서 추론');
    expect(basis).toHaveAttribute('title', expect.stringContaining('단원 제목만 보고 추론했어요'));
    expect(within(first).getByText('AI가 만든 연습')).toBeInTheDocument();
    expect(within(first).getByText(/교재 문제가 아니에요/)).toBeInTheDocument();

    const second = screen.getByText('주말 질문').closest('li');
    expect(within(second).getByText('내가 정한 목표')).toBeInTheDocument();

    const third = screen.getByText('목표 없는 항목').closest('li');
    expect(within(third).queryByText('목표')).not.toBeInTheDocument();
    expect(screen.queryByText(/TOC_AI|USER/)).not.toBeInTheDocument();
  });

  it('출처 라벨·위치 안내·꼭 하는 이유·마감 출처를 따로 말하고, 마감이 없으면 미확인이라고 한다', async () => {
    render(<PlanDraftReview draft={DRAFT} todayIso="2026-09-19" projectTitles={{ 6: '자료구조' }} />);
    await screen.findByRole('region', { name: '초안 요약' });

    const first = screen.getByText('연결 리스트 구현').closest('li');
    expect(within(first).getByText('자료에 있는 과제·실습')).toBeInTheDocument();
    expect(within(first).getByText('이 위치를 열어서 확인해 주세요')).toBeInTheDocument();
    expect(within(first).getByText('p.3~4')).toBeInTheDocument();
    expect(within(first).getByText('꼭 하는 이유')).toBeInTheDocument();
    expect(within(first).getByText('화요일 실습에서 바로 써요')).toBeInTheDocument();
    expect(within(first).getByText(/화요일 수업 전 \(9\/22 14:00\) · 수업 시각/)).toBeInTheDocument();

    const second = screen.getByText('복잡도 연습').closest('li');
    expect(within(second).getByText('AI가 만든 연습')).toBeInTheDocument();
    expect(within(second).getByText(/9\/24 23:59까지 · AI가 제안한 목표 시각 — 실제 마감 아님/)).toBeInTheDocument();

    const third = screen.getByText('발표 준비').closest('li');
    expect(within(third).getByText('내가 요청한 준비 작업')).toBeInTheDocument();
    expect(within(third).getByText('마감 미확인')).toBeInTheDocument();
    // 이유 없는 「꼭」을 그냥 두지 않는다.
    expect(within(third).getByText(/이유가 기록되지 않았어요/)).toBeInTheDocument();
  });

  it('예상 시간을 고치면 합계가 바뀌고, 확정할 때 고친 분량이 실린다', async () => {
    planAPI.confirm.mockResolvedValue({ planVersionId: 5 });
    const user = userEvent.setup();
    render(<PlanDraftReview draft={DRAFT} todayIso="2026-09-19" />);
    await screen.findByRole('region', { name: '초안 요약' });

    const first = screen.getByText('연결 리스트 구현').closest('li');
    await user.click(within(first).getByRole('button', { name: '시간 고치기' }));
    const input = within(first).getByRole('spinbutton', { name: '연결 리스트 구현 예상 시간(분)' });
    await user.clear(input);
    await user.type(input, '30');

    expect(await screen.findByText('고른 항목 3개 · 합계 1h 40m')).toBeInTheDocument();
    expect(within(first).getByText(/시간을 직접 고침/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '계획 확정' }));
    await waitFor(() => expect(planAPI.confirm).toHaveBeenCalled());
    expect(planAPI.confirm.mock.calls[0][1].editedItems).toEqual([{ proposalItemId: 1, expectedMinutes: 30 }]);
  });
});
