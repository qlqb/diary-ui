import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import UnplacedTray from './UnplacedTray.jsx';
import { trayHandlersOf, trayItemsOf } from '../ai/unplacedDraft.js';
import { formatSlot, slotOf } from '../lib/unplacedSlot.js';

const openItem = {
  id: 7, title: '센서 복습', minutes: 90, reason: '배치 가능한 시간이 부족함',
  nextSlot: { start: '2026-11-19T15:00:00', end: '2026-11-19T16:30:00' },
  fit: { minutes: 45, start: '2026-11-18T23:00:00' },
  status: 'open',
};

function renderTray(items, overrides = {}) {
  const handlers = { onPlace: vi.fn(), onExclude: vi.fn(), onDefer: vi.fn(), onUndo: vi.fn(), ...overrides };
  render(<UnplacedTray items={items} defaultDate="2026-11-18" {...handlers} />);
  return handlers;
}

describe('UnplacedTray', () => {
  it('목록 위 요약에 못 넣은 개수와 처리 버튼을 보여 준다', () => {
    renderTray([openItem]);
    expect(screen.getByText('기간 안에 못 넣은 항목 1개')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /11\/19\(목\) 15:00~16:30에 넣기/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /45분으로 줄여 23:00에 넣기/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /직접 정하기/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '날짜 미정으로 두기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /빼기/ })).toBeInTheDocument();
  });

  it('다음 빈 시간·줄여 넣기·빼기·미정이 각자의 처리로 간다', () => {
    const h = renderTray([openItem]);
    fireEvent.click(screen.getByRole('button', { name: /15:00~16:30에 넣기/ }));
    expect(h.onPlace).toHaveBeenCalledWith(7, openItem.nextSlot);
    fireEvent.click(screen.getByRole('button', { name: /줄여/ }));
    expect(h.onPlace).toHaveBeenLastCalledWith(7, { start: '2026-11-18T23:00:00', end: '2026-11-18T23:45:00', minutes: 45 });
    fireEvent.click(screen.getByRole('button', { name: /빼기/ }));
    expect(h.onExclude).toHaveBeenCalledWith(7);
    fireEvent.click(screen.getByRole('button', { name: '날짜 미정으로 두기' }));
    expect(h.onDefer).toHaveBeenCalledWith(7);
  });

  it('직접 정하기는 고른 날짜·시각에서 항목 길이만큼 놓는다', () => {
    const h = renderTray([openItem]);
    fireEvent.click(screen.getByRole('button', { name: /직접 정하기/ }));
    fireEvent.change(screen.getByLabelText('날짜'), { target: { value: '2026-11-20' } });
    fireEvent.change(screen.getByLabelText('시작'), { target: { value: '19:30' } });
    fireEvent.click(screen.getByRole('button', { name: '1시간 30분 놓기' }));
    expect(h.onPlace).toHaveBeenCalledWith(7, { start: '2026-11-20T19:30:00', end: '2026-11-20T21:00:00' });
  });

  it('처리한 항목은 결과와 되돌리기를 보여 주고, 다 처리하면 요약이 바뀐다', () => {
    const h = renderTray([{ ...openItem, status: 'placed', placedLabel: '11/19(목) 15:00~16:30에 넣었어요' }]);
    expect(screen.getByText('못 넣은 항목을 모두 정리했어요')).toBeInTheDocument();
    expect(screen.getByText(/15:00~16:30에 넣었어요/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /되돌리기/ }));
    expect(h.onUndo).toHaveBeenCalledWith(7);
  });

  it('못 넣은 항목이 없으면 아무것도 그리지 않는다', () => {
    const { container } = render(<UnplacedTray items={[]} onPlace={vi.fn()} onExclude={vi.fn()} onDefer={vi.fn()} onUndo={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('unplacedSlot', () => {
  it('자정을 넘는 길이를 다음 날로 계산한다', () => {
    expect(slotOf('2026-11-18', '23:30', 60)).toEqual({ start: '2026-11-18T23:30:00', end: '2026-11-19T00:30:00' });
    expect(formatSlot('2026-11-18T23:30:00', '2026-11-19T00:30:00')).toBe('11/18(수) 23:30~11/19(목) 00:30');
  });
});

describe('unplacedDraft (화면 위 초안 카드)', () => {
  const card = {
    proposalItemId: 7, operation: 'CREATE', title: '센서 복습', excluded: false, expectedMinutes: 90,
    scheduledDate: '2026-11-18', startTime: null, endTime: null, placementType: 'UNSCHEDULED', autoPlaced: false,
    unplacedReason: '배치 가능한 시간이 부족함',
    unplacedHint: {
      proposalItemId: 7, expectedMinutes: 90, reason: '배치 가능한 시간이 부족함',
      nextSlotStartAt: '2026-11-19T15:00:00', nextSlotEndAt: '2026-11-19T16:30:00', fitMinutes: 45, fitStartAt: '2026-11-18T23:15:00',
    },
  };

  it('힌트가 있는 새 항목만 묶음에 넣는다', () => {
    const items = trayItemsOf([card, { ...card, proposalItemId: 8, unplacedHint: null }]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 7, status: 'open', nextSlot: { start: '2026-11-19T15:00:00' }, fit: { minutes: 45 } });
  });

  it('줄여 넣으면 길이·시각을 고치고, 되돌리면 처리 직전 값으로 돌린다', () => {
    const patch = vi.fn();
    const h = trayHandlersOf([card], patch, vi.fn());
    h.onPlace(7, { start: '2026-11-18T23:15:00', end: '2026-11-19T00:00:00', minutes: 45 });
    const placed = patch.mock.calls[0][1];
    expect(placed).toMatchObject({
      scheduledDate: '2026-11-18', startTime: '23:15', endTime: '24:00', placementType: 'TIME_FIXED',
      expectedMinutes: 45, unplacedResolved: 'placed',
    });
    expect(placed.unplacedBefore).toMatchObject({ expectedMinutes: 90, startTime: null, placementType: 'UNSCHEDULED' });

    const after = { ...card, ...placed };
    expect(trayItemsOf([after])[0]).toMatchObject({ status: 'placed', placedLabel: expect.stringContaining('45분으로 줄임') });
    trayHandlersOf([after], patch, vi.fn()).onUndo(7);
    expect(patch.mock.calls[1][1]).toMatchObject({ expectedMinutes: 90, startTime: null, unplacedResolved: null });
  });

  it('날짜 미정으로 두면 날짜를 비워 미배치로 적용되게 한다', () => {
    const patch = vi.fn();
    trayHandlersOf([card], patch, vi.fn()).onDefer(7);
    expect(patch.mock.calls[0][1]).toMatchObject({ scheduledDate: null, placementType: 'UNSCHEDULED', unplacedResolved: 'deferred' });
  });
});
