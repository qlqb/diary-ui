import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AiPanelShell from './AiPanelShell.jsx';
import { conversationAPI } from '../api/api.js';

vi.mock('../api/api.js', () => ({
  conversationAPI: {
    create: vi.fn(),
    getMessages: vi.fn(),
    sendMessage: vi.fn(),
  },
  proposalAPI: {
    get: vi.fn(),
    apply: vi.fn(),
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
    conversationAPI.create.mockResolvedValue({ conversationId: 1 });
    conversationAPI.getMessages.mockResolvedValue([]);
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
});
