import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlanCreateView from './PlanCreateView.jsx';
import { planAPI, schedulePreviewAPI, topicAPI } from '../../api/api.js';

vi.mock('../../api/api.js', () => ({
  planAPI: {
    createDraft: vi.fn(), confirm: vi.fn(), findCoveringDate: vi.fn(), regenerateItems: vi.fn(),
    draftProvenance: vi.fn(), draftItemDetail: vi.fn(), createDraftItemDetail: vi.fn(),
  },
  schedulePreviewAPI: { get: vi.fn(), recompute: vi.fn() },
  topicAPI: { updateUserMark: vi.fn() },
}));

/**
 * 기본 AI 경로(판단 없음)에서 「이번만 빼기」와 「이미 알아요」의 되돌리기가 실제로 되돌리는지 본다.
 *
 * 증명하려는 것: (1) 되돌리기는 목록만 지우는 것이 아니라 초안을 다시 요청한다 — 그래야 화면의 초안에
 * 그 항목이 돌아온다. (2) 되돌리기 버튼은 새 초안이 도착한 뒤에도 남아 있다 — 검토 컴포넌트가
 * 초안마다 새로 만들어져도 안내는 호출부가 들고 있다. (3) 「이미 알아요」 되돌리기는 표식을 지우고 다시 요청한다.
 */
function item(proposalItemId, topicId, courseId, title) {
  return {
    proposalItemId, topicId, courseId, title, expectedMinutes: 30, priority: 'SHOULD', actionType: 'READ',
    doneCriteria: null, doneCriteriaSource: 'DEFAULT', sourceLocator: null, deadlineAt: null, reason: null,
    placementType: 'UNSCHEDULED', targetDate: null,
  };
}

function draft(proposalId, items) {
  return {
    proposalId, startDate: '2026-09-14', endDate: '2026-09-20', days: 7, intensity: 'NORMAL',
    targetMinutes: 600, estimatedAvailableMinutes: 900, noAvailableTime: false,
    suggestedTitle: '이번 주 계획', strategy: null,
    proposal: { proposalId, items },
  };
}

const FULL = draft(77, [item(1, 101, 6, '자료구조 · ADT와 복잡도'), item(2, 102, 6, '자료구조 · 연결 리스트')]);
const WITHOUT_101 = draft(78, [item(3, 102, 6, '자료구조 · 연결 리스트')]);
const PROJECT_TITLES = { 6: '자료구조' };

function buttonIn(titleText, name) {
  return within(screen.getByText(titleText).closest('li')).getByRole('button', { name });
}

async function openDraft() {
  planAPI.createDraft.mockResolvedValueOnce(FULL);
  render(<PlanCreateView projectTitles={PROJECT_TITLES} />);
  await userEvent.click(await screen.findByRole('button', { name: /초안 만들기/ }));
  await screen.findByText('자료구조 · ADT와 복잡도');
}

beforeEach(() => {
  vi.clearAllMocks();
  planAPI.findCoveringDate.mockResolvedValue([]);
  planAPI.draftProvenance.mockResolvedValue({ items: [], providedSources: [] });
  schedulePreviewAPI.get.mockResolvedValue(null);
  schedulePreviewAPI.recompute.mockResolvedValue({ placedItems: [], unplacedItems: [] });
});

describe('구간만 인용한 항목의 학습 항목 찾기', () => {
  it('TOPIC 인용이 없어도 구간의 parentSourceId로 학습 항목을 찾아 「이번만 빼기」를 붙인다', async () => {
    const noTopic = draft(90, [item(5, null, 6, '자료구조 · 연결 리스트 삭제 실습')]);
    planAPI.createDraft.mockResolvedValueOnce(noTopic).mockResolvedValueOnce(draft(91, []));
    planAPI.draftProvenance.mockResolvedValue({
      items: [{ proposalItemId: 5, refIds: ['s7'] }],
      providedSources: [
        { refId: 's2', sourceType: 'TOPIC', sourceId: 102, promptLine: '- 연결 리스트 [s2]' },
        { refId: 's7', sourceType: 'MATERIAL_SECTION', sourceId: 40, parentSourceId: 102, promptLine: '· [문제] 삭제 실습 (p.36) [s7]' },
      ],
    });
    render(<PlanCreateView projectTitles={PROJECT_TITLES} />);
    await userEvent.click(await screen.findByRole('button', { name: /초안 만들기/ }));
    await screen.findByText('자료구조 · 연결 리스트 삭제 실습');

    await userEvent.click(await within(screen.getByText('자료구조 · 연결 리스트 삭제 실습').closest('li'))
      .findByRole('button', { name: '이번만 빼기' }));

    await waitFor(() => expect(planAPI.createDraft).toHaveBeenCalledTimes(2));
    expect(planAPI.createDraft.mock.calls[1][0].excludeTopicIds).toEqual([102]);
  });
});

describe('이번만 빼기와 되돌리기 (기본 AI 경로)', () => {
  it('빼면 그 항목만 excludeTopicIds에 실어 다시 요청하고, 되돌리기는 그 항목을 빼고 다시 요청한다', async () => {
    await openDraft();
    planAPI.createDraft.mockResolvedValueOnce(WITHOUT_101).mockResolvedValueOnce(FULL);

    await userEvent.click(buttonIn('자료구조 · ADT와 복잡도', '이번만 빼기'));

    await waitFor(() => expect(planAPI.createDraft).toHaveBeenCalledTimes(2));
    expect(planAPI.createDraft.mock.calls[1][0].excludeTopicIds).toEqual([101]);
    expect(await screen.findByText(/「자료구조 · ADT와 복잡도」은\(는\) 이번 계획에서만 뺐어요/)).toBeInTheDocument();
    // 새 초안(다른 proposalId)이 온 뒤에도 되돌리기가 남아 있다.
    expect(screen.queryByText('자료구조 · ADT와 복잡도')).not.toBeInTheDocument();
    expect(screen.getByText(/이번 계획에서만 뺀 항목: 자료구조 · ADT와 복잡도/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '되돌리기' }));

    await waitFor(() => expect(planAPI.createDraft).toHaveBeenCalledTimes(3));
    expect(planAPI.createDraft.mock.calls[2][0].excludeTopicIds).toBeNull();
    expect(await screen.findByText('자료구조 · ADT와 복잡도')).toBeInTheDocument();
    expect(screen.queryByText(/이번 계획에서만 뺀 항목/)).not.toBeInTheDocument();
  });

  it('두 개를 빼고 「모두 되돌리기」를 누르면 제외 없이 다시 요청한다', async () => {
    await openDraft();
    planAPI.createDraft
      .mockResolvedValueOnce(WITHOUT_101)
      .mockResolvedValueOnce(draft(79, []))
      .mockResolvedValueOnce(FULL);

    await userEvent.click(buttonIn('자료구조 · ADT와 복잡도', '이번만 빼기'));
    await screen.findByText(/이번 계획에서만 뺀 항목: 자료구조 · ADT와 복잡도/);
    await userEvent.click(buttonIn('자료구조 · 연결 리스트', '이번만 빼기'));
    await waitFor(() => expect(planAPI.createDraft).toHaveBeenCalledTimes(3));
    expect(planAPI.createDraft.mock.calls[2][0].excludeTopicIds).toEqual([101, 102]);

    await userEvent.click(screen.getByRole('button', { name: '모두 되돌리기' }));

    await waitFor(() => expect(planAPI.createDraft).toHaveBeenCalledTimes(4));
    expect(planAPI.createDraft.mock.calls[3][0].excludeTopicIds).toBeNull();
    expect(await screen.findByText('자료구조 · ADT와 복잡도')).toBeInTheDocument();
  });

  it('「이미 알아요」의 되돌리기는 새 초안이 온 뒤에도 남아 있고, 표식을 지운 뒤 다시 요청한다', async () => {
    await openDraft();
    topicAPI.updateUserMark.mockResolvedValue({});
    planAPI.createDraft.mockResolvedValueOnce(WITHOUT_101).mockResolvedValueOnce(FULL);

    await userEvent.click(buttonIn('자료구조 · ADT와 복잡도', '이미 알아요'));

    await waitFor(() => expect(topicAPI.updateUserMark).toHaveBeenCalledWith(101, 'KNOWN'));
    await waitFor(() => expect(planAPI.createDraft).toHaveBeenCalledTimes(2));
    // 초안이 바뀌어 검토 컴포넌트가 새로 만들어진 뒤에도 안내와 되돌리기가 있다.
    expect(screen.queryByText('자료구조 · ADT와 복잡도')).not.toBeInTheDocument();
    expect(screen.getByText(/다음 계획부터도 이 내용은 건너뛸게요/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '되돌리기' }));

    await waitFor(() => expect(topicAPI.updateUserMark).toHaveBeenLastCalledWith(101, null));
    await waitFor(() => expect(planAPI.createDraft).toHaveBeenCalledTimes(3));
    expect(await screen.findByText('자료구조 · ADT와 복잡도')).toBeInTheDocument();
  });

  it('「이미 알아요」 뒤에 하나를 더 빼도, 되돌리기의 재요청은 그 사이 늘어난 제외 목록을 그대로 싣는다', async () => {
    await openDraft();
    topicAPI.updateUserMark.mockResolvedValue({});
    planAPI.createDraft
      .mockResolvedValueOnce(WITHOUT_101)
      .mockResolvedValueOnce(draft(80, []))
      .mockResolvedValueOnce(draft(81, [item(9, 101, 6, '자료구조 · ADT와 복잡도')]));

    await userEvent.click(buttonIn('자료구조 · ADT와 복잡도', '이미 알아요'));
    await waitFor(() => expect(planAPI.createDraft).toHaveBeenCalledTimes(2));
    await userEvent.click(buttonIn('자료구조 · 연결 리스트', '이번만 빼기'));
    await waitFor(() => expect(planAPI.createDraft).toHaveBeenCalledTimes(3));
    expect(planAPI.createDraft.mock.calls[2][0].excludeTopicIds).toEqual([102]);

    // 마지막 안내는 「이번만 빼기」의 것이다. 그 되돌리기는 102만 되살린다.
    await userEvent.click(screen.getByRole('button', { name: '되돌리기' }));
    await waitFor(() => expect(planAPI.createDraft).toHaveBeenCalledTimes(4));
    expect(planAPI.createDraft.mock.calls[3][0].excludeTopicIds).toBeNull();
    expect(topicAPI.updateUserMark).toHaveBeenCalledTimes(1);
  });
});
