/**
 * 근무표 검토 다이얼로그.
 *
 * 여기서 지키는 선 넷: 화면이 시간을 계산하지 않을 것, 확정 요청에 해석 결과가 실리지 않을 것,
 * 모르는 코드를 채우기 전에는 가져올 수 없을 것, 그리고 전체 목록을 늘 보여줄 것.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import ScheduleImportReviewModal from './ScheduleImportReviewModal.jsx';

const cell = (date, kind, start = null, end = null, extra = {}) => ({
  date, kind, start, end, raw: extra.raw ?? '', code: extra.code ?? null,
  crossesMidnight: extra.crossesMidnight ?? false,
});

const extraction = (overrides = {}) => ({
  raw: {
    isScheduleTable: true,
    title: 'Weekly Schedule 9.7 ~ 13',
    scheduleColumns: ['월', '화', '수', '목', '금', '토', '일'],
    legend: { OP: '14~23' },
    rows: [],
  },
  resolvedPeriod: { startDate: '2026-09-07', endDate: '2026-09-13' },
  periodMissing: false,
  periodWeekdayMismatch: false,
  columnsUnrecognized: false,
  columnsNormalized: false,
  matchedRowIndex: 1,
  unresolvedCodes: [],
  rows: [
    {
      index: 0, name: '사원A', tag: 'SR', rowInvalid: false,
      cells: [cell('2026-09-07', 'WORK', '14:00', '23:00', { raw: 'OP', code: 'OP' })],
    },
    {
      index: 1, name: '본인', tag: 'PT', rowInvalid: false,
      cells: [
        cell('2026-09-07', 'WORK', '17:00', '23:00', { raw: '17~23' }),
        cell('2026-09-08', 'OFF', null, null, { raw: 'D/O' }),
        cell('2026-09-09', 'WORK', '15:00', '00:00', { raw: 'CL', code: 'CL', crossesMidnight: true }),
      ],
    },
  ],
  ...overrides,
});

function renderModal(over = {}, props = {}) {
  const onConfirm = vi.fn().mockResolvedValue(undefined);
  const onCancel = vi.fn();
  render(
    <ScheduleImportReviewModal
      extraction={extraction(over)}
      conversationId={42}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onConfirm, onCancel };
}

describe('ScheduleImportReviewModal', () => {
  it('서버가 미리 고른 줄이 선택돼 있지만 전체 목록을 보여준다', () => {
    renderModal();

    expect(screen.getByLabelText('내 줄')).toHaveValue('1');
    // 잘못 고르면 남의 근무가 들어오므로 사용자가 바꿀 수 있어야 한다.
    expect(screen.getByRole('option', { name: /사원A/ })).toBeInTheDocument();
  });

  it('시각은 서버가 준 값을 그대로 보여준다 — 화면이 계산하지 않는다', () => {
    renderModal();

    const preview = screen.getByRole('list');
    expect(within(preview).getByText('17:00 ~ 23:00')).toBeInTheDocument();
    expect(within(preview).getByText('휴무')).toBeInTheDocument();
    // 자정을 넘는 칸은 넘는다고 말한다. 00:00만 보이면 같은 날 새벽으로 읽힌다.
    expect(within(preview).getByText('15:00 ~ 00:00 (다음 날)')).toBeInTheDocument();
  });

  it('확정 요청에 표 원문만 실린다 — 셀 해석 결과는 보내지 않는다', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderModal();

    await user.click(screen.getByRole('button', { name: '가져오기' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const body = onConfirm.mock.calls[0][0];
    expect(body).toEqual({
      conversationId: 42,
      raw: extraction().raw,
      rowIndex: 1,
      periodStartDate: '2026-09-07',
      title: '근무',
      legendOverrides: {},
    });
    expect(body).not.toHaveProperty('cells');
    expect(body).not.toHaveProperty('rows');
  });

  it('모르는 코드를 채우기 전에는 가져올 수 없다', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderModal({
      rows: [{
        index: 0, name: '본인', tag: 'PT', rowInvalid: false,
        cells: [cell('2026-09-07', 'UNRESOLVED', null, null, { raw: 'A' })],
      }],
      matchedRowIndex: 0,
      unresolvedCodes: ['A'],
    });

    expect(screen.getByRole('button', { name: '가져오기' })).toBeDisabled();

    await user.type(screen.getByLabelText('A 시간'), '10~15');

    expect(screen.getByRole('button', { name: '가져오기' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: '가져오기' }));
    expect(onConfirm.mock.calls[0][0].legendOverrides).toEqual({ A: '10~15' });
  });

  it('줄을 고르지 않으면 가져올 수 없다', async () => {
    const user = userEvent.setup();
    renderModal({ matchedRowIndex: null });

    expect(screen.getByRole('button', { name: '가져오기' })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('내 줄'), '1');
    expect(screen.getByRole('button', { name: '가져오기' })).toBeEnabled();
  });

  it('요일이 어긋나면 조용히 넘기지 않고 알린다', () => {
    renderModal({ periodWeekdayMismatch: true });
    expect(screen.getByText(/어느 주인지 한 번 봐 주세요/)).toBeInTheDocument();
  });

  it('날짜가 없는 표는 첫 칸의 날짜를 고르게 한다', () => {
    renderModal({ periodMissing: true, resolvedPeriod: null });

    expect(screen.getByLabelText('첫 칸의 날짜')).toHaveValue('');
    expect(screen.getByRole('button', { name: '가져오기' })).toBeDisabled();
  });

  it('문구에 실패·부족 계열 표현을 쓰지 않는다', () => {
    renderModal({ periodWeekdayMismatch: true, periodMissing: true, resolvedPeriod: null });

    expect(document.body.textContent).not.toMatch(/실패|오류|에러|부족|미완료|잘못/);
  });

  it('두 버튼에 시각적 우열을 주지 않는다', () => {
    renderModal();

    expect(screen.getByRole('button', { name: '가져오기' })).toHaveClass('btn-ghost');
    expect(screen.getByRole('button', { name: '나중에 하기' })).toHaveClass('btn-ghost');
  });
});
