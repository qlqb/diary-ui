/**
 * 상담 카드의 계약을 고정한다.
 *
 * 가장 중요한 것 세 가지:
 *  - 선택지는 제안일 뿐이다. 고른 답도 직접 쓴 답도 같은 길(conversationAPI.sendMessage)로 가고, 카드가 떠 있어도
 *    입력창은 막히지 않는다.
 *  - 카드가 새로 와도 쓰던 글은 그대로다.
 *  - "내가 이해한 내용"은 확인 창 없이 그 자리에서 고치고, 고친 것이 열린 초안을 낡게 했으면 셸에 알린다.
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AiPanel from './AiPanel.jsx';
import { conversationAPI, consultContextAPI, planAPI } from '../api/api.js';
import { markDismissed, resetDismissed } from './dismissedDrafts.js';

vi.mock('../api/api.js', () => ({
  conversationAPI: {
    list: vi.fn(), getMessages: vi.fn(), getContextSuggestions: vi.fn(), getScheduleSuggestions: vi.fn(),
    create: vi.fn(), sendMessage: vi.fn(), delete: vi.fn(),
  },
  proposalAPI: { get: vi.fn() },
  contextSuggestionAPI: { apply: vi.fn(), dismiss: vi.fn() },
  consultContextAPI: { update: vi.fn() },
  planAPI: { loadDraft: vi.fn() },
}));

const SCOPE = {
  kind: 'consult', courseId: null, conversationScope: 'PLAN', label: '전체 프로젝트 계획 상담',
  placeholder: '상황을 이야기해 주세요', emptyHint: '편하게 이야기해 주세요.',
};

const QUESTION = {
  id: 'q1', text: '이번 주에는 어느 정도 도움을 받고 싶어요?', why: '혼자 풀 분량을 정하려고요', topic: 'SUPPORT_LEVEL',
  choices: [{ id: 'c1', label: '힌트만' }, { id: 'c2', label: '풀이까지' }], multiSelect: false,
};
const MULTI_QUESTION = {
  id: 'q2', text: '어디에서 막혔나요?', why: null, topic: 'BLOCKER',
  choices: [{ id: 'b1', label: '개념' }, { id: 'b2', label: '시간' }, { id: 'b3', label: '과제 조건' }], multiSelect: true,
};

/** 한 턴의 응답. consult에 실은 것이 message.completed로 온다. */
function streamTurn(consult, extra = {}) {
  conversationAPI.sendMessage.mockImplementationOnce(async (_id, _payload, { onEvent }) => {
    onEvent('message.started', {});
    onEvent('message.completed', {
      responseType: 'CHAT', reply: '알겠어요.', userMessageId: 5, assistantMessageId: 6, quickReplies: [], consult, ...extra,
    });
  });
}

async function start(user, props = {}) {
  const view = render(<AiPanel scope={SCOPE} variant="workspace" {...props} />);
  await waitFor(() => expect(conversationAPI.list).toHaveBeenCalled());
  await user.type(screen.getByRole('textbox'), '이번 주 계획 같이 짜줘');
  await user.click(screen.getByRole('button', { name: '보내기' }));
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  // 버린 초안 목록은 모듈 전역이다 — 테스트끼리 새어 나가지 않게 비운다.
  resetDismissed();
  conversationAPI.list.mockResolvedValue([]);
  conversationAPI.create.mockResolvedValue({ conversationId: 1 });
  conversationAPI.getContextSuggestions.mockResolvedValue([]);
  conversationAPI.getScheduleSuggestions.mockResolvedValue([]);
});

describe('질문 카드', () => {
  it('질문·이유·선택지를 보여 주고, 선택지를 누르면 같은 보내기 경로로 answer를 실어 보낸다', async () => {
    const user = userEvent.setup();
    streamTurn({ question: QUESTION, understanding: [], direction: null });
    streamTurn(null);
    await start(user);

    const card = await screen.findByRole('region', { name: 'AI의 질문' });
    expect(within(card).getByText(/어느 정도 도움을 받고 싶어요/)).toBeInTheDocument();
    expect(within(card).getByText(/이걸 묻는 이유: 혼자 풀 분량을 정하려고요/)).toBeInTheDocument();

    await user.click(within(card).getByRole('button', { name: '풀이까지' }));

    await waitFor(() => expect(conversationAPI.sendMessage).toHaveBeenCalledTimes(2));
    const payload = conversationAPI.sendMessage.mock.calls[1][1];
    expect(payload).toMatchObject({
      message: '풀이까지', requestedAction: 'AUTO',
      answer: { questionId: 'q1', choiceIds: ['c2'], skipped: false },
    });
    expect(payload.idempotencyKey).toBeTruthy();
    // 고른 라벨이 내 말로 대화에 남는다.
    expect(await screen.findByText('풀이까지')).toBeInTheDocument();
    // 턴이 넘어가면 그 질문은 끝난 것이다.
    expect(screen.queryByRole('region', { name: 'AI의 질문' })).not.toBeInTheDocument();
  });

  it('여러 개 고르는 질문은 고른 뒤에 한 번에 보낸다', async () => {
    const user = userEvent.setup();
    streamTurn({ question: MULTI_QUESTION, understanding: [], direction: null });
    streamTurn(null);
    await start(user);

    const card = await screen.findByRole('region', { name: 'AI의 질문' });
    const send = within(card).getByRole('button', { name: '고른 답 보내기' });
    expect(send).toBeDisabled();

    await user.click(within(card).getByRole('button', { name: '개념' }));
    await user.click(within(card).getByRole('button', { name: '과제 조건' }));
    // 아직 보내지 않았다 — 고르는 중이다.
    expect(conversationAPI.sendMessage).toHaveBeenCalledTimes(1);
    expect(within(card).getByRole('button', { name: /개념/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(card).getByText(/2개 고름/)).toBeInTheDocument();

    await user.click(send);

    await waitFor(() => expect(conversationAPI.sendMessage).toHaveBeenCalledTimes(2));
    expect(conversationAPI.sendMessage.mock.calls[1][1]).toMatchObject({
      message: '개념, 과제 조건',
      answer: { questionId: 'q2', choiceIds: ['b1', 'b3'], skipped: false },
    });
  });

  it('건너뛰기는 skipped=true로 보내고, 지금까지 얘기로 계획은 PLAN_NOW로 보낸다', async () => {
    const user = userEvent.setup();
    streamTurn({ question: QUESTION, understanding: [], direction: null });
    streamTurn({ question: QUESTION, understanding: [], direction: null });
    streamTurn(null);
    await start(user);

    await user.click(await screen.findByRole('button', { name: '이 질문 건너뛰기' }));
    await waitFor(() => expect(conversationAPI.sendMessage).toHaveBeenCalledTimes(2));
    expect(conversationAPI.sendMessage.mock.calls[1][1].answer).toEqual({ questionId: 'q1', choiceIds: [], skipped: true });

    await user.click(await screen.findByRole('button', { name: '지금까지 얘기로 계획해줘' }));
    await waitFor(() => expect(conversationAPI.sendMessage).toHaveBeenCalledTimes(3));
    const planNow = conversationAPI.sendMessage.mock.calls[2][1];
    expect(planNow.requestedAction).toBe('PLAN_NOW');
    expect(planNow).not.toHaveProperty('answer');
  });

  it('둘 다 아님·잘 모르겠어도 같은 경로로 간다(선택지 없이, 건너뛰기 아님)', async () => {
    const user = userEvent.setup();
    streamTurn({ question: QUESTION, understanding: [], direction: null });
    streamTurn(null);
    await start(user);

    await user.click(await screen.findByRole('button', { name: '둘 다 아님' }));
    await waitFor(() => expect(conversationAPI.sendMessage).toHaveBeenCalledTimes(2));
    expect(conversationAPI.sendMessage.mock.calls[1][1]).toMatchObject({
      message: '둘 다 아님', answer: { questionId: 'q1', choiceIds: [], skipped: false },
    });
  });

  it('카드가 떠 있어도 직접 쓴 답을 막지 않고, 그 답에 어느 질문의 답인지 실어 보낸다', async () => {
    const user = userEvent.setup();
    streamTurn({ question: QUESTION, understanding: [], direction: null });
    streamTurn(null);
    await start(user);
    await screen.findByRole('region', { name: 'AI의 질문' });

    const input = screen.getByRole('textbox');
    expect(input).not.toBeDisabled();
    await user.type(input, '문제마다 달라요');
    await user.click(screen.getByRole('button', { name: '보내기' }));

    await waitFor(() => expect(conversationAPI.sendMessage).toHaveBeenCalledTimes(2));
    expect(conversationAPI.sendMessage.mock.calls[1][1]).toMatchObject({
      message: '문제마다 달라요', requestedAction: 'AUTO',
      answer: { questionId: 'q1', choiceIds: [], skipped: false },
    });
  });

  it('직접 말하기는 입력창으로 초점을 옮기고, 나중에 이어하기는 아무것도 보내지 않는다', async () => {
    const user = userEvent.setup();
    streamTurn({ question: QUESTION, understanding: [], direction: null });
    await start(user);

    await user.click(await screen.findByRole('button', { name: '직접 말하기' }));
    expect(screen.getByRole('textbox')).toHaveFocus();

    await user.click(screen.getByRole('button', { name: '나중에 이어하기' }));
    expect(screen.getByText(/이어서 할 수 있어요/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'AI의 질문' })).not.toBeInTheDocument();
    expect(conversationAPI.sendMessage).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: '질문 다시 보기' }));
    expect(screen.getByRole('region', { name: 'AI의 질문' })).toBeInTheDocument();
  });

  it('응답을 기다리는 동안 쓰던 글은 새 카드가 와도 그대로다', async () => {
    const user = userEvent.setup();
    let finish;
    conversationAPI.sendMessage.mockImplementationOnce((_id, _payload, { onEvent }) => new Promise((resolve) => {
      onEvent('message.started', {});
      finish = () => {
        onEvent('message.completed', {
          responseType: 'CHAT', reply: '하나만 더 물어볼게요.', userMessageId: 5, assistantMessageId: 6,
          consult: { question: QUESTION, understanding: [], direction: null },
        });
        resolve();
      };
    }));
    await start(user);

    // 응답이 오기 전에 다음 말을 쓰기 시작한다.
    const input = screen.getByRole('textbox');
    await user.type(input, '참, 금요일은 안 돼요');
    finish();

    expect(await screen.findByRole('region', { name: 'AI의 질문' })).toBeInTheDocument();
    expect(input).toHaveValue('참, 금요일은 안 돼요');
  });

  it('질문이 있으면 예전 빠른 답은 같은 질문을 두 번 그리지 않게 숨긴다', async () => {
    const user = userEvent.setup();
    streamTurn({ question: QUESTION, understanding: [], direction: null }, { quickReplies: ['힌트만', '풀이까지'] });
    await start(user);

    await screen.findByRole('region', { name: 'AI의 질문' });
    expect(screen.queryByRole('group', { name: '빠른 답' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '힌트만' })).toHaveLength(1);
  });

  it('새로고침 뒤에는 마지막 AI 응답의 질문을 대화 기록에서 되살린다', async () => {
    conversationAPI.list.mockResolvedValue([{ conversationId: 9, title: '계획', lastMessageAt: '2026-09-19T10:00:00' }]);
    conversationAPI.getMessages.mockResolvedValue([
      { messageId: 1, role: 'USER', content: '계획 짜줘', responseType: null, proposalId: null },
      {
        messageId: 2, role: 'ASSISTANT', content: '하나만 물어볼게요.', responseType: 'CHAT', proposalId: null,
        consult: { question: QUESTION, understanding: [], direction: { before: null, after: '과제 위주로', reason: null, affectsDraft: false } },
      },
    ]);
    const onConsultState = vi.fn();
    render(<AiPanel scope={SCOPE} variant="workspace" onConsultState={onConsultState} />);

    expect(await screen.findByRole('region', { name: 'AI의 질문' })).toBeInTheDocument();
    await waitFor(() => expect(onConsultState).toHaveBeenLastCalledWith(expect.objectContaining({
      conversationId: 9, hasMessages: true, direction: expect.objectContaining({ after: '과제 위주로', fresh: true }),
    })));
  });
});

describe('새로고침 뒤 초안 복구', () => {
  it('초안을 만든 뒤에 대화를 더 했어도(마지막 메시지가 일반 답변이어도) 가장 최근 초안을 되살린다', async () => {
    // 실제 화면에서 찾은 결함: 초안 → "그건 이미 했어" → 새로고침하면 마지막 메시지만 봐서 초안이 사라졌다.
    conversationAPI.list.mockResolvedValue([{ conversationId: 9, title: '계획', lastMessageAt: '2026-09-19T10:00:00' }]);
    conversationAPI.getMessages.mockResolvedValue([
      { messageId: 1, role: 'USER', content: '오늘 계획 짜줘', responseType: null, proposalId: null },
      { messageId: 2, role: 'ASSISTANT', content: '초안을 만들었어요.', responseType: 'PROPOSAL', proposalId: 4124 },
      { messageId: 3, role: 'USER', content: '아 그건 이미 했어', responseType: null, proposalId: null },
      { messageId: 4, role: 'ASSISTANT', content: '그 부분은 뺄게요.', responseType: 'CHAT', proposalId: null },
    ]);
    // 서버는 옛 id로 물어도 대체 사슬의 끝(지금 열린 초안)을 돌려준다.
    planAPI.loadDraft.mockResolvedValue({ proposalId: 4125, proposal: { status: 'PROPOSED', items: [{}, {}] } });
    const onPeriodPlan = vi.fn();
    render(<AiPanel scope={SCOPE} variant="workspace" onPeriodPlan={onPeriodPlan} />);

    await waitFor(() => expect(planAPI.loadDraft).toHaveBeenCalledWith(4124));
    await waitFor(() => expect(onPeriodPlan).toHaveBeenCalledWith(
      expect.objectContaining({ proposalId: 4125 }), { restored: true }));
  });

  it('방금 버린 초안은 되살리지 않는다 — 서버 응답이 오기 전에 대화를 다시 읽어도', async () => {
    /*
     * 실제 화면에서 찾은 결함: [초안 버리기] → 일정 탭 → 그 탭의 대화가 서버에 남아 있던 초안을 되살리고,
     * 되살린 초안이 탭을 계획으로 끌고 가서 일정 탭에 들어갈 수 없었다.
     */
    markDismissed(4124);
    conversationAPI.list.mockResolvedValue([{ conversationId: 9, title: '계획', lastMessageAt: '2026-09-19T10:00:00' }]);
    conversationAPI.getMessages.mockResolvedValue([
      { messageId: 1, role: 'USER', content: '오늘 계획 짜줘', responseType: null, proposalId: null },
      { messageId: 2, role: 'ASSISTANT', content: '초안을 만들었어요.', responseType: 'PROPOSAL', proposalId: 4124 },
    ]);
    const onPeriodPlan = vi.fn();
    render(<AiPanel scope={SCOPE} variant="workspace" onPeriodPlan={onPeriodPlan} />);

    await waitFor(() => expect(conversationAPI.getMessages).toHaveBeenCalled());
    expect(planAPI.loadDraft).not.toHaveBeenCalled();
    expect(onPeriodPlan).not.toHaveBeenCalled();
  });

  it('버린 초안을 서버가 대체 초안으로 돌려줘도, 그 대체가 버린 것이면 열지 않는다', async () => {
    markDismissed(4125);
    conversationAPI.list.mockResolvedValue([{ conversationId: 9, title: '계획', lastMessageAt: '2026-09-19T10:00:00' }]);
    conversationAPI.getMessages.mockResolvedValue([
      { messageId: 2, role: 'ASSISTANT', content: '초안을 만들었어요.', responseType: 'PROPOSAL', proposalId: 4124 },
    ]);
    planAPI.loadDraft.mockResolvedValue({ proposalId: 4125, proposal: { status: 'PROPOSED', items: [{}] } });
    const onPeriodPlan = vi.fn();
    render(<AiPanel scope={SCOPE} variant="workspace" onPeriodPlan={onPeriodPlan} />);

    await waitFor(() => expect(planAPI.loadDraft).toHaveBeenCalledWith(4124));
    expect(onPeriodPlan).not.toHaveBeenCalled();
  });
});

describe('내가 이해한 내용', () => {
  const LINES = [
    { id: '41', source: 'MEMORY', text: '평일 저녁에는 알바가 있어요', evidenceType: 'INFERRED', scopeLabel: '전체', isNew: true },
    { id: 'b-1', source: 'BRIEF', text: '이번 주는 과제 2번이 먼저예요', evidenceType: 'STATED', scopeLabel: '자료구조', isNew: false },
  ];

  it('근거를 평범한 말로 붙이고, 없으면 카드도 없다', async () => {
    const user = userEvent.setup();
    streamTurn({ question: null, understanding: LINES, direction: null });
    await start(user);

    const card = await screen.findByRole('region', { name: '내가 이해한 내용' });
    expect(within(card).getByText(/AI 추정 · 확인 전 · 전체 · 이번에 새로 이해함/)).toBeInTheDocument();
    expect(within(card).getByText(/내가 말한 것 · 자료구조/)).toBeInTheDocument();
  });

  it('조금 달라요 → 그 자리에서 고치기 → 고쳤어요, 열린 초안이 낡았으면 셸에 알린다', async () => {
    const user = userEvent.setup();
    const onDraftStale = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm');
    consultContextAPI.update.mockResolvedValue({ contextId: 42, content: '평일 저녁 7시 이후에는 알바가 있어요', staleDraftIds: [77] });
    streamTurn({ question: null, understanding: LINES, direction: null });
    await start(user, { onDraftStale });

    const card = await screen.findByRole('region', { name: '내가 이해한 내용' });
    await user.click(within(card).getAllByRole('button', { name: '조금 달라요' })[0]);
    const edit = within(card).getByRole('textbox', { name: '고친 내용' });
    expect(edit).toHaveValue('평일 저녁에는 알바가 있어요');
    await user.clear(edit);
    await user.type(edit, '평일 저녁 7시 이후에는 알바가 있어요');
    await user.click(within(card).getByRole('button', { name: /이렇게 고치기/ }));

    await waitFor(() => expect(consultContextAPI.update).toHaveBeenCalledWith('41', { content: '평일 저녁 7시 이후에는 알바가 있어요' }));
    expect(await within(card).findByText('고쳤어요')).toBeInTheDocument();
    expect(within(card).getByText('평일 저녁 7시 이후에는 알바가 있어요')).toBeInTheDocument();
    expect(onDraftStale).toHaveBeenCalledWith([77], 'UNDERSTANDING');
    // 기억 하나 고칠 때마다 확인 창을 띄우지 않는다.
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('고치지 못하면 그 자리에서 말하고 편집을 그대로 둔다', async () => {
    const user = userEvent.setup();
    consultContextAPI.update.mockRejectedValue(new Error('잠시 뒤에 다시 시도해 주세요.'));
    streamTurn({ question: null, understanding: LINES, direction: null });
    await start(user);

    const card = await screen.findByRole('region', { name: '내가 이해한 내용' });
    await user.click(within(card).getAllByRole('button', { name: '조금 달라요' })[0]);
    await user.type(within(card).getByRole('textbox', { name: '고친 내용' }), '!');
    await user.click(within(card).getByRole('button', { name: /이렇게 고치기/ }));

    expect(await within(card).findByText('잠시 뒤에 다시 시도해 주세요.')).toBeInTheDocument();
    expect(within(card).queryByText('고쳤어요')).not.toBeInTheDocument();
  });

  it('이번 대화의 합의는 저장하지 않고, 대화로 고쳐 말하게 입력창을 채운다(쓰던 글은 지우지 않는다)', async () => {
    const user = userEvent.setup();
    streamTurn({ question: null, understanding: LINES, direction: null });
    await start(user);

    const card = await screen.findByRole('region', { name: '내가 이해한 내용' });
    const input = screen.getByPlaceholderText(SCOPE.placeholder);
    await user.type(input, '참고로');
    await user.click(within(card).getAllByRole('button', { name: '조금 달라요' })[1]);

    expect(consultContextAPI.update).not.toHaveBeenCalled();
    expect(input.value).toContain('참고로');
    expect(input.value).toContain('다시 말할게요: ');
    expect(input).toHaveFocus();
  });
});

describe('방향과 진행 단계', () => {
  it('답으로 방향이 바뀌고 초안에 영향을 주면 열린 초안을 낡았다고 알린다', async () => {
    const user = userEvent.setup();
    const onDraftStale = vi.fn();
    const onConsultState = vi.fn();
    streamTurn({
      question: null, understanding: [],
      direction: { before: '개념 복습 위주', after: '과제 2번 먼저', reason: '금요일이 마감이라고 했어요', affectsDraft: true },
    });
    await start(user, { onDraftStale, onConsultState });

    await waitFor(() => expect(onDraftStale).toHaveBeenCalledWith(null, 'DIRECTION'));
    expect(onConsultState).toHaveBeenLastCalledWith(expect.objectContaining({
      direction: expect.objectContaining({ before: '개념 복습 위주', after: '과제 2번 먼저', fresh: true }),
    }));
  });

  it('진행 단계는 서버가 밟은 단계만, 사용자 말로 바꿔 보여 준다', async () => {
    const user = userEvent.setup();
    let finish;
    conversationAPI.sendMessage.mockImplementationOnce((_id, _payload, { onEvent }) => new Promise((resolve) => {
      onEvent('message.started', {});
      onEvent('period_plan.progress', { stage: 'RETRIEVING', label: '고른 자료의 원문을 읽는 중' });
      finish = resolve;
    }));
    await start(user);

    expect(await screen.findByText(/원문 읽는 중/)).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    finish();
  });
});

describe('보내지 않은 입력', () => {
  it('새로고침해도 쓰던 글이 남아 있다(대화마다 세션에 저장)', async () => {
    const user = userEvent.setup();
    const first = render(<AiPanel scope={SCOPE} variant="workspace" />);
    await waitFor(() => expect(conversationAPI.list).toHaveBeenCalled());
    await user.type(screen.getByRole('textbox'), '다음 주 화요일까지');
    first.unmount();

    render(<AiPanel scope={SCOPE} variant="workspace" />);
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('다음 주 화요일까지'));
  });

  it('보내면 저장해 둔 글도 지운다', async () => {
    const user = userEvent.setup();
    streamTurn(null);
    const first = await start(user);
    await waitFor(() => expect(conversationAPI.sendMessage).toHaveBeenCalledTimes(1));
    first.unmount();

    render(<AiPanel scope={SCOPE} variant="workspace" />);
    await waitFor(() => expect(conversationAPI.list).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('textbox')).toHaveValue('');
  });
});
