import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TimetableView from './TimetableView.jsx';

/* v6.1 §12: 주간 시간표가 실제 ExecutionItem 원본을 그대로 투영하는지 검증한다 —
 * Today와 별도의 mock을 갖지 않는다는 게 이 테스트의 핵심이다. */

const weekDates = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09'];

const items = [
  {
    executionItemId: 101,
    title: '자료구조 수업',
    itemType: 'FIXED_EVENT',
    placementType: 'TIME_FIXED',
    scheduledDate: '2026-08-04',
    startTime: '13:00',
    endTime: '14:50',
    status: 'PLANNED',
    priority: 'SHOULD',
    estimatedMinutes: 110,
  },
  {
    executionItemId: 102,
    title: '트리 순회 복습',
    itemType: 'TASK',
    placementType: 'DATE_ONLY',
    scheduledDate: '2026-08-09',
    startTime: null,
    endTime: null,
    status: 'PLANNED',
    priority: 'MUST',
    estimatedMinutes: 50,
  },
];

describe('TimetableView - 실행 조각 매핑', () => {
  it('시간이 정해진 조각을 요일/시간 그리드에 매핑해 보여준다', () => {
    render(<TimetableView items={items} weekDates={weekDates} todayDate="2026-08-09" onOpenDetail={vi.fn()} />);

    expect(screen.getByText('자료구조 수업')).toBeInTheDocument();
    expect(screen.getByText('13:00 – 14:50')).toBeInTheDocument();
  });

  it('시간이 정해지지 않은 조각은 그리드 상단 미배치 칩으로 보여준다', () => {
    render(<TimetableView items={items} weekDates={weekDates} todayDate="2026-08-09" onOpenDetail={vi.fn()} />);

    expect(screen.getAllByText('트리 순회 복습').length).toBeGreaterThan(0);
  });

  it('조각을 클릭하면 실제 상태/우선순위를 보여주고, "오늘 계획에서 보기"는 원본 ExecutionItem을 그대로 넘긴다', async () => {
    const user = userEvent.setup();
    const onOpenDetail = vi.fn();
    render(<TimetableView items={items} weekDates={weekDates} todayDate="2026-08-09" onOpenDetail={onOpenDetail} />);

    await user.click(screen.getByText('자료구조 수업'));

    expect(screen.getByText('예정')).toBeInTheDocument();
    expect(screen.getByText('보통')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /오늘 계획에서 보기/ }));
    expect(onOpenDetail).toHaveBeenCalledWith(expect.objectContaining({ executionItemId: 101 }));
  });

  it('오늘 일정 패널은 같은 원본에서 오늘 날짜 조각만 투영한다', () => {
    render(<TimetableView items={items} weekDates={weekDates} todayDate="2026-08-09" onOpenDetail={vi.fn()} />);

    expect(screen.getByText('오늘 일정')).toBeInTheDocument();
    // 그리드의 미배치 칩 + 오늘 일정 목록, 두 곳 모두에 같은 원본이 나타난다
    expect(screen.getAllByText('트리 순회 복습').length).toBe(2);
  });
});
