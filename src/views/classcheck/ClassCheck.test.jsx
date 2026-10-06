import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ClassCheckPanel from './ClassCheckPanel.jsx';
import TodayClassCheck from './TodayClassCheck.jsx';
import { classSessionAPI } from '../../api/api.js';
import { latestPending, optionLabel, sessionLabel } from '../../lib/classCheck.js';

vi.mock('../../api/api.js', () => ({
  classSessionAPI: { pending: vi.fn(), confirm: vi.fn(), setPrompt: vi.fn() },
}));

/**
 * 수업 확인 화면이 약속하는 것:
 *  - 기본값을 미리 골라 두고 [맞아요] 한 번이면 그 구간으로 저장한다.
 *  - [고치기]로 구간을 고르거나 "아직 자료가 안 올라왔어요"·"휴강"·"결석"을 고른다.
 *  - 기본값이 있는 회차가 여럿이면 [모두 맞아요] 한 번에 보낸다.
 *  - 다른 곳에서 먼저 바꿨으면(409) 다시 불러오고 그렇게 말한다.
 *  - 오늘 화면은 과목들 중 가장 최근 회차 하나만, [나중에]는 하루 접는다.
 */
const S1 = { ref: 's:11', sectionId: 11, materialId: 5, materialName: 'ch03.pdf', title: 'EC2와 SSH', pageFrom: 12, pageTo: 25 };
const S2 = { ref: 's:12', sectionId: 12, materialId: 5, materialName: 'ch03.pdf', title: 'Route 53', pageFrom: 26, pageTo: 34 };
const session = (date, defaults = [S1], revision = 0) => ({
  routineId: 3, sourceDate: date, startAt: `${date}T09:00:00`, endAt: `${date}T10:30:00`, moved: false, revision, defaults,
});
const VIEW = { courseId: 7, promptEnabled: true, sessions: [session('2026-10-05'), session('2026-10-06', [S2])], options: [S1, S2] };

describe('수업 확인', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    classSessionAPI.pending.mockResolvedValue(VIEW);
    classSessionAPI.confirm.mockResolvedValue([]);
  });

  it('라벨은 날짜·요일·시각과 자료·구간·쪽으로 보인다', () => {
    expect(sessionLabel(session('2026-10-06'))).toBe('10/6(화) 09:00');
    expect(optionLabel(S1)).toBe('ch03.pdf · EC2와 SSH (12~25쪽)');
  });

  it('맞아요는 기본값 구간으로 저장하고 다시 불러온다', async () => {
    render(<ClassCheckPanel courseId={7} />);
    const first = await screen.findByLabelText(/10\/5\(월\) 09:00 수업 어디까지/);
    await userEvent.click(first.querySelector('button'));

    await waitFor(() => expect(classSessionAPI.confirm).toHaveBeenCalledWith(7, [{
      routineId: 3, sourceDate: '2026-10-05', expectedRevision: 0, action: 'COVERED',
      sources: [{ kind: 'SECTION', ref: 's:11', from: null, to: null }],
    }]));
    expect(classSessionAPI.pending).toHaveBeenCalledTimes(2);
  });

  it('고치기에서 휴강을 고르면 원천 없이 휴강으로 저장한다', async () => {
    render(<ClassCheckPanel courseId={7} />);
    const first = await screen.findByLabelText(/10\/5\(월\)/);
    await userEvent.click(first.querySelectorAll('button')[1]);
    await userEvent.click(screen.getAllByLabelText('휴강했어요')[0]);
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(classSessionAPI.confirm).toHaveBeenCalledWith(7, [expect.objectContaining({
      action: 'CANCELLED', sources: [],
    })]));
  });

  it('모두 맞아요는 기본값 있는 회차를 한 요청으로 보낸다', async () => {
    render(<ClassCheckPanel courseId={7} />);
    await userEvent.click(await screen.findByRole('button', { name: '모두 맞아요' }));

    await waitFor(() => expect(classSessionAPI.confirm).toHaveBeenCalledTimes(1));
    expect(classSessionAPI.confirm.mock.calls[0][1]).toHaveLength(2);
  });

  it('409면 다시 불러왔다고 말한다', async () => {
    const err = Object.assign(new Error('충돌'), { status: 409 });
    classSessionAPI.confirm.mockRejectedValue(err);
    render(<ClassCheckPanel courseId={7} />);
    const first = await screen.findByLabelText(/10\/5\(월\)/);
    await userEvent.click(first.querySelector('button'));

    expect(await screen.findByText('다른 곳에서 먼저 바뀌었어요. 다시 불러왔어요.')).toBeInTheDocument();
  });

  it('수업 후 확인 묻기를 끌 수 있고 끈 과목은 묻지 않는다고 말한다', async () => {
    render(<ClassCheckPanel courseId={7} />);
    await userEvent.click(await screen.findByLabelText(/수업 후 확인 묻기/));
    expect(classSessionAPI.setPrompt).toHaveBeenCalledWith(7, false);

    classSessionAPI.pending.mockResolvedValue({ ...VIEW, promptEnabled: false, sessions: [] });
    render(<ClassCheckPanel courseId={8} />);
    expect(await screen.findByText('이 과목은 수업 후 확인을 묻지 않아요.')).toBeInTheDocument();
  });

  it('오늘 카드는 과목들 중 가장 최근 회차 하나이고 나중에는 그 회차를 접는다', async () => {
    classSessionAPI.pending.mockImplementation(async (courseId) => (courseId === 7 ? VIEW
      : { courseId: 9, promptEnabled: true, sessions: [session('2026-10-04')], options: [S1] }));
    render(<TodayClassCheck projectTitles={{ 7: '네트워크', 9: '자료구조' }} />);

    expect(await screen.findByText('네트워크 · 10/6(화) 09:00 수업 어디까지 했어요?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '나중에' }));
    expect(await screen.findByText('네트워크 · 10/5(월) 09:00 수업 어디까지 했어요?')).toBeInTheDocument();
  });

  it('보강은 옮긴 날의 날짜·요일·시각으로 보인다', () => {
    expect(sessionLabel({ routineId: 3, sourceDate: '2026-10-05', startAt: '2026-10-06T14:00:00', moved: true }))
      .toBe('10/6(화) 14:00 · 보강');
  });

  it('409면 다시 불러온 새 상태를 그리고, 다시 불러오지 못하면 다시 불러오기를 보인다', async () => {
    classSessionAPI.confirm.mockRejectedValue(Object.assign(new Error('충돌'), { status: 409 }));
    classSessionAPI.pending
      .mockResolvedValueOnce(VIEW)
      .mockResolvedValueOnce({ ...VIEW, sessions: [session('2026-10-06', [S2], 1)] });
    render(<ClassCheckPanel courseId={7} />);
    await userEvent.click((await screen.findByLabelText(/10\/5\(월\)/)).querySelector('button'));

    expect(await screen.findByText('다른 곳에서 먼저 바뀌었어요. 다시 불러왔어요.')).toBeInTheDocument();
    expect(screen.queryByLabelText(/10\/5\(월\)/)).not.toBeInTheDocument();

    classSessionAPI.pending.mockRejectedValue(new Error('네트워크'));
    await userEvent.click(screen.getByRole('button', { name: '맞아요' }));
    expect(await screen.findByRole('button', { name: '다시 불러오기' })).toBeInTheDocument();
    expect(screen.getByText('다른 곳에서 먼저 바뀌었어요. 수업 확인을 다시 불러오지 못했어요.')).toHaveAttribute('role', 'alert');
  });

  it('저장 뒤 다시 불러올 때까지 조작을 막는다', async () => {
    let finishReload;
    classSessionAPI.pending
      .mockResolvedValueOnce(VIEW)
      .mockImplementationOnce(() => new Promise((resolve) => { finishReload = () => resolve(VIEW); }));
    render(<ClassCheckPanel courseId={7} />);
    const first = await screen.findByLabelText(/10\/5\(월\)/);
    await userEvent.click(first.querySelector('button'));

    await waitFor(() => expect(classSessionAPI.confirm).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: '모두 맞아요' })).toBeDisabled();
    finishReload();
    await waitFor(() => expect(screen.getByRole('button', { name: '모두 맞아요' })).toBeEnabled());
  });

  it('저장 뒤 조회가 겹쳐도 가장 늦은 조회가 끝날 때까지 막는다', async () => {
    let finishLate;
    classSessionAPI.pending
      .mockResolvedValueOnce(VIEW)
      .mockImplementationOnce(() => new Promise((resolve) => { finishLate = () => resolve(VIEW); }));
    const { rerender } = render(<ClassCheckPanel courseId={7} refreshToken={0} />);
    await screen.findByRole('button', { name: '모두 맞아요' });
    rerender(<ClassCheckPanel courseId={7} refreshToken={1} />);

    await waitFor(() => expect(screen.getByRole('button', { name: '모두 맞아요' })).toBeDisabled());
    finishLate();
    await waitFor(() => expect(screen.getByRole('button', { name: '모두 맞아요' })).toBeEnabled());
  });

  it('목록이 바뀌어 사라진 선택은 상한에 세지 않는다', async () => {
    const many = Array.from({ length: 31 }, (_, i) => ({ ...S1, ref: `s:${100 + i}`, sectionId: 100 + i, title: `구간 ${i}` }));
    classSessionAPI.pending.mockResolvedValue({ ...VIEW, sessions: [session('2026-10-06', [])], options: many });
    const { rerender } = render(<ClassCheckPanel courseId={7} refreshToken={0} />);
    const boxes = await screen.findAllByRole('checkbox', { name: /구간/ });
    for (const box of boxes.slice(0, 30)) await userEvent.click(box);
    expect(screen.getByRole('checkbox', { name: /구간 30/ })).toBeDisabled();

    classSessionAPI.pending.mockResolvedValue({ ...VIEW, sessions: [session('2026-10-06', [])], options: many.slice(1) });
    rerender(<ClassCheckPanel courseId={7} refreshToken={1} />);
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /구간 30/ })).toBeEnabled());
  });

  it('다시 불러오기가 성공하면 실패 알림을 지운다', async () => {
    classSessionAPI.pending.mockRejectedValueOnce(new Error('네트워크'));
    render(<ClassCheckPanel courseId={7} />);
    await userEvent.click(await screen.findByRole('button', { name: '다시 불러오기' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('모두 맞아요는 한 번에 20회차까지 보낸다', async () => {
    const many = Array.from({ length: 21 }, (_, i) => ({ ...session(`2026-09-${String(i + 1).padStart(2, '0')}`) }));
    classSessionAPI.pending.mockResolvedValue({ ...VIEW, sessions: many });
    render(<ClassCheckPanel courseId={7} />);
    await userEvent.click(await screen.findByRole('button', { name: '20개 맞아요' }));

    await waitFor(() => expect(classSessionAPI.confirm).toHaveBeenCalledTimes(1));
    expect(classSessionAPI.confirm.mock.calls[0][1]).toHaveLength(20);
  });

  it('저장소를 못 써도 나중에는 이번 화면에서 다음 회차로 넘어간다', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('막힘'); });
    render(<TodayClassCheck projectTitles={{ 7: '네트워크' }} />);
    await userEvent.click(await screen.findByRole('button', { name: '나중에' }));

    expect(await screen.findByText('네트워크 · 10/5(월) 09:00 수업 어디까지 했어요?')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('최근 회차 고르기는 접은 것을 건너뛴다', () => {
    expect(latestPending({ 7: VIEW }).session.sourceDate).toBe('2026-10-06');
    expect(latestPending({ 7: VIEW }, Date.now(), new Set(['7:3:2026-10-06'])).session.sourceDate).toBe('2026-10-05');
  });
});
