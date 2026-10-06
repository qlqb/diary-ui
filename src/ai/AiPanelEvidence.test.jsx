/**
 * 상담이 저장된 자료를 확인한 결과를 화면에서 고정한다(2026-10-03 재현: 강의계획서가 있는데도 시험 날짜를 되묻고,
 * "과목명과 날짜 말하기" 같은 입력 안내가 답으로 보내져 같은 질문이 반복됐다).
 *
 *  - 답변 아래 "확인한 자료"는 접힌 채 시작하고, 답변에 쓴 근거·확인만 한 근거·확인하지 못한 범위를 나눠 보여 준다.
 *  - PDF 쪽만 쪽으로 연다. 한글 문서의 "구간"은 위치를 글로만 보여 준다.
 *  - AI가 자료를 더 읽는 동안(evidence.reading) 앞서 흘러온 "확인해 볼게요"를 지우고 읽는 대상을 보여 준다.
 *  - 새로고침해도 출처가 다시 보인다(메시지에 저장된 consult.evidence).
 *  - 입력 안내 선택지는 보내지 않고 입력창만 연다. 자료 찾기는 lookup으로 보낸다.
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AiPanel from './AiPanel.jsx';
import { conversationAPI } from '../api/api.js';
import { LOOKUP_TEXT } from './consultLabels.js';

vi.mock('../api/api.js', () => ({
  conversationAPI: {
    list: vi.fn(), getMessages: vi.fn(), getContextSuggestions: vi.fn(), getScheduleSuggestions: vi.fn(),
    create: vi.fn(), sendMessage: vi.fn(), delete: vi.fn(),
  },
  proposalAPI: { get: vi.fn() },
  contextSuggestionAPI: { apply: vi.fn(), dismiss: vi.fn() },
  consultContextAPI: { update: vi.fn() },
  planAPI: { loadDraft: vi.fn() },
  materialStoreAPI: { file: vi.fn() },
}));

const SCOPE = {
  kind: 'consult', courseId: null, conversationScope: 'TODAY', label: '오늘',
  placeholder: '상황을 이야기해 주세요', emptyHint: '편하게 이야기해 주세요.',
};

const EVIDENCE = {
  summary: '자료 4개 중 읽을 수 있는 2개를 검색 · 원문 2곳 확인 · 답변에 1곳 사용 · 확인하지 못한 범위 1건',
  sources: [
    { ref: 'E1', kind: 'MATERIAL_TEXT', title: '자료구조_강의계획서.pdf', courseTitle: '자료구조', materialId: 11,
      locator: 'p.5', page: 5, readState: 'PARTIAL', used: true, round: 1 },
    { ref: 'E2', kind: 'MATERIAL_TEXT', title: '운영체제_계획서.hwp', courseTitle: '운영체제', materialId: 12,
      locator: '구간 2', readState: 'FULL', used: false, round: 1 },
    { ref: 'F1', kind: 'APP_FACT', title: '과제 1차 과제', courseTitle: '자료구조', origin: '사용자 확정',
      readState: 'METADATA', used: false, round: 1 },
  ],
  gaps: [{ label: '대학영어 · 영어_계획서_스캔.pdf', reason: 'NO_TEXT', detail: '텍스트 없음' }],
  rounds: 1,
};

async function start(user) {
  render(<AiPanel scope={SCOPE} variant="workspace" />);
  await waitFor(() => expect(conversationAPI.list).toHaveBeenCalled());
  await user.type(screen.getByRole('textbox'), '시험까지 2주 남았는데 무슨 과목부터 할까');
  await user.click(screen.getByRole('button', { name: '보내기' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  conversationAPI.list.mockResolvedValue([]);
  conversationAPI.create.mockResolvedValue({ conversationId: 1 });
  conversationAPI.getContextSuggestions.mockResolvedValue([]);
  conversationAPI.getScheduleSuggestions.mockResolvedValue([]);
});

describe('확인한 자료', () => {
  it('추가 읽기 중에는 앞선 문장을 지우고, 끝나면 답변 아래에 출처와 확인 못 한 범위를 보여 준다', async () => {
    const user = userEvent.setup();
    let finish;
    conversationAPI.sendMessage.mockImplementationOnce(async (_id, _payload, { onEvent }) => {
      onEvent('message.started', {});
      onEvent('message.delta', { text: '강의계획서의 평가 일정 부분을 확인해 볼게요.' });
      onEvent('evidence.reading', { label: '자료구조_강의계획서.pdf p.5 확인 중' });
      await new Promise((resolve) => { finish = resolve; });
      onEvent('message.delta', { text: '자료구조 중간고사가 10/19~10/23 주간이라 가장 빨라요.' });
      onEvent('message.completed', {
        responseType: 'CHAT', reply: '자료구조 중간고사가 10/19~10/23 주간이라 가장 빨라요.', userMessageId: 5,
        assistantMessageId: 6, quickReplies: [], consult: { evidence: EVIDENCE },
      });
    });
    await start(user);

    expect(await screen.findByRole('status')).toHaveTextContent('자료구조_강의계획서.pdf p.5 확인 중');
    expect(screen.queryByText(/확인해 볼게요/)).not.toBeInTheDocument();
    finish();

    const summary = await screen.findByText('확인한 자료');
    const details = summary.closest('details');
    // 접힌 채 시작한다 — 입력창과 버튼을 밀어내지 않는다.
    expect(details.open).toBe(false);
    await user.click(summary);
    const used = within(details).getByRole('list', { name: '답변에 사용한 근거' });
    expect(within(used).getByText(/자료구조_강의계획서.pdf · p.5 · 자료구조/)).toBeInTheDocument();
    expect(within(used).getByText(/일부만 읽음/)).toBeInTheDocument();
    expect(within(used).getByRole('button', { name: /p.5 열기/ })).toBeInTheDocument();
    const rest = within(details).getByRole('list', { name: '확인만 한 근거' });
    // 한글 문서의 구간은 쪽으로 열지 않는다.
    expect(within(rest).queryByRole('button', { name: /p\.\d+ 열기/ })).not.toBeInTheDocument();
    expect(within(rest).getByText(/운영체제_계획서.hwp · 구간 2/)).toBeInTheDocument();
    expect(within(rest).getByText(/사용자 확정/)).toBeInTheDocument();
    expect(within(details).getByText(/글자를 읽을 수 없음\(스캔본\)/)).toBeInTheDocument();
  });

  it('새로고침하면 메시지에 저장된 출처가 다시 보인다', async () => {
    conversationAPI.list.mockResolvedValue([{ conversationId: 3 }]);
    conversationAPI.getMessages.mockResolvedValue([
      { messageId: 1, role: 'USER', content: '무슨 과목부터 할까' },
      { messageId: 2, role: 'ASSISTANT', content: '자료구조부터 하면 좋아요.', responseType: 'CHAT',
        consult: { evidence: EVIDENCE } },
    ]);
    render(<AiPanel scope={SCOPE} variant="workspace" />);

    expect(await screen.findByText('확인한 자료')).toBeInTheDocument();
    expect(screen.getByText(/원문 2곳 확인/)).toBeInTheDocument();
  });
});

describe('질문 선택지의 뜻', () => {
  const QUESTION = {
    id: 'q-6', text: '가장 빠른 시험 과목과 날짜를 알려줘.', topic: 'OTHER', multiSelect: false,
    choices: [
      { id: 'c1', label: '아직 몰라' },
      { id: 'c2', label: '과목명과 날짜 말하기', kind: 'INPUT' },
      { id: 'c3', label: '강의계획서에서 찾아봐', kind: 'LOOKUP' },
    ],
  };

  function questionTurn() {
    conversationAPI.sendMessage.mockImplementationOnce(async (_id, _payload, { onEvent }) => {
      onEvent('message.started', {});
      onEvent('message.completed', {
        responseType: 'CHAT', reply: QUESTION.text, userMessageId: 5, assistantMessageId: 6, quickReplies: [],
        consult: { question: QUESTION },
      });
    });
  }

  it('입력 안내는 보내지 않고 입력창을 열어 안내를 자리표시 글로 보여 준다', async () => {
    const user = userEvent.setup();
    questionTurn();
    await start(user);
    const card = await screen.findByRole('region', { name: 'AI의 질문' });

    await user.click(within(card).getByRole('button', { name: /과목명과 날짜 말하기/ }));

    expect(conversationAPI.sendMessage).toHaveBeenCalledTimes(1);
    const input = screen.getByRole('textbox');
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute('placeholder', expect.stringContaining('과목명과 날짜 말하기'));
  });

  it('자료 찾기 선택지와 "내 자료에서 찾아봐"는 자료 확인 요청으로 보낸다', async () => {
    const user = userEvent.setup();
    questionTurn();
    questionTurn();
    conversationAPI.sendMessage.mockImplementationOnce(async () => {});
    await start(user);
    let card = await screen.findByRole('region', { name: 'AI의 질문' });

    await user.click(within(card).getByRole('button', { name: '강의계획서에서 찾아봐' }));
    await waitFor(() => expect(conversationAPI.sendMessage).toHaveBeenCalledTimes(2));
    expect(conversationAPI.sendMessage.mock.calls[1][1].answer).toEqual({
      questionId: 'q-6', choiceIds: ['c3'], skipped: false, lookup: false,
    });

    card = await screen.findByRole('region', { name: 'AI의 질문' });
    await user.click(within(card).getByRole('button', { name: '내 자료에서 찾아봐' }));
    await waitFor(() => expect(conversationAPI.sendMessage).toHaveBeenCalledTimes(3));
    expect(conversationAPI.sendMessage.mock.calls[2][1]).toMatchObject({
      message: LOOKUP_TEXT, answer: { questionId: 'q-6', choiceIds: [], skipped: false, lookup: true },
    });
  });
});
