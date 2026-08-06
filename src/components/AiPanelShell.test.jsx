import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AiPanelShell from './AiPanelShell.jsx';
import { conversationAPI, proposalAPI, schedulePreviewAPI } from '../api/api.js';

vi.mock('../api/api.js', () => ({
  conversationAPI: {
    create: vi.fn(),
    list: vi.fn(),
    getMessages: vi.fn(),
    sendMessage: vi.fn(),
  },
  proposalAPI: {
    get: vi.fn(),
    apply: vi.fn(),
  },
  schedulePreviewAPI: {
    get: vi.fn(),
    recompute: vi.fn(),
  },
}));

/**
 * conversationAPI.sendMessage를 직접 제어 가능한 pending Promise로 만든다.
 * onEvent/signal을 캡처해 테스트에서 SSE 이벤트를 흉내 내고, abort 여부를 확인할 수 있게 한다.
 */
function mockPendingSend() {
  let resolveFn;
  let rejectFn;
  let capturedOnEvent;
  let capturedSignal;

  conversationAPI.sendMessage.mockImplementation((_conversationId, _payload, { onEvent, signal } = {}) => {
    capturedOnEvent = onEvent;
    capturedSignal = signal;
    return new Promise((resolve, reject) => {
      resolveFn = resolve;
      rejectFn = reject;
      signal?.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      });
    });
  });

  return {
    resolve: () => resolveFn(),
    reject: (err) => rejectFn(err),
    emit: (event, data) => act(() => capturedOnEvent(event, data)),
    getSignal: () => capturedSignal,
  };
}

describe('AiPanelShell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 기본은 "아직 대화가 하나도 없는 사용자" — 마운트 시 목록이 비어 있으면 빈 conversation을
    // 먼저 만들지 않고 새 대화 준비 상태로 남는다. 실제 생성은 첫 메시지를 보낼 때 일어난다.
    conversationAPI.list.mockResolvedValue([]);
    conversationAPI.create.mockResolvedValue({ conversationId: 1 });
    conversationAPI.getMessages.mockResolvedValue([]);
    schedulePreviewAPI.get.mockResolvedValue(null);
    schedulePreviewAPI.recompute.mockResolvedValue({
      proposalId: 900,
      horizonStart: '2026-08-10',
      horizonEnd: '2026-08-16',
      availabilityWindows: [],
      userOverrides: [],
      placedItems: [],
      unplacedItems: [],
      computedAt: new Date().toISOString(),
    });
  });

  it('스트리밍 중에는 전송 버튼과 Enter가 다시 전송하지 않는다', async () => {
    const user = userEvent.setup();
    const pending = mockPendingSend();
    render(<AiPanelShell open contextLabel="오늘" onClose={() => {}} onApplied={() => {}} />);

    const textarea = await screen.findByPlaceholderText(/오늘 프로젝트를 좀 하고 싶은데/);
    await user.type(textarea, '안녕');
    const sendButton = textarea.parentElement.querySelector('.v6-ai-send-btn');
    await user.click(sendButton);

    expect(conversationAPI.sendMessage).toHaveBeenCalledTimes(1);
    expect(sendButton).toBeDisabled();

    // 스트리밍 중 다시 클릭/Enter를 시도해도 두 번째 호출은 없어야 한다.
    await user.click(sendButton);
    await user.type(textarea, '{Enter}');
    expect(conversationAPI.sendMessage).toHaveBeenCalledTimes(1);

    pending.emit('message.started', {});
    pending.emit('message.completed', { reply: '안녕!', responseType: 'CHAT', userMessageId: 1 });
    await act(async () => pending.resolve());

    // 전송 후 입력창을 비우므로 버튼은 "텍스트 없음" 때문에 계속 disabled다 — sending 자체가
    // 풀렸는지는 텍스트 내용과 무관한 textarea의 disabled 여부로 확인한다.
    await waitFor(() => expect(textarea).not.toBeDisabled());
  });

  it('컴포넌트가 unmount되면 진행 중인 요청을 abort하고, 이후 자동으로 재요청하지 않는다', async () => {
    const user = userEvent.setup();
    const pending = mockPendingSend();
    const { unmount } = render(<AiPanelShell open contextLabel="오늘" onClose={() => {}} onApplied={() => {}} />);

    const textarea = await screen.findByPlaceholderText(/오늘 프로젝트를 좀 하고 싶은데/);
    await user.type(textarea, '안녕');
    const sendButton = textarea.parentElement.querySelector('.v6-ai-send-btn');
    await user.click(sendButton);

    expect(conversationAPI.sendMessage).toHaveBeenCalledTimes(1);
    const signal = pending.getSignal();
    expect(signal.aborted).toBe(false);

    unmount();

    expect(signal.aborted).toBe(true);
    // 약간의 시간이 지나도 재요청은 없어야 한다.
    await new Promise((r) => setTimeout(r, 50));
    expect(conversationAPI.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('message.delta 이벤트가 여러 번 와도 말풍선 하나에만 누적되고, 완료 후 한 번만 반영된다', async () => {
    const user = userEvent.setup();
    const pending = mockPendingSend();
    render(<AiPanelShell open contextLabel="오늘" onClose={() => {}} onApplied={() => {}} />);

    const textarea = await screen.findByPlaceholderText(/오늘 프로젝트를 좀 하고 싶은데/);
    await user.type(textarea, '안녕');
    const sendButton = textarea.parentElement.querySelector('.v6-ai-send-btn');
    await user.click(sendButton);

    pending.emit('message.started', {});
    pending.emit('message.delta', { text: '안' });
    pending.emit('message.delta', { text: '녕' });
    pending.emit('message.completed', { reply: '안녕', responseType: 'CHAT', userMessageId: 1 });
    await act(async () => pending.resolve());

    const bubbles = document.querySelectorAll('.v6-ai-bubble-assistant');
    expect(bubbles).toHaveLength(1);
    expect(bubbles[0].textContent).toBe('안녕');
  });

  it('OFFER 응답에서는 초안 카드 없이 단일 액션 버튼만 보여준다', async () => {
    const user = userEvent.setup();
    const pending = mockPendingSend();
    render(<AiPanelShell open contextLabel="오늘" onClose={() => {}} onApplied={() => {}} />);

    const textarea = await screen.findByPlaceholderText(/오늘 프로젝트를 좀 하고 싶은데/);
    await user.type(textarea, '다음 주까지 배포해야 해');
    const sendButton = textarea.parentElement.querySelector('.v6-ai-send-btn');
    await user.click(sendButton);

    pending.emit('message.started', {});
    pending.emit('offer.ready', { offerAction: { type: 'CREATE_PROPOSAL', label: '이 내용으로 계획 초안 만들기' } });
    pending.emit('message.completed', {
      reply: '계획 초안을 만들어볼까?', responseType: 'OFFER', userMessageId: 1,
    });
    await act(async () => pending.resolve());

    expect(await screen.findByText('이 내용으로 계획 초안 만들기')).toBeInTheDocument();
    expect(document.querySelector('.v6-proposal-card')).toBeNull();
  });

  it('첫 메시지를 보내기 전에는 conversation을 만들지 않고, 전송 시점에만 생성한다', async () => {
    const user = userEvent.setup();
    mockPendingSend();
    render(<AiPanelShell open contextLabel="오늘" onClose={() => {}} onApplied={() => {}} />);

    await screen.findByPlaceholderText(/오늘 프로젝트를 좀 하고 싶은데/);
    expect(conversationAPI.create).not.toHaveBeenCalled();

    const textarea = screen.getByPlaceholderText(/오늘 프로젝트를 좀 하고 싶은데/);
    await user.type(textarea, '안녕');
    await user.click(textarea.parentElement.querySelector('.v6-ai-send-btn'));

    // 전송한 뒤에야, 그리고 정확히 한 번만 생성한다.
    expect(conversationAPI.create).toHaveBeenCalledTimes(1);
    expect(conversationAPI.sendMessage).toHaveBeenCalledWith(1, expect.anything(), expect.anything());
  });

  it('+ 새 대화를 눌러도 기존 대화를 지우거나 삭제 API를 호출하지 않고 빈 화면으로만 전환한다', async () => {
    conversationAPI.list.mockResolvedValue([
      { conversationId: 5, title: '이전 상담', lastMessageAt: new Date().toISOString(), pendingProposalCount: 0 },
    ]);
    conversationAPI.getMessages.mockResolvedValue([
      { messageId: 1, role: 'USER', content: '예전에 이런 얘기 했었지', responseType: null, proposalId: null },
      { messageId: 2, role: 'ASSISTANT', content: '네 기억해요', responseType: 'CHAT', proposalId: null },
    ]);

    render(<AiPanelShell open contextLabel="오늘" onClose={() => {}} onApplied={() => {}} />);

    expect(await screen.findByText('예전에 이런 얘기 했었지')).toBeInTheDocument();

    await new Promise((r) => setTimeout(r, 0));
    const newChatButton = screen.getByRole('button', { name: '새 대화' });
    await act(async () => {
      newChatButton.click();
    });

    // 화면에서는 이전 메시지가 사라지지만(빈 화면 전환), 삭제성 API는 전혀 호출되지 않는다.
    expect(screen.queryByText('예전에 이런 얘기 했었지')).toBeNull();
    expect(screen.getByText(/새 대화를 시작해보세요/)).toBeInTheDocument();
    expect(conversationAPI.create).not.toHaveBeenCalled();
  });

  it('대화 목록에서 다른 대화를 고르면 그 대화의 메시지만 표시한다', async () => {
    conversationAPI.list.mockResolvedValue([
      { conversationId: 10, title: '최근 상담', lastMessageAt: new Date().toISOString(), pendingProposalCount: 0 },
      { conversationId: 20, title: '예전 상담', lastMessageAt: new Date(Date.now() - 86400000 * 2).toISOString(), pendingProposalCount: 0 },
    ]);
    conversationAPI.getMessages.mockImplementation((id) => {
      if (id === 10) {
        return Promise.resolve([{ messageId: 1, role: 'USER', content: '최근 대화 내용', responseType: null, proposalId: null }]);
      }
      return Promise.resolve([{ messageId: 2, role: 'USER', content: '예전 대화 내용', responseType: null, proposalId: null }]);
    });

    render(<AiPanelShell open contextLabel="오늘" onClose={() => {}} onApplied={() => {}} />);

    expect(await screen.findByText('최근 대화 내용')).toBeInTheDocument();

    await act(async () => {
      screen.getByRole('button', { name: '대화 목록' }).click();
    });
    await act(async () => {
      screen.getByText('예전 상담').click();
    });

    expect(await screen.findByText('예전 대화 내용')).toBeInTheDocument();
    expect(screen.queryByText('최근 대화 내용')).toBeNull();
    expect(conversationAPI.getMessages).toHaveBeenCalledWith(20);
  });

  it('적용 전 제안이 있는 대화를 다시 선택하면 제안 카드가 복원된다', async () => {
    conversationAPI.list.mockResolvedValue([
      { conversationId: 30, title: '계획 상담', lastMessageAt: new Date().toISOString(), pendingProposalCount: 1 },
    ]);
    conversationAPI.getMessages.mockResolvedValue([
      { messageId: 1, role: 'USER', content: '계획 짜줘', responseType: null, proposalId: null },
      { messageId: 2, role: 'ASSISTANT', content: '세 조각을 잡아봤어', responseType: 'PROPOSAL', proposalId: 900 },
    ]);
    proposalAPI.get.mockResolvedValue({
      proposalId: 900,
      status: 'PROPOSED',
      items: [
        { proposalItemId: 1, title: '교재 읽기', description: null, expectedMinutes: 30, priority: 'SHOULD', placementType: 'DATE_ONLY' },
      ],
    });

    render(<AiPanelShell open contextLabel="오늘" onClose={() => {}} onApplied={() => {}} />);

    expect(await screen.findByDisplayValue('교재 읽기')).toBeInTheDocument();
    expect(document.querySelector('.v6-proposal-card')).not.toBeNull();
  });

  it('대화 목록 조회가 실패하면 오류를 보여주고 빈 대화 화면으로 진행할 수 있다', async () => {
    conversationAPI.list.mockRejectedValue(new Error('목록을 불러오지 못했습니다'));

    render(<AiPanelShell open contextLabel="오늘" onClose={() => {}} onApplied={() => {}} />);

    expect(await screen.findByText('목록을 불러오지 못했습니다')).toBeInTheDocument();
  });

  it('진행 중인 다른 대화의 SSE 응답이 전환 후 화면에 섞이지 않는다', async () => {
    const user = userEvent.setup();
    const pending = mockPendingSend();
    // 마운트 시점(목록 비어 있음 → 새 대화 준비 상태)과, 나중에 목록을 다시 열 때(다른 대화가
    // 하나 있음)를 구분한다.
    conversationAPI.list
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        { conversationId: 40, title: '두 번째 대화', lastMessageAt: new Date().toISOString(), pendingProposalCount: 0 },
      ]);

    render(<AiPanelShell open contextLabel="오늘" onClose={() => {}} onApplied={() => {}} />);

    // 새 대화 상태에서 첫 메시지를 보낸다(conversationId=1로 생성됨) — 아직 응답은 오지 않는다.
    const textarea = await screen.findByPlaceholderText(/오늘 프로젝트를 좀 하고 싶은데/);
    await user.type(textarea, '안녕');
    await user.click(textarea.parentElement.querySelector('.v6-ai-send-btn'));
    await waitFor(() => expect(conversationAPI.create).toHaveBeenCalledTimes(1));

    // 응답이 오기 전에 목록에서 다른 대화로 전환한다.
    conversationAPI.getMessages.mockResolvedValue([]);
    const { act: rtlAct } = await import('@testing-library/react');
    await rtlAct(async () => {
      screen.getByRole('button', { name: '대화 목록' }).click();
    });
    await rtlAct(async () => {
      screen.getByText('두 번째 대화').click();
    });

    // 그제서야 이전 대화(conversationId=1)의 스트림 이벤트가 뒤늦게 도착한다.
    pending.emit('message.started', {});
    pending.emit('message.delta', { text: '뒤늦은 응답' });

    // 지금 화면(conversationId=40)에는 그 내용이 절대 보이면 안 된다.
    expect(screen.queryByText(/뒤늦은 응답/)).toBeNull();
    expect(document.querySelectorAll('.v6-ai-bubble-assistant')).toHaveLength(0);
  });

  it('텍스트 답변 없이 계획 제안만 온 턴은 빈 assistant 말풍선을 남기지 않는다', async () => {
    const user = userEvent.setup();
    const pending = mockPendingSend();
    render(<AiPanelShell open contextLabel="오늘" onClose={() => {}} onApplied={() => {}} />);

    const textarea = await screen.findByPlaceholderText(/오늘 프로젝트를 좀 하고 싶은데/);
    await user.type(textarea, '계획 짜줘');
    await user.click(textarea.parentElement.querySelector('.v6-ai-send-btn'));

    pending.emit('message.started', {});
    pending.emit('proposal.ready', {
      proposalId: 900,
      items: [
        { proposalItemId: 1, title: '교재 읽기', description: null, expectedMinutes: 30, priority: 'SHOULD', placementType: 'DATE_ONLY' },
      ],
    });
    pending.emit('message.completed', { reply: '', responseType: 'PROPOSAL', proposalId: 900, userMessageId: 1 });
    await act(async () => pending.resolve());

    // 제안 카드는 정상적으로 남지만, 텍스트가 없는 assistant 말풍선은 렌더링되지 않는다.
    expect(document.querySelector('.v6-proposal-card')).not.toBeNull();
    expect(document.querySelectorAll('.v6-ai-bubble-assistant')).toHaveLength(0);
  });

  it('적용 전 제안 대화를 다시 열었을 때도 빈 내용으로 저장된 assistant 메시지는 말풍선으로 남지 않는다', async () => {
    conversationAPI.list.mockResolvedValue([
      { conversationId: 30, title: '계획 상담', lastMessageAt: new Date().toISOString(), pendingProposalCount: 1 },
    ]);
    conversationAPI.getMessages.mockResolvedValue([
      { messageId: 1, role: 'USER', content: '계획 짜줘', responseType: null, proposalId: null },
      { messageId: 2, role: 'ASSISTANT', content: '', responseType: 'PROPOSAL', proposalId: 900 },
    ]);
    proposalAPI.get.mockResolvedValue({
      proposalId: 900,
      status: 'PROPOSED',
      items: [
        { proposalItemId: 1, title: '교재 읽기', description: null, expectedMinutes: 30, priority: 'SHOULD', placementType: 'DATE_ONLY' },
      ],
    });

    render(<AiPanelShell open contextLabel="오늘" onClose={() => {}} onApplied={() => {}} />);

    expect(await screen.findByDisplayValue('교재 읽기')).toBeInTheDocument();
    expect(document.querySelectorAll('.v6-ai-bubble-assistant')).toHaveLength(0);
  });

  describe('7일 범위 일정 후보 배치 미리보기', () => {
    /** UNSCHEDULED 후보가 담긴 PROPOSAL을 만들고, 초기 자동 재배치까지 끝난 상태로 만든다. */
    async function sendProposalWithSchedulingCandidate(user, pending) {
      const textarea = await screen.findByPlaceholderText(/오늘 프로젝트를 좀 하고 싶은데/);
      await user.type(textarea, '이번 주 안에 강의 들어야 해');
      await user.click(textarea.parentElement.querySelector('.v6-ai-send-btn'));

      pending.emit('message.started', {});
      pending.emit('proposal.ready', {
        proposalId: 900,
        items: [
          { proposalItemId: 1, title: '강의 1', description: null, expectedMinutes: 30, priority: 'MUST', placementType: 'UNSCHEDULED' },
        ],
      });
      pending.emit('message.completed', { reply: '이번 주 계획을 짜봤어', responseType: 'PROPOSAL', proposalId: 900, userMessageId: 1 });
      await act(async () => pending.resolve());
    }

    it('추정 가용시간 요약을 보여준다', async () => {
      const user = userEvent.setup();
      const pending = mockPendingSend();
      schedulePreviewAPI.recompute.mockResolvedValue({
        proposalId: 900,
        horizonStart: '2026-08-10',
        horizonEnd: '2026-08-16',
        availabilityWindows: [
          { startAt: '2026-08-10T19:00:00', endAt: '2026-08-10T22:00:00', source: 'DEFAULT_INFERENCE', confidence: 'LOW', reason: '기본 활동 시간대' },
        ],
        userOverrides: [],
        placedItems: [{ proposalItemId: 1, title: '강의 1', placementType: 'TIME_FIXED', scheduledDate: '2026-08-10', scheduledStartAt: '2026-08-10T19:00:00', scheduledEndAt: '2026-08-10T19:30:00', reason: '기본 활동 시간대에 배치했어요' }],
        unplacedItems: [],
        computedAt: new Date().toISOString(),
      });
      render(<AiPanelShell open contextLabel="오늘" onClose={() => {}} onApplied={() => {}} />);

      await sendProposalWithSchedulingCandidate(user, pending);

      expect(await screen.findByText(/이번 계획에 사용할 수 있는 시간을 약/)).toBeInTheDocument();
      expect(schedulePreviewAPI.recompute).toHaveBeenCalledWith(900, expect.objectContaining({ availabilityOverrides: [] }));
    });

    it('미배치 항목을 오류가 아닌 사유와 함께 보여준다', async () => {
      const user = userEvent.setup();
      const pending = mockPendingSend();
      schedulePreviewAPI.recompute.mockResolvedValue({
        proposalId: 900,
        horizonStart: '2026-08-10',
        horizonEnd: '2026-08-16',
        availabilityWindows: [],
        userOverrides: [],
        placedItems: [],
        unplacedItems: [{ proposalItemId: 1, title: '강의 1', reason: '배치 가능한 시간이 부족함' }],
        computedAt: new Date().toISOString(),
      });
      render(<AiPanelShell open contextLabel="오늘" onClose={() => {}} onApplied={() => {}} />);

      await sendProposalWithSchedulingCandidate(user, pending);

      expect(await screen.findByText(/배치하지 못한 항목이 있어요/)).toBeInTheDocument();
      // 요약 목록과 카드 안내 문구 두 곳에 같은 사유가 나타난다 — 최소 하나는 보여야 한다.
      expect(screen.getAllByText(/배치 가능한 시간이 부족함/).length).toBeGreaterThan(0);
    });

    it('가용시간 예외를 추가하면 그 값을 담아 다시 계산을 요청한다', async () => {
      const user = userEvent.setup();
      const pending = mockPendingSend();
      render(<AiPanelShell open contextLabel="오늘" onClose={() => {}} onApplied={() => {}} />);

      await sendProposalWithSchedulingCandidate(user, pending);
      await waitFor(() => expect(schedulePreviewAPI.recompute).toHaveBeenCalledTimes(1));

      const dateInput = screen.getByLabelText('제외할 날짜');
      const startInput = screen.getByLabelText('제외할 시작 시각');
      const endInput = screen.getByLabelText('제외할 종료 시각');
      await user.type(dateInput, '2026-08-12');
      await user.type(startInput, '19:00');
      await user.type(endInput, '22:00');
      await user.click(screen.getByRole('button', { name: '이 시간은 안 돼요' }));

      await waitFor(() => expect(schedulePreviewAPI.recompute).toHaveBeenCalledTimes(2));
      expect(schedulePreviewAPI.recompute).toHaveBeenLastCalledWith(
        900,
        expect.objectContaining({
          availabilityOverrides: [
            expect.objectContaining({ startAt: '2026-08-12T19:00:00', endAt: '2026-08-12T22:00:00', available: false }),
          ],
        }),
      );
    });

    it('"다시 배치" 버튼은 OpenAI를 다시 부르지 않고 Timefold 재계산만 요청한다', async () => {
      const user = userEvent.setup();
      const pending = mockPendingSend();
      render(<AiPanelShell open contextLabel="오늘" onClose={() => {}} onApplied={() => {}} />);

      await sendProposalWithSchedulingCandidate(user, pending);
      await waitFor(() => expect(schedulePreviewAPI.recompute).toHaveBeenCalledTimes(1));
      expect(conversationAPI.sendMessage).toHaveBeenCalledTimes(1); // 최초 한 번뿐

      await user.click(screen.getByRole('button', { name: /이 기준으로 다시 배치/ }));

      await waitFor(() => expect(schedulePreviewAPI.recompute).toHaveBeenCalledTimes(2));
      expect(conversationAPI.sendMessage).toHaveBeenCalledTimes(1); // 재배치 후에도 여전히 한 번뿐
    });

    it('재배치가 진행 중일 때 중복 클릭은 새 요청을 만들지 않는다', async () => {
      const user = userEvent.setup();
      const pending = mockPendingSend();
      render(<AiPanelShell open contextLabel="오늘" onClose={() => {}} onApplied={() => {}} />);

      await sendProposalWithSchedulingCandidate(user, pending);
      await waitFor(() => expect(schedulePreviewAPI.recompute).toHaveBeenCalledTimes(1));

      let resolveSecond;
      schedulePreviewAPI.recompute.mockImplementation(
        () => new Promise((resolve) => { resolveSecond = resolve; }),
      );

      const replanButton = screen.getByRole('button', { name: /이 기준으로 다시 배치/ });
      await user.click(replanButton);
      await user.click(replanButton); // 아직 이전 요청이 끝나기 전에 다시 클릭

      expect(schedulePreviewAPI.recompute).toHaveBeenCalledTimes(2); // 최초 1 + 이번 클릭 중 실제로 나간 1건만

      await act(async () => resolveSecond({
        proposalId: 900, horizonStart: '2026-08-10', horizonEnd: '2026-08-16',
        availabilityWindows: [], userOverrides: [], placedItems: [], unplacedItems: [],
        computedAt: new Date().toISOString(),
      }));
    });

    it('최종 적용 시 배치 결과를 반영해 execution_items 생성 요청을 보낸다', async () => {
      const user = userEvent.setup();
      const pending = mockPendingSend();
      schedulePreviewAPI.recompute.mockResolvedValue({
        proposalId: 900,
        horizonStart: '2026-08-10',
        horizonEnd: '2026-08-16',
        availabilityWindows: [],
        userOverrides: [],
        placedItems: [{
          proposalItemId: 1, title: '강의 1', placementType: 'TIME_FIXED',
          scheduledDate: '2026-08-10', scheduledStartAt: '2026-08-10T19:00:00', scheduledEndAt: '2026-08-10T19:30:00',
          reason: '기본 활동 시간대에 배치했어요',
        }],
        unplacedItems: [],
        computedAt: new Date().toISOString(),
      });
      proposalAPI.apply.mockResolvedValue({ proposalId: 900, status: 'APPLIED', items: [] });
      render(<AiPanelShell open contextLabel="오늘" onClose={() => {}} onApplied={() => {}} />);

      await sendProposalWithSchedulingCandidate(user, pending);
      await waitFor(() => expect(schedulePreviewAPI.recompute).toHaveBeenCalledTimes(1));

      await user.click(screen.getByRole('button', { name: '오늘에 적용' }));

      await waitFor(() => expect(proposalAPI.apply).toHaveBeenCalledTimes(1));
      const [, editedItems] = proposalAPI.apply.mock.calls[0];
      expect(editedItems).toEqual([
        expect.objectContaining({
          proposalItemId: 1,
          placementType: 'TIME_FIXED',
          scheduledDate: '2026-08-10',
          scheduledStartAt: '2026-08-10T19:00:00',
          scheduledEndAt: '2026-08-10T19:30:00',
        }),
      ]);
    });
  });
});
