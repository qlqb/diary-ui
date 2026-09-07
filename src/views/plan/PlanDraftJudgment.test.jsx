import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlanCreateView from './PlanCreateView.jsx';
import { planAPI, schedulePreviewAPI, topicAPI } from '../../api/api.js';

vi.mock('../../api/api.js', () => ({
  planAPI: {
    createDraft: vi.fn(), confirm: vi.fn(), findCoveringDate: vi.fn(), regenerateItems: vi.fn(),
  },
  routineAPI: { pendingLeadMinutes: vi.fn().mockResolvedValue([]), updateLeadMinutes: vi.fn() },
  schedulePreviewAPI: { get: vi.fn(), recompute: vi.fn() },
  topicAPI: { updateUserMark: vi.fn() },
}));

/**
 * 판단 근거와 익숙함 표식이 화면에서 실제로 도는지 본다.
 *
 * 여기서 증명하려는 것은 <b>세 동작이 서로 다르다</b>는 점이다. 「이미 알아요」는 사실을
 * 저장하고, 「제외」는 이번 초안에서만 빼고, 「실행 방법 다시 제안」은 판단을 건드리지
 * 않는다. 셋이 같은 일을 하면 사용자는 무엇을 눌러야 할지 알 수 없다.
 */
const STRATEGY = {
  goal: '다음 주 수업을 알아들을 정도로 따라잡기',
  strategySummary: '수업 전에 필요한 것만 고른다',
  courses: [
    { courseId: 6, rank: 1, focus: '화요일 수업 전까지', reason: '가장 빠른 수업' },
    { courseId: 7, rank: 2, focus: '목요일 수업 전까지', reason: '그 다음' },
  ],
  topics: [
    { topicId: 101, topicTitle: 'ADT와 복잡도', treatment: 'FULL', reason: '아직 시작하지 않았어요', adjustedBy: null },
    { topicId: 102, topicTitle: '파이썬 기초', treatment: 'SKIM', reason: '익숙하다고 확인된 내용이에요', adjustedBy: null },
    { topicId: 103, topicTitle: '엑셀 읽고 쓰기', treatment: 'SKIP', reason: '이미 알고 있다고 표시했어요', adjustedBy: 'SERVER' },
  ],
};

const DRAFT = {
  proposalId: 77,
  startDate: '2026-09-07',
  endDate: '2026-09-13',
  days: 7,
  intensity: 'NORMAL',
  targetMinutes: 600,
  estimatedAvailableMinutes: 900,
  noAvailableTime: false,
  suggestedTitle: '이번 주 계획',
  strategy: STRATEGY,
  proposal: {
    proposalId: 77,
    items: [
      {
        proposalItemId: 1, topicId: 101, courseId: 6, title: '자료구조 · ADT와 복잡도',
        expectedMinutes: 45, priority: 'MUST', actionType: 'PRACTICE',
        doneCriteria: '코드 5개의 시간복잡도를 자료 없이 판별', doneCriteriaSource: 'MODEL',
        sourceLocator: '2주차', deadlineAt: '2026-09-08T14:00:00', reason: '화요일 수업 전에 필요해요',
        placementType: 'UNSCHEDULED', targetDate: null,
      },
      {
        proposalItemId: 2, topicId: 102, courseId: 7, title: '빅데이터 · 파이썬 기초',
        expectedMinutes: 30, priority: 'SHOULD', actionType: 'READ',
        doneCriteria: '자료를 덮고 파이썬 기초의 핵심을 말로 설명한다', doneCriteriaSource: 'DEFAULT',
        sourceLocator: '2주차', deadlineAt: null, reason: null,
        placementType: 'UNSCHEDULED', targetDate: null,
      },
    ],
  },
};

const ASK_DRAFT = {
  startDate: '2026-09-07', endDate: '2026-09-13', days: 7, intensity: 'NORMAL',
  noAvailableTime: false,
  ask: {
    reason: 'UNKNOWN_FAMILIARITY',
    question: '빅데이터분석의 파이썬 기초, 변수와 연산자는 이번에 처음 보는 내용일까요?',
    options: ['처음이에요', '이미 익숙해요', '일부는 익숙해요'],
    topicIds: [102, 104],
  },
};

const PROJECT_TITLES = { 6: '자료구조', 7: '빅데이터분석' };

async function openDraft(draft = DRAFT) {
  planAPI.createDraft.mockResolvedValue(draft);
  render(<PlanCreateView projectTitles={PROJECT_TITLES} hasHistory />);
  await userEvent.click(await screen.findByRole('button', { name: /초안 만들기/ }));
  await screen.findByText(/계획$/, { exact: false });
}

/** 그 조각의 「이미 알아요」. 순서로 집으면 그룹 정렬이 바뀔 때 엉뚱한 항목을 누른다. */
function knownButtonFor(titleText) {
  const item = screen.getByText(titleText).closest('li');
  return within(item).getByRole('button', { name: '이미 알아요' });
}

beforeEach(() => {
  vi.clearAllMocks();
  planAPI.findCoveringDate.mockResolvedValue([]);
  schedulePreviewAPI.get.mockResolvedValue(null);
  schedulePreviewAPI.recompute.mockResolvedValue({ placedItems: [], unplacedItems: [] });
});

describe('판단 근거 표시', () => {
  it('목표와 과목 순서를 보여준다 — 왜 이 순서인지 모르면 고칠 수도 없다', async () => {
    await openDraft();

    expect(await screen.findByText('다음 주 수업을 알아들을 정도로 따라잡기')).toBeInTheDocument();
    expect(screen.getByText('수업 전에 필요한 것만 고른다')).toBeInTheDocument();
    // 과목 순서는 판단 영역 안에서 찾는다 — 같은 이름이 조각 그룹 머리에도 있다.
    const order = screen.getByText('과목 순서').closest('div');
    expect(within(order).getByText('자료구조')).toBeInTheDocument();
    expect(within(order).getByText('화요일 수업 전까지')).toBeInTheDocument();
    expect(within(order).getByText('빅데이터분석')).toBeInTheDocument();
  });

  it('V-7 제외한 항목은 조각 목록에 없고 접힘 영역에 이유와 함께 있다', async () => {
    await openDraft();

    // 조각으로는 만들어지지 않았다.
    expect(screen.queryByText(/엑셀 읽고 쓰기/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /이번에는 제외한 내용 1개/ }));
    expect(screen.getByText('엑셀 읽고 쓰기')).toBeInTheDocument();
  });

  it('V-8 서버가 표시에 따라 조정한 항목은 그렇게 말한다', async () => {
    await openDraft();
    await userEvent.click(screen.getByRole('button', { name: /이번에는 제외한 내용/ }));

    expect(screen.getByText(/이미 알고 있다고 표시했어요 \(표시에 따라 조정\)/)).toBeInTheDocument();
  });

  it('V-9 서버가 채운 완료 기준에는 기본 라벨이 붙는다', async () => {
    await openDraft();

    const filled = screen.getByText(/자료를 덮고 파이썬 기초의 핵심을/);
    expect(within(filled).getByText('기본')).toBeInTheDocument();
    // 모델이 쓴 문장에는 붙지 않는다.
    const written = screen.getByText(/코드 5개의 시간복잡도를/);
    expect(within(written).queryByText('기본')).not.toBeInTheDocument();
  });

  it('취급과 우선순위를 함께, 그러나 따로 보여준다', async () => {
    await openDraft();

    // "꼭 하기 · 충분히 보기 · 문제 풀기 · 약 45분 · 화요일 수업 전"
    expect(screen.getByText(/꼭 하기 · 충분히 보기 · 문제 풀기 · 약 45분 · 화요일 수업 전/))
      .toBeInTheDocument();
    expect(screen.getByText(/권장 · 핵심만 보기 · 읽기 · 약 30분/)).toBeInTheDocument();
  });
});

describe('세 동작', () => {
  it('V-1 「이미 알아요」는 표식을 저장한 뒤 조각을 다시 만든다', async () => {
    await openDraft();
    const calls = [];
    topicAPI.updateUserMark.mockImplementation(async (...args) => { calls.push(['mark', ...args]); });
    planAPI.regenerateItems.mockImplementation(async (...args) => {
      calls.push(['regenerate', ...args]);
      return { ...DRAFT, proposalId: 88 };
    });

    await userEvent.click(knownButtonFor('자료구조 · ADT와 복잡도'));

    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[0]).toEqual(['mark', 101, 'KNOWN']);
    expect(calls[1]).toEqual(['regenerate', 77]);
  });

  it('V-2 「이미 알아요」는 판단을 다시 만들지 않는다 — 초안 생성 호출이 늘지 않는다', async () => {
    await openDraft();
    topicAPI.updateUserMark.mockResolvedValue({});
    planAPI.regenerateItems.mockResolvedValue({ ...DRAFT, proposalId: 88 });

    await userEvent.click(knownButtonFor('자료구조 · ADT와 복잡도'));

    await waitFor(() => expect(planAPI.regenerateItems).toHaveBeenCalled());
    expect(planAPI.createDraft).toHaveBeenCalledTimes(1);
  });

  it('V-3 「제외」는 아무 호출도 하지 않는다 — 이번 초안에서만 빠진다', async () => {
    await openDraft();

    await userEvent.click(screen.getAllByRole('checkbox')[1]);

    expect(topicAPI.updateUserMark).not.toHaveBeenCalled();
    expect(planAPI.regenerateItems).not.toHaveBeenCalled();
  });

  it('V-4 「실행 방법 다시 제안」은 표식을 건드리지 않는다', async () => {
    await openDraft();
    planAPI.regenerateItems.mockResolvedValue({ ...DRAFT, proposalId: 88 });

    await userEvent.click(screen.getByRole('button', { name: /실행 방법 다시 제안/ }));

    await waitFor(() => expect(planAPI.regenerateItems).toHaveBeenCalledWith(77));
    expect(topicAPI.updateUserMark).not.toHaveBeenCalled();
  });

  it('V-5 재생성 뒤에도 판단 영역은 그대로다 — 판단이 안 바뀐다는 걸 화면이 보여준다', async () => {
    await openDraft();
    const before = screen.getByText('다음 주 수업을 알아들을 정도로 따라잡기').textContent;
    planAPI.regenerateItems.mockResolvedValue({ ...DRAFT, proposalId: 88 });

    await userEvent.click(screen.getByRole('button', { name: /실행 방법 다시 제안/ }));
    await waitFor(() => expect(planAPI.regenerateItems).toHaveBeenCalled());

    expect(screen.getByText('다음 주 수업을 알아들을 정도로 따라잡기').textContent).toBe(before);
    expect(screen.getByText('화요일 수업 전까지')).toBeInTheDocument();
  });

  it('「이미 알아요」 뒤에는 되돌릴 수단을 함께 준다', async () => {
    await openDraft();
    topicAPI.updateUserMark.mockResolvedValue({});
    planAPI.regenerateItems.mockResolvedValue({ ...DRAFT, proposalId: 88 });

    await userEvent.click(knownButtonFor('자료구조 · ADT와 복잡도'));
    await screen.findByText(/다음 계획부터도 이 내용은 건너뛸게요/);

    await userEvent.click(screen.getByRole('button', { name: '되돌리기' }));
    await waitFor(() => expect(topicAPI.updateUserMark).toHaveBeenLastCalledWith(101, null));
  });
});

describe('되묻기', () => {
  it('V-6 ASK 응답이면 조각 대신 질문을 보여주고, 답에 topicIds를 실어 다시 요청한다', async () => {
    planAPI.createDraft.mockResolvedValueOnce(ASK_DRAFT).mockResolvedValueOnce(DRAFT);
    render(<PlanCreateView projectTitles={PROJECT_TITLES} hasHistory />);
    await userEvent.click(await screen.findByRole('button', { name: /초안 만들기/ }));

    expect(await screen.findByText(/처음 보는 내용일까요/)).toBeInTheDocument();
    // 만들어 놓고 묻지 않는다 — 만들어진 계획은 답을 유도한다.
    expect(screen.queryByRole('button', { name: /계획 확정/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '이미 익숙해요' }));

    await waitFor(() => expect(planAPI.createDraft).toHaveBeenCalledTimes(2));
    expect(planAPI.createDraft.mock.calls[1][0]).toMatchObject({
      familiarityAnswer: 'FAMILIAR',
      familiarityTopicIds: [102, 104],
    });
  });

  it('건너뛰기도 답을 보낸다 — 안 보내면 다음 요청에서 같은 질문을 다시 받는다', async () => {
    planAPI.createDraft.mockResolvedValueOnce(ASK_DRAFT).mockResolvedValueOnce(DRAFT);
    render(<PlanCreateView projectTitles={PROJECT_TITLES} hasHistory />);
    await userEvent.click(await screen.findByRole('button', { name: /초안 만들기/ }));
    await screen.findByText(/처음 보는 내용일까요/);

    await userEvent.click(screen.getByRole('button', { name: '건너뛰기' }));

    await waitFor(() => expect(planAPI.createDraft).toHaveBeenCalledTimes(2));
    expect(planAPI.createDraft.mock.calls[1][0]).toMatchObject({
      familiarityAnswer: 'FIRST_TIME',
      familiarityTopicIds: [102, 104],
    });
  });
});
