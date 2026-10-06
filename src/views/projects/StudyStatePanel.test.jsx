import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StudyStatePanel from './StudyStatePanel.jsx';
import { contextAPI, studyStateAPI } from '../../api/api.js';

vi.mock('../../api/api.js', () => ({
  studyStateAPI: { get: vi.fn() },
  contextAPI: { edit: vi.fn(), confirm: vi.fn(), remove: vi.fn() },
}));

/**
 * 프로젝트 사실 카드가 약속하는 것:
 *  - 상담이 채운 기억을 수업 진도 / 시험 범위 / 막힌 곳 / 해결한 것 / 그 밖으로 나눠 보인다(진도와 내 이해를 섞지 않는다).
 *  - 줄마다 출처(서버 문구)와 날짜, 이어진 단원(목차 순번 포함)을 글로 보인다. AI 추정에만 [맞아요]가 있다.
 *  - 입력 폼은 없다. 고치기는 내용과 함께 종류·단원을 바꿀 수 있고, 바꾼 칸만 보낸다.
 *  - 지우기는 그 자리에서 한 번 더 묻는다.
 *  - 서버 enum 원문을 보이지 않는다.
 */
const STATE = {
  courseId: 940,
  textbook: '「NEW English Conversation Arts 1」 · 형설출판사 — 사용자가 정함',
  facts: [
    { contextId: 1, kind: 'PROGRESS', text: '수업은 Unit 4까지 나갔다', topicId: null, evidenceType: 'STATED',
      sourceType: 'CONSULT_AUTO', sourceLabel: '사용자가 말함', saidAt: '2026-10-05T20:00:00' },
    { contextId: 2, kind: 'DIFFICULTY', text: 'have to 의문문이 헷갈린다', topicId: 503,
      topicTitle: 'Unit 3 I have to make hotel reservations', topicTocSeq: 3, evidenceType: 'STATED',
      sourceType: 'CONSULT_AUTO', sourceLabel: '사용자가 말함', saidAt: '2026-10-05T20:01:00' },
    { contextId: 3, kind: 'RESOLVED', text: 'have to 문장을 만들 수 있게 됐다', topicId: 503,
      topicTitle: 'Unit 3 I have to make hotel reservations', topicTocSeq: 3, evidenceType: 'SELF_REPORT',
      sourceType: 'CONSULT_AUTO', sourceLabel: '자기평가', help: 'GUIDED', saidAt: '2026-10-05T20:05:00' },
    { contextId: 4, kind: 'PREFERENCE', text: '발음 연습을 원하는 것 같다', topicId: null, evidenceType: 'INFERRED',
      sourceType: 'CONSULT_AUTO', sourceLabel: 'AI 추정 — 확인 전', saidAt: '2026-10-05T20:06:00' },
  ],
  classProgress: [],
  exclusions: [],
  topics: [
    { topicId: 501, title: 'Unit 1 What\'s your name?', sourceTocSeq: 1 },
    { topicId: 503, title: 'Unit 3 I have to make hotel reservations', sourceTocSeq: 3 },
    { topicId: 504, title: 'Unit 4 Did you have a good weekend?', sourceTocSeq: 4 },
    { topicId: 510, title: 'Unit 10 What\'s your name?', sourceTocSeq: 10 },
  ],
};

describe('StudyStatePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    studyStateAPI.get.mockResolvedValue(STATE);
  });

  it('진도와 막힘·해결을 다른 묶음으로, 출처·날짜·단원을 글로 보인다', async () => {
    render(<StudyStatePanel courseId={940} />);

    expect(await screen.findByText('수업은 Unit 4까지 나갔다')).toBeInTheDocument();
    expect(screen.getByText(/형설출판사 — 사용자가 정함/)).toBeInTheDocument();
    const progress = screen.getByRole('group', { name: '수업 진도' });
    expect(within(progress).getByText('수업은 Unit 4까지 나갔다')).toBeInTheDocument();
    expect(within(progress).getByText(/내가 이해했다는 뜻은 아니에요/)).toBeInTheDocument();
    const stuck = screen.getByRole('group', { name: '막힌 곳' });
    expect(within(stuck).getByText('Unit 3 I have to make hotel reservations · 목차 3번째')).toBeInTheDocument();
    expect(within(stuck).getByText('10월 5일')).toBeInTheDocument();
    const solved = screen.getByRole('group', { name: '해결한 것' });
    expect(within(solved).getByText('도움받아 해결')).toBeInTheDocument();
    expect(within(solved).getByText('자기평가')).toBeInTheDocument();
    // 서버 enum 원문은 보이지 않는다.
    expect(screen.queryByText(/DIFFICULTY|RESOLVED|GUIDED|INFERRED/)).not.toBeInTheDocument();
    // 입력 폼이 없다(기억은 상담이 채운다).
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('AI 추정에만 맞아요가 있고, 누르면 확인한 뒤 다시 읽는다', async () => {
    contextAPI.confirm.mockResolvedValue({ context: {}, staleDraftIds: [41] });
    render(<StudyStatePanel courseId={940} />);
    await screen.findByText('발음 연습을 원하는 것 같다');

    expect(screen.getAllByRole('button', { name: /^맞아요/ })).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: '맞아요: 발음 연습을 원하는 것 같다' }));

    expect(contextAPI.confirm).toHaveBeenCalledWith(4);
    await waitFor(() => expect(studyStateAPI.get).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/초안은 '갱신 필요'로 표시돼요/)).toBeInTheDocument();
  });

  it('고치기는 내용과 함께 단원을 바꿀 수 있고 바꾼 칸만 보낸다 — 같은 제목의 단원은 목차 순번으로 가른다', async () => {
    contextAPI.edit.mockResolvedValue({ context: {}, staleDraftIds: [] });
    render(<StudyStatePanel courseId={940} />);
    await screen.findByText('have to 의문문이 헷갈린다');

    await userEvent.click(screen.getByRole('button', { name: '고치기: have to 의문문이 헷갈린다' }));
    const unitSelect = screen.getByRole('combobox', { name: /단원/ });
    expect(within(unitSelect).getByRole('option', { name: "Unit 1 What's your name? · 목차 1번째" })).toBeInTheDocument();
    expect(within(unitSelect).getByRole('option', { name: "Unit 10 What's your name? · 목차 10번째" })).toBeInTheDocument();
    await userEvent.selectOptions(unitSelect, '504');
    const text = screen.getByRole('textbox', { name: '내용 고치기' });
    await userEvent.clear(text);
    await userEvent.type(text, '과거시제 질문이 헷갈린다');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(contextAPI.edit).toHaveBeenCalledWith(2, { content: '과거시제 질문이 헷갈린다', topicId: 504 });
  });

  it('해결의 도움 수준을 말하지 않음으로 되돌리면 지우라고 보낸다', async () => {
    contextAPI.edit.mockResolvedValue({ context: {}, staleDraftIds: [] });
    render(<StudyStatePanel courseId={940} />);
    await screen.findByText('have to 문장을 만들 수 있게 됐다');

    await userEvent.click(screen.getByRole('button', { name: '고치기: have to 문장을 만들 수 있게 됐다' }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /도움/ }), '');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(contextAPI.edit).toHaveBeenCalledWith(3, { content: 'have to 문장을 만들 수 있게 됐다', help: 'NONE' });
  });

  it('지우기는 그 자리에서 한 번 더 묻고, 그대로 두기면 보내지 않는다', async () => {
    contextAPI.remove.mockResolvedValue(null);
    render(<StudyStatePanel courseId={940} />);
    await screen.findByText('수업은 Unit 4까지 나갔다');

    await userEvent.click(screen.getByRole('button', { name: '지우기: 수업은 Unit 4까지 나갔다' }));
    const confirm = screen.getByRole('group', { name: '지우기 확인' });
    await userEvent.click(within(confirm).getByRole('button', { name: '그대로 두기' }));
    expect(contextAPI.remove).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: '지우기: 수업은 Unit 4까지 나갔다' }));
    await userEvent.click(within(screen.getByRole('group', { name: '지우기 확인' })).getByRole('button', { name: '지우기' }));
    expect(contextAPI.remove).toHaveBeenCalledWith(1);
  });

  it('비어 있으면 상담에서 말하면 모인다고 안내하고, 실패하면 다시 불러오기를 준다', async () => {
    studyStateAPI.get.mockResolvedValueOnce({ ...STATE, facts: [] });
    const { unmount } = render(<StudyStatePanel courseId={940} />);
    expect(await screen.findByText(/상담에서 "수업은 Unit 4까지 나갔어"/)).toBeInTheDocument();
    unmount();

    studyStateAPI.get.mockRejectedValueOnce(new Error('서버 오류'));
    render(<StudyStatePanel courseId={940} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('서버 오류');
    expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeInTheDocument();
  });
});
