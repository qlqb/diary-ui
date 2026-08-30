/**
 * 반복 일정 목록이 사용자에게 무엇을 말하는지 고정한다.
 *
 * 세 가지가 조용히 틀어질 수 있는 자리다.
 *
 * 1. 요일을 바꿔서 기존 예외가 무효가 되면 서버가 전체를 거부한다. 그때 "무엇이 걸렸는지"를
 *    보여주지 못하면 사용자는 왜 저장이 안 되는지 모른 채 같은 시도를 반복한다. 그 목록은
 *    응답의 details에 구조로 오고, message 문자열을 파싱하지 않는다.
 * 2. 종료된 루틴에 미래 보강이 남아 있으면 그 사실을 보여준다 — 조용히 지우지 않기 때문에,
 *    화면이 말하지 않으면 사용자가 모르는 일정이 남는다.
 * 3. 자정을 넘는 구간은 시각만 보면 입력 실수처럼 보인다. 다음 날이라는 것을 말해야 한다.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RoutineSection from './RoutineSection.jsx';
import { routineAPI } from '../../api/api.js';

vi.mock('../../api/api.js', () => ({
  routineAPI: {
    list: vi.fn(), occurrences: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(),
    addException: vi.fn(), updateException: vi.fn(), removeException: vi.fn(),
  },
}));

function routine(overrides = {}) {
  return {
    routineId: 1,
    courseId: null,
    title: '빅데이터분석',
    location: '3-315',
    daysOfWeek: ['THURSDAY'],
    startTime: '10:00:00',
    endTime: '12:50:00',
    effectiveFrom: '2026-08-25',
    effectiveUntil: '2026-12-11',
    ended: false,
    crossesMidnight: false,
    hasFutureMovedDate: false,
    exceptions: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RoutineSection', () => {
  it('요일·시각·기간과 예외 개수를 한 줄로 보여준다', () => {
    render(<RoutineSection routines={[routine({
      exceptions: [
        { routineExceptionId: 1, exceptionDate: '2026-09-24', type: 'MOVED', movedDate: '2026-10-01' },
        { routineExceptionId: 2, exceptionDate: '2026-10-09', type: 'SKIP' },
      ],
    })]} courses={[]} loading={false} onChanged={vi.fn()} />);

    expect(screen.getByText('빅데이터분석')).toBeInTheDocument();
    expect(screen.getByText(/목 10:00-12:50/)).toBeInTheDocument();
    expect(screen.getByText(/3-315/)).toBeInTheDocument();
    expect(screen.getByText(/예외 2개/)).toBeInTheDocument();
  });

  it('자정을 넘는 구간에는 다음 날이라고 적는다', () => {
    render(<RoutineSection routines={[routine({
      title: '알바 CL', daysOfWeek: ['MONDAY'], startTime: '15:00:00', endTime: '00:00:00',
      crossesMidnight: true, effectiveUntil: null,
    })]} courses={[]} loading={false} onChanged={vi.fn()} />);

    expect(screen.getByText(/월 15:00-00:00/)).toBeInTheDocument();
    expect(screen.getByText('(다음 날)')).toBeInTheDocument();
  });

  it('종료된 루틴에 미래 보강이 남아 있으면 그 사실을 알린다', () => {
    render(<RoutineSection routines={[routine({ ended: true, hasFutureMovedDate: true })]}
      courses={[]} loading={false} onChanged={vi.fn()} />);

    expect(screen.getByText('종료됨')).toBeInTheDocument();
    expect(screen.getByText(/종료 뒤 보강이 남아 있어요/)).toBeInTheDocument();
  });

  it('수정이 기존 예외를 무효로 만들면 걸린 날짜를 그대로 보여준다', async () => {
    const user = userEvent.setup();
    const conflict = new Error('이 변경은 기존 예외를 무효로 만듭니다. 예외를 먼저 정리해 주세요');
    conflict.status = 409;
    conflict.code = 'E409_011';
    conflict.details = { conflictingExceptionIds: [1], conflictingDates: ['2026-09-24', '2026-10-09'] };
    routineAPI.update.mockRejectedValue(conflict);

    render(<RoutineSection routines={[routine()]} courses={[]} loading={false} onChanged={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /수정/ }));
    // 목요일을 끄고 화요일을 켠다.
    await user.click(screen.getByRole('button', { name: '목', pressed: true }));
    await user.click(screen.getByRole('button', { name: '화', pressed: false }));
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => {
      expect(screen.getByText(/2026-09-24, 2026-10-09/)).toBeInTheDocument();
    });
    // 폼은 닫히지 않는다 — 사용자가 예외를 정리하고 다시 시도할 자리가 남아 있어야 한다.
    expect(screen.getByRole('button', { name: '저장' })).toBeInTheDocument();
  });

  it('저장에 성공하면 목록을 다시 읽고 폼을 닫는다', async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn().mockResolvedValue(undefined);
    routineAPI.update.mockResolvedValue(routine());

    render(<RoutineSection routines={[routine()]} courses={[]} loading={false} onChanged={onChanged} />);

    await user.click(screen.getByRole('button', { name: /수정/ }));
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(routineAPI.update).toHaveBeenCalledWith(1, expect.objectContaining({
      title: '빅데이터분석',
      daysOfWeek: ['THURSDAY'],
      startTime: '10:00',
      endTime: '12:50',
      effectiveUntil: '2026-12-11',
    }));
    await waitFor(() => expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument());
  });

  /*
   * 목요일 루틴에 화요일 예외를 달면 서버가 400으로 막는다. 보내기 전에 말해 주지 않으면
   * 사용자는 왜 거부됐는지 모른다.
   */
  it('예외 날짜가 루틴 요일이 아니면 보내기 전에 알려준다', async () => {
    const user = userEvent.setup();
    render(<RoutineSection routines={[routine()]} courses={[]} loading={false} onChanged={vi.fn()} />);

    await user.click(screen.getByRole('button', { expanded: false }));
    await user.click(screen.getByRole('button', { name: /예외 추가/ }));
    // 2026-09-22는 화요일.
    await user.type(screen.getByLabelText(/날짜/), '2026-09-22');

    expect(await screen.findByText(/목요일에만 있어요/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '추가' })).toBeDisabled();
    expect(routineAPI.addException).not.toHaveBeenCalled();
  });
});
