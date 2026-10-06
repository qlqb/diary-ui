import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AssignmentSection from './AssignmentSection.jsx';
import { assignmentAPI } from '../../api/api.js';

vi.mock('../../api/api.js', () => ({
  assignmentAPI: {
    listByCourse: vi.fn(), answer: vi.fn(), setDue: vi.fn(), setCompleted: vi.fn(), create: vi.fn(), rename: vi.fn(),
  },
  materialAnalysisStatusAPI: { section: vi.fn() },
  materialStoreAPI: { file: vi.fn() },
}));

const candidate = {
  assignmentId: 1, courseId: 5, title: '연결 리스트 실습 과제', sourceQuote: '실습 결과 화면과 코드를 제출하세요',
  confirmStatus: 'CANDIDATE', dueKind: 'UNKNOWN', dueDate: null, dueAt: null,
  dueEstimates: [{ text: '다음 수업까지', isoDate: '2026-09-16', relative: true, basis: '수업 일정' }],
  completed: false, overdue: false, version: 0, sectionId: 10, materialId: 7, materialFilename: 'ds.pdf',
};

const confirmed = {
  assignmentId: 2, courseId: 5, title: '스택 보고서', confirmStatus: 'CONFIRMED', dueKind: 'DATE', dueDate: '2026-09-18',
  completed: false, overdue: false, version: 3, materialId: 7, materialFilename: 'ds.pdf',
};

describe('과제 구역', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('"과제인가요?" 카드의 [과제 맞아요]는 과제 여부만 확정하고 추정 날짜를 승인하지 않는다', async () => {
    assignmentAPI.listByCourse.mockResolvedValue([candidate]);
    assignmentAPI.answer.mockResolvedValue({ ...candidate, confirmStatus: 'CONFIRMED', version: 1 });
    render(<AssignmentSection courseId={5} todayIso="2026-09-13" />);

    await screen.findByText('이 부분은 과제인가요?');
    expect(screen.getByText('확인할 내용 1개')).toBeInTheDocument();
    expect(screen.getByText(/“실습 결과 화면과 코드를 제출하세요”/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '과제 맞아요' }));

    expect(assignmentAPI.answer).toHaveBeenCalledWith(1, { answer: 'CONFIRMED', version: 0 });
    expect(assignmentAPI.setDue).not.toHaveBeenCalled();
    // 확정 뒤 목록에 마감 미확인으로 남고, 추정 날짜는 아직 마감이 아니다.
    await screen.findByText(/마감 미확인/);
  });

  it('[이 날짜 맞아요]는 그 추정 날짜를 사용자가 확정하는 요청으로 보낸다', async () => {
    assignmentAPI.listByCourse.mockResolvedValue([candidate]);
    assignmentAPI.setDue.mockResolvedValue({ ...candidate, dueKind: 'DATE', dueDate: '2026-09-16', dueSource: 'USER', version: 1 });
    render(<AssignmentSection courseId={5} todayIso="2026-09-13" />);

    await screen.findByText('이 부분은 과제인가요?');
    expect(screen.getByText(/추정/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '이 날짜 맞아요' }));

    expect(assignmentAPI.setDue).toHaveBeenCalledWith(1, { dueKind: 'DATE', dueDate: '2026-09-16', version: 0 });
  });

  it('[아직 몰라요]와 [마감 없음]은 서로 다른 값으로 저장된다', async () => {
    assignmentAPI.listByCourse.mockResolvedValue([candidate]);
    assignmentAPI.setDue.mockResolvedValue({ ...candidate, version: 1 });
    render(<AssignmentSection courseId={5} todayIso="2026-09-13" />);
    await screen.findByText('이 부분은 과제인가요?');

    await userEvent.click(screen.getByRole('button', { name: '아직 몰라요' }));
    expect(assignmentAPI.setDue).toHaveBeenLastCalledWith(1, { dueKind: 'UNKNOWN', version: 0 });
    await userEvent.click(screen.getByRole('button', { name: '마감 없음' }));
    expect(assignmentAPI.setDue).toHaveBeenLastCalledWith(1, { dueKind: 'NONE', version: 1 });
  });

  it('[나중에]는 과제 아님으로 저장하지 않고, 다시 등록할 수 있게 남긴다', async () => {
    assignmentAPI.listByCourse.mockResolvedValue([candidate]);
    assignmentAPI.answer.mockResolvedValue({ ...candidate, confirmStatus: 'LATER', version: 1 });
    render(<AssignmentSection courseId={5} todayIso="2026-09-13" />);
    await screen.findByText('이 부분은 과제인가요?');

    await userEvent.click(screen.getByRole('button', { name: '나중에' }));
    expect(assignmentAPI.answer).toHaveBeenCalledWith(1, { answer: 'LATER', version: 0 });
    await screen.findByText(/나중에 보기로 한 항목 1개/);
    expect(screen.queryByText('이 부분은 과제인가요?')).not.toBeInTheDocument();
  });

  it('완료 체크는 즉시 저장되고 해제할 수 있으며 지난 마감은 숨기지 않는다', async () => {
    const overdue = { ...confirmed, dueDate: '2026-09-01', overdue: true };
    assignmentAPI.listByCourse.mockResolvedValue([overdue]);
    assignmentAPI.setCompleted.mockResolvedValueOnce({ ...overdue, completed: true, completedAt: '2026-09-13T10:00:00', overdue: false, version: 4 });
    render(<AssignmentSection courseId={5} todayIso="2026-09-13" />);

    const row = await screen.findByText('스택 보고서');
    expect(screen.getByText(/마감이 지났어요/)).toBeInTheDocument();
    const checkbox = within(row.closest('li')).getByRole('checkbox');
    await userEvent.click(checkbox);
    expect(assignmentAPI.setCompleted).toHaveBeenCalledWith(2, { completed: true, version: 3 });

    // 끝낸 과제는 접힌 목록으로 내려가고 거기서 해제할 수 있다.
    await userEvent.click(await screen.findByRole('button', { name: /끝낸 과제 1개/ }));
    assignmentAPI.setCompleted.mockResolvedValueOnce({ ...overdue, completed: false, version: 5 });
    const doneRow = screen.getByText('스택 보고서').closest('li');
    await userEvent.click(within(doneRow).getByRole('checkbox'));
    expect(assignmentAPI.setCompleted).toHaveBeenLastCalledWith(2, { completed: false, version: 4 });
  });

  it('버전이 어긋나면(409) 최신을 다시 읽고 그 사실을 말한다', async () => {
    assignmentAPI.listByCourse.mockResolvedValue([confirmed]);
    const conflict = Object.assign(new Error('다른 곳에서 먼저 변경되었습니다'), { code: 'E409_004' });
    assignmentAPI.setCompleted.mockRejectedValue(conflict);
    render(<AssignmentSection courseId={5} todayIso="2026-09-13" />);
    const row = await screen.findByText('스택 보고서');
    await userEvent.click(within(row.closest('li')).getByRole('checkbox'));
    await waitFor(() => expect(assignmentAPI.listByCourse).toHaveBeenCalledTimes(2));
    expect(screen.getByText(/다른 곳에서 먼저 바뀌었어요/)).toBeInTheDocument();
  });
});
