/**
 * 대화 삭제의 계약을 고정한다.
 *
 * 가장 중요한 것: 지금 보고 있는 대화를 지우면 화면에 그 대화의 흔적이 하나도 남지 않아야
 * 한다. 이력이 남아 있으면 "지웠는데 아직 보인다"가 되고, 진행 중이던 스트림이 살아 있으면
 * 지운 대화에 응답이 계속 흘러든다.
 *
 * 그리고 행 전체가 button이면 삭제 button을 그 안에 중첩하게 된다 — 열기와 삭제는 각각
 * 독립된 조작이어야 한다.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AiPanel from './AiPanel.jsx';
import { conversationAPI } from '../api/api.js';

vi.mock('../api/api.js', () => ({
  conversationAPI: {
    list: vi.fn(), getMessages: vi.fn(), getContextSuggestions: vi.fn(),
    create: vi.fn(), sendMessage: vi.fn(), delete: vi.fn(),
  },
  proposalAPI: { get: vi.fn() },
  contextSuggestionAPI: { apply: vi.fn(), dismiss: vi.fn() },
}));

const SCOPE = {
  kind: 'today',
  courseId: null,
  conversationScope: 'TODAY',
  label: '오늘 실행과 일정',
  placeholder: '지금 상황을 말해주세요',
  emptyHint: '편하게 이야기해보세요.',
};

const CONV_A = { conversationId: 1, title: '늦게 일어났어', lastMessageAt: '2026-08-15T10:00:00', pendingProposalCount: 0 };
const CONV_B = { conversationId: 2, title: '내일 계획', lastMessageAt: '2026-08-14T10:00:00', pendingProposalCount: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  conversationAPI.getContextSuggestions.mockResolvedValue([]);
  conversationAPI.delete.mockResolvedValue(null);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * 대화 목록 화면까지 열어준다. 이 시점까지 conversationAPI.list는 두 번 불린다
 * (scope 진입 시 한 번, 목록 화면을 열 때 한 번) — 삭제 후의 목록은 이 함수가 끝난 뒤
 * mockResolvedValue로 바꿔서 지정한다.
 */
async function openList(user, props = {}) {
  render(<AiPanel scope={SCOPE} {...props} />);
  await waitFor(() => expect(conversationAPI.list).toHaveBeenCalled());
  await user.click(screen.getByRole('button', { name: '대화 목록' }));
  return screen.findByRole('button', { name: /늦게 일어났어/ });
}

describe('대화 목록의 삭제 액션', () => {
  it('열기와 삭제를 각각 조작할 수 있고 button을 중첩하지 않는다', async () => {
    conversationAPI.list.mockResolvedValue([CONV_A, CONV_B]);
    conversationAPI.getMessages.mockResolvedValue([]);
    const user = userEvent.setup();
    await openList(user);

    const deleteButtons = screen.getAllByRole('button', { name: '대화 삭제' });
    expect(deleteButtons).toHaveLength(2);
    // 삭제 버튼이 대화 열기 버튼 안에 들어있으면 안 된다.
    deleteButtons.forEach((btn) => {
      expect(btn.closest('button')).toBe(btn);
    });
  });

  it('확인을 거절하면 아무것도 지우지 않는다', async () => {
    conversationAPI.list.mockResolvedValue([CONV_A, CONV_B]);
    conversationAPI.getMessages.mockResolvedValue([]);
    window.confirm.mockReturnValue(false);
    const user = userEvent.setup();
    await openList(user);

    await user.click(screen.getAllByRole('button', { name: '대화 삭제' })[1]);

    expect(conversationAPI.delete).not.toHaveBeenCalled();
  });

  it('비활성 대화를 지우면 그 대화만 목록에서 사라지고 보고 있던 대화는 그대로다', async () => {
    conversationAPI.list.mockResolvedValue([CONV_A, CONV_B]);
    conversationAPI.getMessages.mockResolvedValue([
      { messageId: 11, role: 'USER', content: '늦게 일어났어', responseType: null, proposalId: null },
    ]);
    const user = userEvent.setup();
    await openList(user);

    conversationAPI.list.mockResolvedValue([CONV_A]);
    await user.click(screen.getAllByRole('button', { name: '대화 삭제' })[1]);

    await waitFor(() => expect(conversationAPI.delete).toHaveBeenCalledWith(2));
    await waitFor(() => expect(screen.queryByRole('button', { name: /내일 계획/ })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /늦게 일어났어/ })).toBeInTheDocument();
    // 보고 있던 대화(A)를 다시 읽지 않는다 — 활성 대화는 건드리지 않았다.
    expect(conversationAPI.getMessages).toHaveBeenCalledTimes(1);
  });
});

describe('보고 있는 대화를 삭제할 때', () => {
  it('다른 대화가 있으면 가장 최근 대화를 열고 지운 대화 이력은 남기지 않는다', async () => {
    conversationAPI.list.mockResolvedValue([CONV_A, CONV_B]);
    conversationAPI.getMessages
      .mockResolvedValueOnce([{ messageId: 11, role: 'USER', content: '지운 대화의 말', responseType: null, proposalId: null }])
      .mockResolvedValue([{ messageId: 21, role: 'USER', content: '남은 대화의 말', responseType: null, proposalId: null }]);
    const user = userEvent.setup();
    await openList(user);

    conversationAPI.list.mockResolvedValue([CONV_B]);
    // A가 활성 대화다(목록 첫 항목이 자동 선택된다).
    await user.click(screen.getAllByRole('button', { name: '대화 삭제' })[0]);

    await waitFor(() => expect(conversationAPI.delete).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.getByText('남은 대화의 말')).toBeInTheDocument());
    expect(screen.queryByText('지운 대화의 말')).not.toBeInTheDocument();
  });

  it('남은 대화가 없으면 새 대화 준비 상태가 되고 이력·초안이 화면에 남지 않는다', async () => {
    conversationAPI.list.mockResolvedValue([CONV_A]);
    conversationAPI.getMessages.mockResolvedValue([
      { messageId: 11, role: 'USER', content: '지운 대화의 말', responseType: null, proposalId: null },
    ]);
    const onDiscardDraft = vi.fn();
    const user = userEvent.setup();
    await openList(user, {
      draft: { proposalId: 5, cards: [{ proposalItemId: 51, excluded: false }] },
      onDiscardDraft,
    });

    conversationAPI.list.mockResolvedValue([]);
    await user.click(screen.getByRole('button', { name: '대화 삭제' }));

    await waitFor(() => expect(conversationAPI.delete).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.getByText(SCOPE.emptyHint)).toBeInTheDocument());
    expect(screen.queryByText('지운 대화의 말')).not.toBeInTheDocument();
    // 지운 대화가 만든 적용 전 초안도 함께 치운다.
    expect(onDiscardDraft).toHaveBeenCalled();
  });

  it('삭제에 실패하면 대화를 그대로 두고 오류만 알린다', async () => {
    conversationAPI.list.mockResolvedValue([CONV_A]);
    conversationAPI.getMessages.mockResolvedValue([
      { messageId: 11, role: 'USER', content: '지우려던 대화', responseType: null, proposalId: null },
    ]);
    conversationAPI.delete.mockRejectedValue(new Error('삭제하지 못했습니다.'));
    const user = userEvent.setup();
    await openList(user);

    await user.click(screen.getByRole('button', { name: '대화 삭제' }));

    await waitFor(() => expect(screen.getByText('삭제하지 못했습니다.')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /늦게 일어났어/ })).toBeInTheDocument();
  });
});
