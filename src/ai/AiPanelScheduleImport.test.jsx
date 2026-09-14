/**
 * 이미지에서 일정 가져오기의 패널 쪽 배선.
 *
 * 여기서 지키는 선 넷:
 * - 붙여넣기가 실제로 읽기를 시작할 것. 캡처해서 바로 붙여넣는 것이 가장 흔한 경로다.
 * - 대화가 없으면 먼저 만들 것. 후보는 대화에 매달린다.
 * - [모두 적용]이 한 번의 요청일 것. 카드마다 따로 부르면 절반만 들어간 상태가 생긴다.
 * - 후보가 하나면 그 줄을 띄우지 않을 것.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AiPanel from './AiPanel.jsx';
import { conversationAPI, scheduleImportAPI, scheduleSuggestionAPI } from '../api/api.js';

vi.mock('../api/api.js', () => ({
  conversationAPI: {
    list: vi.fn(), getMessages: vi.fn(), getContextSuggestions: vi.fn(),
    getScheduleSuggestions: vi.fn(), create: vi.fn(), sendMessage: vi.fn(), delete: vi.fn(),
  },
  proposalAPI: { get: vi.fn() },
  contextSuggestionAPI: { apply: vi.fn(), dismiss: vi.fn() },
  scheduleSuggestionAPI: { apply: vi.fn(), dismiss: vi.fn(), applyBatch: vi.fn() },
  scheduleImportAPI: { extract: vi.fn(), confirm: vi.fn() },
}));

const SCOPE = {
  kind: 'today',
  courseId: null,
  conversationScope: 'TODAY',
  label: '오늘 실행과 일정',
  placeholder: '지금 상황을 말해주세요',
  emptyHint: '편하게 이야기해보세요.',
};

const EXTRACTION = {
  raw: { isScheduleTable: true, title: '근무표', scheduleColumns: ['월'], legend: {}, rows: [] },
  resolvedPeriod: { startDate: '2026-09-07', endDate: '2026-09-07' },
  periodMissing: false,
  periodWeekdayMismatch: false,
  columnsUnrecognized: false,
  columnsNormalized: false,
  matchedRowIndex: 0,
  unresolvedCodes: [],
  rows: [{
    index: 0, name: '본인', tag: 'PT', rowInvalid: false,
    cells: [{
      date: '2026-09-07', kind: 'WORK', start: '17:00', end: '23:00',
      raw: '17~23', code: null, crossesMidnight: false,
    }],
  }],
};

const suggestion = (id) => ({
  suggestionId: id,
  kind: 'COMMITMENT',
  status: 'PROPOSED',
  payload: { title: '근무', startAt: '2026-09-07T17:00', endAt: '2026-09-07T23:00' },
});

beforeEach(() => {
  vi.clearAllMocks();
  conversationAPI.list.mockResolvedValue([]);
  conversationAPI.getContextSuggestions.mockResolvedValue([]);
  conversationAPI.getScheduleSuggestions.mockResolvedValue([]);
});

function imageFile() {
  return new File(['fake-bytes'], 'schedule.png', { type: 'image/png' });
}

/** 클립보드 이미지 붙여넣기를 흉내낸다. jsdom에는 실제 클립보드가 없다. */
async function pasteImage(user, file) {
  const textarea = screen.getByPlaceholderText(SCOPE.placeholder);
  textarea.focus();
  const event = new Event('paste', { bubbles: true, cancelable: true });
  event.clipboardData = { items: [{ kind: 'file', type: file.type, getAsFile: () => file }] };
  await user.click(textarea);
  textarea.dispatchEvent(event);
}

describe('AiPanel — 이미지에서 일정 가져오기', () => {
  it('첨부 버튼으로 고른 이미지를 읽는다', async () => {
    const user = userEvent.setup();
    conversationAPI.create.mockResolvedValue({ conversationId: 9 });
    scheduleImportAPI.extract.mockResolvedValue(EXTRACTION);

    render(<AiPanel scope={SCOPE} />);
    await waitFor(() => expect(conversationAPI.list).toHaveBeenCalled());

    const input = document.querySelector('input[type="file"]');
    await user.upload(input, imageFile());

    await waitFor(() => expect(scheduleImportAPI.extract).toHaveBeenCalledWith(9, expect.any(File)));
    // 대화가 없었으므로 먼저 만든다 — 후보가 매달릴 곳이 필요하다.
    expect(conversationAPI.create).toHaveBeenCalledWith('TODAY', null);
    expect(await screen.findByRole('dialog', { name: '이미지에서 일정 가져오기' })).toBeInTheDocument();
  });

  it('입력창에 이미지를 붙여넣으면 그대로 읽는다', async () => {
    const user = userEvent.setup();
    conversationAPI.create.mockResolvedValue({ conversationId: 9 });
    scheduleImportAPI.extract.mockResolvedValue(EXTRACTION);

    render(<AiPanel scope={SCOPE} />);
    await waitFor(() => expect(conversationAPI.list).toHaveBeenCalled());

    await pasteImage(user, imageFile());

    await waitFor(() => expect(scheduleImportAPI.extract).toHaveBeenCalledTimes(1));
  });

  it('글자를 붙여넣는 것은 건드리지 않는다', async () => {
    const user = userEvent.setup();
    render(<AiPanel scope={SCOPE} />);
    await waitFor(() => expect(conversationAPI.list).toHaveBeenCalled());

    const textarea = screen.getByPlaceholderText(SCOPE.placeholder);
    await user.click(textarea);
    await user.paste('내일 세 시에 약속');

    expect(scheduleImportAPI.extract).not.toHaveBeenCalled();
    expect(textarea).toHaveValue('내일 세 시에 약속');
  });

  it('확정하면 후보 카드가 뜨고 다이얼로그가 닫힌다', async () => {
    const user = userEvent.setup();
    conversationAPI.create.mockResolvedValue({ conversationId: 9 });
    scheduleImportAPI.extract.mockResolvedValue(EXTRACTION);
    scheduleImportAPI.confirm.mockResolvedValue([suggestion(1), suggestion(2)]);

    render(<AiPanel scope={SCOPE} />);
    await waitFor(() => expect(conversationAPI.list).toHaveBeenCalled());
    await user.upload(document.querySelector('input[type="file"]'), imageFile());
    await screen.findByRole('dialog');

    await user.click(screen.getByRole('button', { name: '가져오기' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('일정 후보 2개')).toBeInTheDocument();
    // 확정 요청에는 표 원문만 실린다.
    const [, body] = scheduleImportAPI.confirm.mock.calls[0];
    expect(body.raw).toEqual(EXTRACTION.raw);
    expect(body).not.toHaveProperty('cells');
    expect(body.idempotencyKey).toEqual(expect.any(String));
  });

  it('[모두 적용]은 한 번의 요청이다 — 절반만 들어간 상태를 만들지 않는다', async () => {
    const user = userEvent.setup();
    conversationAPI.getScheduleSuggestions.mockResolvedValue([suggestion(1), suggestion(2), suggestion(3)]);
    conversationAPI.list.mockResolvedValue([
      { conversationId: 5, title: '근무표', lastMessageAt: '2026-09-07T10:00:00', pendingProposalCount: 0 },
    ]);
    conversationAPI.getMessages.mockResolvedValue([]);
    scheduleSuggestionAPI.applyBatch.mockResolvedValue([]);

    render(<AiPanel scope={SCOPE} />);
    await screen.findByText('일정 후보 3개');

    await user.click(screen.getByRole('button', { name: /모두 적용/ }));

    await waitFor(() => expect(scheduleSuggestionAPI.applyBatch).toHaveBeenCalledWith([1, 2, 3]));
    expect(scheduleSuggestionAPI.apply).not.toHaveBeenCalled();
  });

  it('후보가 하나면 일괄 적용 줄을 띄우지 않는다', async () => {
    conversationAPI.getScheduleSuggestions.mockResolvedValue([suggestion(1)]);
    conversationAPI.list.mockResolvedValue([
      { conversationId: 5, title: '근무표', lastMessageAt: '2026-09-07T10:00:00', pendingProposalCount: 0 },
    ]);
    conversationAPI.getMessages.mockResolvedValue([]);

    render(<AiPanel scope={SCOPE} />);
    await waitFor(() => expect(conversationAPI.getScheduleSuggestions).toHaveBeenCalled());

    expect(screen.queryByRole('button', { name: /모두 적용/ })).not.toBeInTheDocument();
  });

  it('읽지 못하면 이유만 말하고 아무것도 만들지 않는다', async () => {
    const user = userEvent.setup();
    conversationAPI.create.mockResolvedValue({ conversationId: 9 });
    scheduleImportAPI.extract.mockRejectedValue(new Error('일정표로 보이지 않습니다'));

    render(<AiPanel scope={SCOPE} />);
    await waitFor(() => expect(conversationAPI.list).toHaveBeenCalled());
    await user.upload(document.querySelector('input[type="file"]'), imageFile());

    expect(await screen.findByText('일정표로 보이지 않습니다')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
