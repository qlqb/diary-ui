import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../api/api.js', () => ({
  contextAPI: { list: vi.fn(), update: vi.fn(), confirm: vi.fn(), remove: vi.fn() },
}));

import MemoryView from './MemoryView.jsx';
import { contextAPI } from '../../api/api.js';

const ITEMS = [
  { contextId: 1, content: '평일 저녁 2시간쯤 쓸 수 있어', status: 'ACTIVE', evidenceType: 'STATED',
    courseId: null, courseTitle: null, scopeStart: null, scopeEnd: null, confirmedAt: '2026-09-18T21:10:00', updatedAt: '2026-09-18T21:10:00' },
  { contextId: 2, content: '연결 리스트는 애매해', status: 'ACTIVE', evidenceType: 'SELF_REPORT',
    courseId: 7, courseTitle: '자료구조', scopeStart: null, scopeEnd: null, confirmedAt: '2026-09-17T09:00:00', updatedAt: '2026-09-17T09:00:00' },
  { contextId: 3, content: '30분짜리 항목은 대부분 끝냈어요', status: 'ACTIVE', evidenceType: 'OBSERVED',
    courseId: 7, courseTitle: '자료구조', scopeStart: '2026-09-08', scopeEnd: '2026-09-14', confirmedAt: null, updatedAt: '2026-09-15T08:00:00' },
  { contextId: 4, content: '주말에는 공부를 거의 안 하는 것 같아요', status: 'ACTIVE', evidenceType: 'INFERRED',
    courseId: null, courseTitle: null, scopeStart: null, scopeEnd: null, confirmedAt: null, updatedAt: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  contextAPI.list.mockResolvedValue(ITEMS);
});

describe('MemoryView', () => {
  it('출처별 네 묶음으로 나누고, 범위와 마지막 확인 시각을 보여 준다', async () => {
    render(<MemoryView />);

    const stated = await screen.findByRole('region', { name: '내가 말한 것' });
    expect(within(stated).getByText('평일 저녁 2시간쯤 쓸 수 있어')).toBeInTheDocument();
    expect(within(stated).getByText('모든 프로젝트')).toBeInTheDocument();
    expect(within(stated).getByText('마지막 확인 9월 18일 21:10')).toBeInTheDocument();

    expect(within(screen.getByRole('region', { name: '내 자기평가' })).getByText('프로젝트: 자료구조')).toBeInTheDocument();
    const observed = screen.getByRole('region', { name: '실행 기록에서 확인' });
    expect(within(observed).getByText('프로젝트: 자료구조 · 9월 8일 ~ 9월 14일')).toBeInTheDocument();
    const inferred = screen.getByRole('region', { name: 'AI 추정(확인 전)' });
    expect(within(inferred).getByText('아직 확인한 적 없음')).toBeInTheDocument();
  });

  it('개발 용어(필드 이름·enum 원문)를 화면에 내보내지 않는다', async () => {
    const { container } = render(<MemoryView />);
    await screen.findByText('평일 저녁 2시간쯤 쓸 수 있어');
    expect(container.textContent).not.toMatch(/STATED|SELF_REPORT|OBSERVED|INFERRED|ACTIVE|contextId|evidenceType|courseId/);
  });

  it('[맞아요]는 AI 추정에만 있고, 누르면 확인 요청을 보낸다', async () => {
    const user = userEvent.setup();
    contextAPI.confirm.mockResolvedValue({ contextId: 4, staleDraftIds: [] });
    render(<MemoryView />);
    await screen.findByText('평일 저녁 2시간쯤 쓸 수 있어');

    expect(screen.getAllByRole('button', { name: /^맞아요:/ })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: '맞아요: 주말에는 공부를 거의 안 하는 것 같아요' }));

    expect(contextAPI.confirm).toHaveBeenCalledWith(4);
    await waitFor(() => expect(contextAPI.list).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/이 내용을 쓴 계획 초안이 있어요/)).not.toBeInTheDocument();
  });

  it('고치기: 그 자리에서 고쳐 저장하고, 영향받는 초안이 있으면 알린다', async () => {
    const user = userEvent.setup();
    const onOpenDraft = vi.fn();
    contextAPI.update.mockResolvedValue({ contextId: 9, staleDraftIds: [55] });
    render(<MemoryView onOpenDraft={onOpenDraft} />);
    await screen.findByText('연결 리스트는 애매해');

    await user.click(screen.getByRole('button', { name: '고치기: 연결 리스트는 애매해' }));
    const input = screen.getByLabelText('내용 고치기');
    await user.clear(input);
    await user.type(input, '연결 리스트는 이제 알아');
    await user.click(screen.getByRole('button', { name: '저장' }));

    expect(contextAPI.update).toHaveBeenCalledWith(2, '연결 리스트는 이제 알아');
    expect(await screen.findByText(
      "이 내용을 쓴 계획 초안이 있어요. 초안은 '갱신 필요'로 표시돼요 — 이미 적용한 일정은 바뀌지 않아요.",
    )).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '초안 열기' }));
    expect(onOpenDraft).toHaveBeenCalledWith(55);
  });

  it('지우기: 화면을 막는 창 없이 그 줄에서 한 번 더 묻고, 그대로 둘 수 있다', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm');
    contextAPI.remove.mockResolvedValue(null);
    render(<MemoryView />);
    await screen.findByText('평일 저녁 2시간쯤 쓸 수 있어');

    await user.click(screen.getByRole('button', { name: '지우기: 평일 저녁 2시간쯤 쓸 수 있어' }));
    const ask = screen.getByRole('group', { name: '지우기 확인' });
    await user.click(within(ask).getByRole('button', { name: '그대로 두기' }));
    expect(contextAPI.remove).not.toHaveBeenCalled();
    expect(screen.queryByRole('group', { name: '지우기 확인' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '지우기: 평일 저녁 2시간쯤 쓸 수 있어' }));
    await user.click(within(screen.getByRole('group', { name: '지우기 확인' })).getByRole('button', { name: '지우기' }));

    expect(contextAPI.remove).toHaveBeenCalledWith(1);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(await screen.findByText('지웠어요. AI가 더는 참고하지 않아요.')).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it('변경이 실패하면 그 줄에 이유를 남기고 입력을 지우지 않는다', async () => {
    const user = userEvent.setup();
    contextAPI.update.mockRejectedValue(new Error('이미 바뀐 내용이에요'));
    render(<MemoryView />);
    await screen.findByText('연결 리스트는 애매해');

    await user.click(screen.getByRole('button', { name: '고치기: 연결 리스트는 애매해' }));
    await user.type(screen.getByLabelText('내용 고치기'), ' (수정)');
    await user.click(screen.getByRole('button', { name: '저장' }));

    expect(await screen.findByText('이미 바뀐 내용이에요')).toBeInTheDocument();
    expect(screen.getByLabelText('내용 고치기')).toHaveValue('연결 리스트는 애매해 (수정)');
  });

  it('아무것도 없으면 무엇을 하면 쌓이는지 말한다', async () => {
    contextAPI.list.mockResolvedValue([]);
    render(<MemoryView />);
    expect(await screen.findByText('아직 AI가 기억해 둔 내용이 없어요')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '내가 말한 것' })).not.toBeInTheDocument();
  });
});
