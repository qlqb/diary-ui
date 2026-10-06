/**
 * 상담 교재 사진의 화면 계약.
 *
 *  - 과목 대화의 첨부 버튼은 "교재 사진 같이 보기 / 일정표 가져오기" 메뉴다. 과목이 없는 대화는 예전처럼 일정표로만 간다.
 *  - 사진은 고르자마자 한 장씩 올라가 읽힌다. 서버가 추정한 단원은 "추정"으로 보이고 [맞아요]·[바꾸기]로 정한다. 빼면 자료도 지운다.
 *  - 보낼 때 읽힌 사진의 id가 메시지에 실리고, 말풍선 아래 사진 칩으로 남는다. 사진만으로는 보내지 않는다(무엇을 볼지는 사용자 말).
 *  - 과목 대화에 붙여넣은 이미지는 교재 사진인지 일정표인지 묻는다.
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AiPanel from './AiPanel.jsx';
import { conversationAPI, consultPhotoAPI, materialStoreAPI, scheduleImportAPI } from '../api/api.js';

vi.mock('../api/api.js', () => ({
  conversationAPI: {
    list: vi.fn(), getMessages: vi.fn(), getContextSuggestions: vi.fn(), getScheduleSuggestions: vi.fn(),
    create: vi.fn(), sendMessage: vi.fn(), delete: vi.fn(),
  },
  proposalAPI: { get: vi.fn() },
  contextSuggestionAPI: { apply: vi.fn(), dismiss: vi.fn() },
  consultContextAPI: { update: vi.fn() },
  planAPI: { loadDraft: vi.fn() },
  scheduleImportAPI: { extract: vi.fn(), confirm: vi.fn() },
  scheduleSuggestionAPI: { apply: vi.fn(), dismiss: vi.fn(), applyBatch: vi.fn() },
  consultPhotoAPI: { upload: vi.fn(), result: vi.fn(), list: vi.fn(), setTopic: vi.fn(), deleteOriginal: vi.fn() },
  materialStoreAPI: { delete: vi.fn(), file: vi.fn() },
}));

const COURSE_SCOPE = {
  kind: 'consult', courseId: 7, conversationScope: 'PLAN', label: '영어회화 상담',
  placeholder: '상황을 이야기해 주세요', emptyHint: '편하게 이야기해 주세요.',
};
const GLOBAL_SCOPE = { ...COURSE_SCOPE, courseId: null, label: '전체 상담' };

const UNIT3 = { topicId: 503, title: 'Unit 3 I have to make hotel reservations', sourceTocSeq: 3 };
const UNIT4 = { topicId: 504, title: 'Unit 4 Did you have a good weekend?', sourceTocSeq: 4 };
const READ_PHOTO = {
  photoId: 91, status: 'READ', title: '교재 사진 p.24 · Unit 3 I have to make hotel reservations', printedPage: 24,
  headings: [], text: '1. You ____ show your passport.', topic: UNIT3, link: 'GUESSED', topics: [UNIT3, UNIT4],
  originalAvailable: true, originalExpiresAt: '2026-11-04T10:00:00',
};

function imageFile(name = 'page.png') {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type: 'image/png' });
}

async function render_(user, scope = COURSE_SCOPE) {
  render(<AiPanel scope={scope} variant="workspace" />);
  await waitFor(() => expect(conversationAPI.list).toHaveBeenCalled());
  return user;
}

async function attachPhoto(user) {
  await user.click(screen.getByRole('button', { name: '사진 첨부' }));
  expect(screen.getByRole('menuitem', { name: /교재 사진 같이 보기/ })).toBeInTheDocument();
  await user.upload(screen.getByLabelText('교재 사진 고르기'), imageFile());
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:preview');
  globalThis.URL.revokeObjectURL = vi.fn();
  conversationAPI.list.mockResolvedValue([]);
  conversationAPI.create.mockResolvedValue({ conversationId: 1 });
  conversationAPI.getContextSuggestions.mockResolvedValue([]);
  conversationAPI.getScheduleSuggestions.mockResolvedValue([]);
  consultPhotoAPI.upload.mockResolvedValue(READ_PHOTO);
});

describe('교재 사진 첨부', () => {
  it('과목 대화의 메뉴에서 사진을 고르면 대화를 하나 만들고 올려 읽은 결과와 추정 단원을 보인다', async () => {
    const user = await render_(userEvent.setup());
    await attachPhoto(user);

    const tray = await screen.findByRole('region', { name: '붙인 교재 사진' });
    expect(await within(tray).findByText(READ_PHOTO.title)).toBeInTheDocument();
    expect(within(tray).getByText(/Unit 3 I have to make hotel reservations · 목차 3번째 · 추정/)).toBeInTheDocument();
    expect(within(tray).getByText(/원본은 30일 뒤 지워져요/)).toBeInTheDocument();
    expect(conversationAPI.create).toHaveBeenCalledTimes(1);
    const [convId, , key] = consultPhotoAPI.upload.mock.calls[0];
    expect(convId).toBe(1);
    expect(key).toMatch(/^[A-Za-z0-9_-]{8,}$/);
  });

  it('[맞아요]는 추정 단원을 확인하고, [바꾸기]는 다른 단원을 고르게 한다', async () => {
    consultPhotoAPI.setTopic.mockResolvedValueOnce({ ...READ_PHOTO, link: 'CONFIRMED' })
      .mockResolvedValueOnce({ ...READ_PHOTO, topic: UNIT4, link: 'CONFIRMED' });
    const user = await render_(userEvent.setup());
    await attachPhoto(user);
    const tray = await screen.findByRole('region', { name: '붙인 교재 사진' });

    await user.click(await within(tray).findByRole('button', { name: '맞아요' }));
    expect(consultPhotoAPI.setTopic).toHaveBeenLastCalledWith(91, 503);
    await waitFor(() => expect(within(tray).queryByText(/· 추정/)).not.toBeInTheDocument());

    await user.click(within(tray).getByRole('button', { name: '바꾸기' }));
    await user.selectOptions(within(tray).getByRole('combobox', { name: '이 사진의 단원' }), '504');
    expect(consultPhotoAPI.setTopic).toHaveBeenLastCalledWith(91, 504);
    expect(await within(tray).findByText(/Unit 4 Did you have a good weekend/)).toBeInTheDocument();
  });

  it('보내면 읽힌 사진 id가 메시지에 실리고 트레이는 비고 말풍선 아래 사진 칩이 남는다', async () => {
    conversationAPI.sendMessage.mockImplementationOnce(async (_id, _payload, { onEvent }) => {
      onEvent('message.started', {});
      onEvent('message.completed', { responseType: 'CHAT', reply: '같이 볼게요.', quickReplies: [] });
    });
    const user = await render_(userEvent.setup());
    await attachPhoto(user);
    await screen.findByText(READ_PHOTO.title);

    await user.type(screen.getByRole('textbox'), '이 문제 모르겠어');
    await user.click(screen.getByRole('button', { name: '보내기' }));

    await waitFor(() => expect(conversationAPI.sendMessage).toHaveBeenCalled());
    const payload = conversationAPI.sendMessage.mock.calls[0][1];
    expect(payload).toMatchObject({ message: '이 문제 모르겠어', requestedAction: 'AUTO', photoIds: [91] });
    expect(screen.queryByRole('region', { name: '붙인 교재 사진' })).not.toBeInTheDocument();
    const chips = await screen.findByRole('list', { name: '붙인 교재 사진' });
    expect(within(chips).getByText(/교재 사진 p\.24/)).toBeInTheDocument();
    expect(within(chips).getByRole('button', { name: '원본 지우기' })).toBeInTheDocument();
  });

  it('서버가 메시지를 받기 전에 보내기가 실패하면 사진은 트레이에 그대로 남아 다시 보낼 수 있다', async () => {
    conversationAPI.sendMessage.mockRejectedValueOnce(new Error('연결이 끊겼어요'));
    const user = await render_(userEvent.setup());
    await attachPhoto(user);
    await screen.findByText(READ_PHOTO.title);

    await user.type(screen.getByRole('textbox'), '이 문제 모르겠어');
    await user.click(screen.getByRole('button', { name: '보내기' }));

    expect(await screen.findByText('연결이 끊겼어요')).toBeInTheDocument();
    const tray = screen.getByRole('region', { name: '붙인 교재 사진' });
    expect(within(tray).getByText(READ_PHOTO.title)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: '붙인 교재 사진' })).not.toBeInTheDocument();
  });

  it('사진만 있고 말이 없으면 보내지 않고 무엇을 볼지 묻는다', async () => {
    const user = await render_(userEvent.setup());
    await attachPhoto(user);
    await screen.findByText(READ_PHOTO.title);

    await user.click(screen.getByRole('button', { name: '보내기' }));

    expect(conversationAPI.sendMessage).not.toHaveBeenCalled();
    expect(await screen.findByText(/사진에서 무엇을 볼까요/)).toBeInTheDocument();
  });

  it('보내기 전에 빼면 트레이에서 사라지고 그 자료를 지운다', async () => {
    const user = await render_(userEvent.setup());
    await attachPhoto(user);
    await screen.findByText(READ_PHOTO.title);

    await user.click(screen.getByRole('button', { name: '사진 1 빼기' }));

    expect(materialStoreAPI.delete).toHaveBeenCalledWith(91);
    expect(screen.queryByText(READ_PHOTO.title)).not.toBeInTheDocument();
  });

  it('글자를 못 읽은 사진은 안내와 [다시]를 보이고 보낼 사진에 넣지 않는다', async () => {
    consultPhotoAPI.upload.mockResolvedValueOnce({ photoId: null, status: 'UNREADABLE', topics: [] });
    const user = await render_(userEvent.setup());
    await attachPhoto(user);

    expect(await screen.findByText(/교재 글자를 찾지 못했어요/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /다시/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '보내기' })).toBeDisabled();
  });

  it('과목 대화에 붙여넣은 이미지는 교재 사진인지 일정표인지 묻는다', async () => {
    scheduleImportAPI.extract.mockResolvedValue({ isScheduleTable: true, rows: [] });
    const user = await render_(userEvent.setup());
    const box = screen.getByRole('textbox');
    box.focus();
    const event = new Event('paste', { bubbles: true, cancelable: true });
    event.clipboardData = { items: [{ kind: 'file', type: 'image/png', getAsFile: () => imageFile() }] };
    box.dispatchEvent(event);

    const choice = await screen.findByRole('group', { name: '붙여넣은 이미지' });
    await user.click(within(choice).getByRole('button', { name: '일정표로 가져오기' }));
    await waitFor(() => expect(scheduleImportAPI.extract).toHaveBeenCalled());
    expect(consultPhotoAPI.upload).not.toHaveBeenCalled();
  });

  it('과목이 없는 대화는 예전처럼 일정표 첨부 버튼 하나다', async () => {
    await render_(userEvent.setup(), GLOBAL_SCOPE);
    expect(screen.getByRole('button', { name: '일정표 이미지 첨부' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '사진 첨부' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('교재 사진 고르기')).not.toBeInTheDocument();
  });
});
