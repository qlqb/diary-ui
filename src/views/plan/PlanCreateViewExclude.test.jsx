import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlanCreateView from './PlanCreateView.jsx';
import { planAPI, schedulePreviewAPI, topicAPI } from '../../api/api.js';

vi.mock('../../api/api.js', () => ({
  planAPI: {
    createDraft: vi.fn(), redraft: vi.fn(), confirm: vi.fn(), findCoveringDate: vi.fn(), regenerateItems: vi.fn(),
    draftProvenance: vi.fn(), draftItemDetail: vi.fn(), createDraftItemDetail: vi.fn(),
  },
  schedulePreviewAPI: { get: vi.fn(), recompute: vi.fn() },
  topicAPI: { updateUserMark: vi.fn() },
  materialStoreAPI: { file: vi.fn() },
}));

/**
 * 「이번만 빼기」·되돌리기·「이미 알아요」 뒤 재생성(15번 문서 §7, T12~T17).
 *
 * 증명하려는 것: (1) 재생성은 계획 화면이든 상담 초안이든 서버의 [같은 조건으로 다시 만들기]로 가고, 화면은 바뀐 제외
 * 목록만 보낸다 — 기간·범위·지시를 다시 조립하지 않는다. (2) 제외 목록은 같은 작성 흐름에서만 이어지고 새 기간에서는
 * 넘어가지 않는다. (3) 실패·늦은 응답에도 지금 초안과 화면이 모순되지 않는다.
 */
function item(proposalItemId, topicId, title) {
  return {
    proposalItemId, topicId, courseId: 6, title, expectedMinutes: 30, priority: 'SHOULD', actionType: 'READ',
    doneCriteria: null, doneCriteriaSource: 'DEFAULT', sourceLocator: null, deadlineAt: null, reason: null,
    placementType: 'UNSCHEDULED', targetDate: null,
  };
}

function draft(proposalId, items, { excluded = [], source = 'PLAN_SCREEN' } = {}) {
  return {
    proposalId, startDate: '2026-09-14', endDate: '2026-09-20', days: 7, intensity: 'NORMAL',
    targetMinutes: 600, estimatedAvailableMinutes: 900, noAvailableTime: false,
    suggestedTitle: '이번 주 계획', strategy: null,
    proposal: { proposalId, items },
    requestContext: { source, courseIds: [6], excludedTopics: excluded, requestedMaterials: [], redraftable: true },
  };
}

const ADT = item(1, 101, '자료구조 · ADT와 복잡도');
const LIST = item(2, 102, '자료구조 · 연결 리스트');
const FULL = draft(77, [ADT, LIST]);
const PROJECT_TITLES = { 6: '자료구조' };

function buttonIn(titleText, name) {
  return within(screen.getByText(titleText).closest('li')).getByRole('button', { name });
}

async function openDraft(first = FULL) {
  planAPI.createDraft.mockResolvedValueOnce(first);
  render(<PlanCreateView projectTitles={PROJECT_TITLES} />);
  await userEvent.click(await screen.findByRole('button', { name: /초안 만들기/ }));
  await screen.findByText(first.proposal.items[0].title);
}

beforeEach(() => {
  // 앞 테스트가 남긴 "한 번만" 응답이 다음 테스트에 새지 않게 구현까지 지운다.
  vi.resetAllMocks();
  planAPI.findCoveringDate.mockResolvedValue([]);
  planAPI.draftProvenance.mockResolvedValue({ items: [], providedSources: [] });
  schedulePreviewAPI.get.mockResolvedValue(null);
  schedulePreviewAPI.recompute.mockResolvedValue({ placedItems: [], unplacedItems: [] });
});

describe('T12 빼기 → 재생성 → 하나 복원 / 모두 복원', () => {
  it('빼기는 제외 목록만 서버에 보내 같은 조건으로 다시 만들고, 되돌리기는 그 항목을 뺀 목록으로 다시 만든다', async () => {
    await openDraft();
    planAPI.redraft
      .mockResolvedValueOnce(draft(78, [LIST], { excluded: [{ topicId: 101, title: 'ADT와 복잡도' }] }))
      .mockResolvedValueOnce(draft(79, [ADT, LIST]));

    await userEvent.click(buttonIn('자료구조 · ADT와 복잡도', '이번만 빼기'));

    await waitFor(() => expect(planAPI.redraft).toHaveBeenCalledWith(77, { excludeTopicIds: [101] }));
    expect(planAPI.createDraft).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/이번 계획에서만 뺐어요/)).toBeInTheDocument();
    expect(screen.getByText(/이번 계획에서만 뺀 항목: ADT와 복잡도/)).toBeInTheDocument();
    expect(screen.queryByText('자료구조 · ADT와 복잡도')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '되돌리기' }));

    await waitFor(() => expect(planAPI.redraft).toHaveBeenLastCalledWith(78, { excludeTopicIds: [] }));
    expect(await screen.findByText('자료구조 · ADT와 복잡도')).toBeInTheDocument();
    expect(screen.queryByText(/이번 계획에서만 뺀 항목/)).not.toBeInTheDocument();
    // 되돌리기는 후보 자격을 돌려줄 뿐 — 모델이 다시 고른다는 약속을 하지 않는다.
    expect(screen.getByText(/계획에 들어갈지는 AI가 다시 판단해요/)).toBeInTheDocument();
  });

  it('두 개를 뺀 초안에서 「모두 되돌리기」는 빈 제외 목록으로 다시 만든다', async () => {
    await openDraft(draft(80, [item(9, 103, '자료구조 · 스택')],
      { excluded: [{ topicId: 101, title: 'ADT와 복잡도' }, { topicId: 102, title: '연결 리스트' }] }));
    planAPI.redraft.mockResolvedValueOnce(FULL);

    await userEvent.click(screen.getByRole('button', { name: '모두 되돌리기' }));

    await waitFor(() => expect(planAPI.redraft).toHaveBeenCalledWith(80, { excludeTopicIds: [] }));
    expect(await screen.findByText('자료구조 · ADT와 복잡도')).toBeInTheDocument();
  });
});

describe('T13·T14 제외 목록의 범위', () => {
  it('T13 같은 화면에서 기간을 바꾸면 이전 제외 목록을 새 초안 요청에 싣지 않는다', async () => {
    await openDraft();
    planAPI.redraft.mockResolvedValueOnce(draft(78, [LIST], { excluded: [{ topicId: 101, title: 'ADT와 복잡도' }] }));
    await userEvent.click(buttonIn('자료구조 · ADT와 복잡도', '이번만 빼기'));
    await screen.findByText(/이번 계획에서만 뺀 항목/);

    // 기간을 다른 프리셋으로 바꾼다 → 초안이 비고, 새로 만든다.
    const presets = screen.getAllByRole('button').filter((b) => b.className.includes('chip') && !b.className.includes('is-active'));
    await userEvent.click(presets[0]);
    planAPI.createDraft.mockResolvedValueOnce(FULL);
    await userEvent.click(await screen.findByRole('button', { name: /초안 만들기/ }));

    await waitFor(() => expect(planAPI.createDraft).toHaveBeenCalledTimes(2));
    expect(planAPI.createDraft.mock.calls[1][0].excludeTopicIds).toBeNull();
  });

  it('T14 같은 흐름에서 [다시 만들기]로 초안을 비우고 다시 만들면 제외 목록을 이어 싣는다', async () => {
    await openDraft();
    planAPI.redraft.mockResolvedValueOnce(draft(78, [LIST], { excluded: [{ topicId: 101, title: 'ADT와 복잡도' }] }));
    await userEvent.click(buttonIn('자료구조 · ADT와 복잡도', '이번만 빼기'));
    await screen.findByText(/이번 계획에서만 뺀 항목/);

    await userEvent.click(screen.getByRole('button', { name: '다시 만들기' }));
    planAPI.createDraft.mockResolvedValueOnce(draft(81, [LIST], { excluded: [{ topicId: 101, title: 'ADT와 복잡도' }] }));
    await userEvent.click(await screen.findByRole('button', { name: /초안 만들기/ }));

    await waitFor(() => expect(planAPI.createDraft).toHaveBeenCalledTimes(2));
    expect(planAPI.createDraft.mock.calls[1][0].excludeTopicIds).toEqual([101]);
  });
});

describe('T15 상담 초안', () => {
  const CONVERSATION = draft(90, [ADT, LIST], { source: 'CONVERSATION' });

  it('화면에 남아 있던 다른 프로젝트 범위가 아니라 상담 초안의 범위로 제목을 보인다', async () => {
    render(<PlanCreateView projectTitles={{ ...PROJECT_TITLES, 7: '네트워크' }} scopeCourseId={7}
      initialDraft={CONVERSATION} />);
    await screen.findByText('자료구조 · 연결 리스트');

    expect(screen.getByRole('heading', { name: /자료구조 계획 만들기/ })).toBeInTheDocument();
    expect(screen.queryByText(/네트워크 항목만 제안받아요/)).not.toBeInTheDocument();
  });

  it('빼기·이미 알아요·되돌리기가 상담 초안에서도 같은 의미로 동작하고, 화면이 기간·지시를 다시 조립하지 않는다', async () => {
    topicAPI.updateUserMark.mockResolvedValue({});
    planAPI.redraft
      .mockResolvedValueOnce(draft(91, [LIST], { source: 'CONVERSATION', excluded: [{ topicId: 101, title: 'ADT와 복잡도' }] }))
      .mockResolvedValueOnce(draft(92, [], { source: 'CONVERSATION', excluded: [{ topicId: 101, title: 'ADT와 복잡도' }] }))
      .mockResolvedValueOnce(draft(93, [LIST], { source: 'CONVERSATION', excluded: [{ topicId: 101, title: 'ADT와 복잡도' }] }));
    render(<PlanCreateView projectTitles={PROJECT_TITLES} initialDraft={CONVERSATION} />);
    await screen.findByText('자료구조 · 연결 리스트');
    expect(screen.getByText(/AI 대화에서 만든 기간 계획이에요/)).toBeInTheDocument();

    await userEvent.click(buttonIn('자료구조 · ADT와 복잡도', '이번만 빼기'));
    await waitFor(() => expect(planAPI.redraft).toHaveBeenCalledWith(90, { excludeTopicIds: [101] }));

    await userEvent.click(await screen.findByRole('button', { name: '이미 알아요' }));
    await waitFor(() => expect(topicAPI.updateUserMark).toHaveBeenCalledWith(102, 'KNOWN'));
    await waitFor(() => expect(planAPI.redraft).toHaveBeenCalledWith(91, {}));
    // 다시 만든 뒤에도 상담 초안이다 — 화면의 기간 입력으로 바뀌지 않는다.
    expect(screen.getByText(/AI 대화에서 만든 기간 계획이에요/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '되돌리기' }));
    await waitFor(() => expect(topicAPI.updateUserMark).toHaveBeenLastCalledWith(102, null));
    await waitFor(() => expect(planAPI.redraft).toHaveBeenLastCalledWith(92, {}));
    expect(await screen.findByText('자료구조 · 연결 리스트')).toBeInTheDocument();
    expect(planAPI.createDraft).not.toHaveBeenCalled();
  });
});

describe('T16 실패와 응답 순서 역전', () => {
  it('다시 만들기가 실패하면 지금 초안과 제외 목록을 그대로 두고 알린다', async () => {
    await openDraft();
    planAPI.redraft.mockRejectedValueOnce(new Error('계획에 쓸 자료를 고르지 못했습니다. 잠시 뒤 다시 시도해 주세요'));

    await userEvent.click(buttonIn('자료구조 · ADT와 복잡도', '이번만 빼기'));

    expect(await screen.findByRole('alert')).toHaveTextContent('자료를 고르지 못했습니다');
    expect(screen.getByText('자료구조 · ADT와 복잡도')).toBeInTheDocument();
    expect(screen.queryByText(/이번 계획에서만 뺀 항목/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '계획 확정' })).toBeEnabled();
  });

  it('「이미 알아요」 뒤 다시 만들기가 실패하면 옛 초안을 확정하지 못하게 막고, 다시 만들면 풀린다', async () => {
    await openDraft();
    topicAPI.updateUserMark.mockResolvedValue({});
    planAPI.redraft.mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(draft(78, [LIST]));

    await userEvent.click(buttonIn('자료구조 · ADT와 복잡도', '이미 알아요'));

    expect(await screen.findByText(/표시는 저장했지만 초안에 아직 반영하지 못했어요/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '계획 확정' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: '초안 다시 만들기' }));
    await waitFor(() => expect(planAPI.redraft).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole('button', { name: '계획 확정' })).toBeEnabled());
    expect(screen.queryByText(/초안에 아직 반영하지 못했어요/)).not.toBeInTheDocument();
  });

  it('다시 만드는 사이 기간을 바꾸면 늦게 온 응답이 새 화면을 덮지 않는다', async () => {
    await openDraft();
    let resolveLate;
    planAPI.redraft.mockImplementationOnce(() => new Promise((r) => { resolveLate = r; }));

    await userEvent.click(buttonIn('자료구조 · ADT와 복잡도', '이번만 빼기'));
    await waitFor(() => expect(planAPI.redraft).toHaveBeenCalled());
    const presets = screen.getAllByRole('button').filter((b) => b.className.includes('chip') && !b.className.includes('is-active'));
    await userEvent.click(presets[0]);
    expect(screen.queryByText('자료구조 · ADT와 복잡도')).not.toBeInTheDocument();

    resolveLate(draft(78, [LIST], { excluded: [{ topicId: 101, title: 'ADT와 복잡도' }] }));
    await new Promise((r) => setTimeout(r, 20));

    expect(screen.queryByText('자료구조 · 연결 리스트')).not.toBeInTheDocument();
    expect(screen.queryByText(/이번 계획에서만 뺀 항목/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /초안 만들기/ })).toBeInTheDocument();
  });
});

describe('T17 이미 알아요 되돌리기', () => {
  it('표식을 지우고 같은 조건으로 다시 만들어 현재 계획에 반영한다', async () => {
    await openDraft();
    topicAPI.updateUserMark.mockResolvedValue({});
    planAPI.redraft.mockResolvedValueOnce(draft(78, [LIST])).mockResolvedValueOnce(draft(79, [ADT, LIST]));

    await userEvent.click(buttonIn('자료구조 · ADT와 복잡도', '이미 알아요'));
    await waitFor(() => expect(planAPI.redraft).toHaveBeenCalledWith(77, {}));
    expect(await screen.findByText(/다음 계획부터도 이 내용은 건너뛸게요/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '되돌리기' }));

    await waitFor(() => expect(topicAPI.updateUserMark).toHaveBeenLastCalledWith(101, null));
    await waitFor(() => expect(planAPI.redraft).toHaveBeenLastCalledWith(78, {}));
    expect(await screen.findByText('자료구조 · ADT와 복잡도')).toBeInTheDocument();
  });
});

describe('구간만 인용한 항목의 학습 항목 찾기', () => {
  it('TOPIC 인용이 없어도 구간의 parentSourceId로 학습 항목을 찾아 「이번만 빼기」를 붙인다', async () => {
    const noTopic = draft(95, [item(5, null, '자료구조 · 연결 리스트 삭제 실습')]);
    planAPI.draftProvenance.mockResolvedValue({
      items: [{ proposalItemId: 5, refIds: ['s7'] }],
      providedSources: [
        { refId: 's2', sourceType: 'TOPIC', sourceId: 102, promptLine: '- 연결 리스트 [s2]' },
        { refId: 's7', sourceType: 'MATERIAL_SECTION', sourceId: 40, parentSourceId: 102, promptLine: '· [문제] 삭제 실습 (p.36) [s7]' },
      ],
    });
    planAPI.redraft.mockResolvedValueOnce(draft(96, []));
    await openDraft(noTopic);

    await userEvent.click(await within(screen.getByText('자료구조 · 연결 리스트 삭제 실습').closest('li'))
      .findByRole('button', { name: '이번만 빼기' }));

    await waitFor(() => expect(planAPI.redraft).toHaveBeenCalledWith(95, { excludeTopicIds: [102] }));
  });
});

describe('자료 지정', () => {
  it('자료함에서 지정한 자료를 새 초안 요청에 싣고, 이름이 모호하면 고른 자료로 다시 만든다', async () => {
    const withAmbiguity = {
      ...draft(97, [ADT]),
      materialSelection: {
        status: 'SELECTED', mode: 'FULL', selectionCalls: 1, expanded: false, candidateTotal: 3, candidateShown: 3,
        sections: [{ sectionId: 1, materialId: 30, title: '재귀 추적', locator: 'p.7', filename: '3주차.pdf',
          reason: '지정한 자료의 예제', outcome: 'FULL', retrievedRange: 'p.7 원문 전체(320자)' }],
        topics: [], unreviewed: [], insufficientEvidence: false, note: null, unknownIds: 0,
        requestedMaterials: [{ materialId: 30, filename: '3주차.pdf', source: 'EXPLICIT' }],
        ambiguities: [{ mention: '과제 안내.pdf', candidates: [
          { materialId: 41, filename: '과제 안내.pdf', courseId: 6, source: 'CANDIDATE' },
          { materialId: 42, filename: '과제 안내.pdf', courseId: 7, source: 'CANDIDATE' }] }],
      },
    };
    withAmbiguity.requestContext.requestedMaterials = [{ materialId: 30, filename: '3주차.pdf', source: 'EXPLICIT' }];
    planAPI.createDraft.mockResolvedValueOnce(withAmbiguity);
    planAPI.redraft.mockResolvedValueOnce(draft(98, [ADT]));
    render(<PlanCreateView projectTitles={PROJECT_TITLES}
      requestedMaterials={[{ materialId: 30, filename: '3주차.pdf' }]} />);

    expect(screen.getByText(/이번 계획은 이 자료 중심으로 봐요/)).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: /초안 만들기/ }));
    await waitFor(() => expect(planAPI.createDraft.mock.calls[0][0].requestedMaterialIds).toEqual([30]));

    expect(await screen.findByText(/AI가 이번 계획을 위해 고른 자료 1개/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /AI가 이번 계획을 위해 고른 자료/ }));
    expect(screen.getByText(/p.7 원문 전체/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /과제 안내.pdf \(자료 42\)/ }));
    await waitFor(() => expect(planAPI.redraft).toHaveBeenCalledWith(97, { requestedMaterialIds: [30, 42] }));
  });
});
