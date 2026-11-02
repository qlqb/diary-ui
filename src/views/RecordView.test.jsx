import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('../api/api.js', () => ({
  executionItemAPI: { getRecords: vi.fn() },
}));

import RecordView from './RecordView.jsx';
import { executionItemAPI } from '../api/api.js';

const RECORDS = [
  { executionRecordId: 1, title: '연결 리스트 예제', outcome: 'PARTIAL', completionPercent: 50,
    actualMinutes: 25, plannedMinutes: 40, blockerKind: 'CONCEPT', note: '포인터가 헷갈림',
    recordedAt: '2026-09-18T20:00:00', courseId: 7 },
  { executionRecordId: 2, title: '스택 복습', outcome: 'COMPLETED', completionPercent: 100,
    actualMinutes: null, plannedMinutes: 30, blockerKind: null, recordedAt: '2026-09-18T21:00:00', courseId: 7 },
  { executionRecordId: 3, title: '큐 문제', outcome: 'NOT_DONE', completionPercent: 0,
    actualMinutes: null, blockerKind: 'TIME', recordedAt: '2026-09-18T22:00:00', courseId: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  executionItemAPI.getRecords.mockResolvedValue(RECORDS);
});

describe('RecordView - 시간과 걸린 점', () => {
  it('계획 시간 / 내가 적은 시간 / 시간 미기록을 구분한다', async () => {
    render(<RecordView projectTitles={{ 7: '자료구조' }} refreshToken={0} />);

    const partial = (await screen.findByText('연결 리스트 예제')).closest('article');
    expect(within(partial).getByText('계획 시간 40분')).toBeInTheDocument();
    expect(within(partial).getByText('내가 적은 시간 25분')).toBeInTheDocument();

    // 적지 않았으면 계획 시간을 대신 보여 주지 않는다.
    const done = screen.getByText('스택 복습').closest('article');
    expect(within(done).getByText('시간 미기록')).toBeInTheDocument();
    expect(within(done).queryByText(/내가 적은 시간/)).not.toBeInTheDocument();
    expect(within(done).getByText('계획 시간 30분')).toBeInTheDocument();
  });

  it('걸린 점을 사용자 말투 그대로 보여 준다', async () => {
    render(<RecordView projectTitles={{}} refreshToken={0} />);
    const partial = (await screen.findByText('연결 리스트 예제')).closest('article');
    expect(within(partial).getByText('걸린 점: 개념에서 막혔어')).toBeInTheDocument();
    const notDone = screen.getByText('큐 문제').closest('article');
    expect(within(notDone).getByText('걸린 점: 시간이 없었어')).toBeInTheDocument();
    expect(within(notDone).getByText('못 했음')).toBeInTheDocument();
  });

  it('합계는 "내가 적은 시간"이고 "측정"이라는 말을 쓰지 않는다', async () => {
    const { container } = render(<RecordView projectTitles={{}} refreshToken={0} />);
    await screen.findByText('연결 리스트 예제');
    expect(screen.getByText(/내가 적은 시간 25분/, { selector: '.view-sub' })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/측정/);
  });
});
