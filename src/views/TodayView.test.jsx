/**
 * 오늘 화면이 계획이 틀어진 순간에 무엇을 말하는지 고정한다.
 *
 * 이 화면에서 절대 나오면 안 되는 문장이 하나 있다: 예정 시간이 지난 항목이 있는데
 * "지금 잡힌 것이 없어요"라고 말하는 것. 그건 사실이 아니고, 사용자가 할 수 있는 일도 감춘다.
 *
 * 그리고 재조정 검토를 열었다가 취소하면 저장된 계획은 하나도 바뀌지 않아야 한다.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import TodayView from './TodayView.jsx';
import { executionItemAPI } from '../api/api.js';

vi.mock('../api/api.js', () => ({
  executionItemAPI: {
    complete: vi.fn(), partial: vi.fn(), reduce: vi.fn(), move: vi.fn(), hold: vi.fn(), create: vi.fn(),
    resume: vi.fn(), delete: vi.fn(),
  },
}));

const TODAY = new Date();
const TODAY_STRING = [
  TODAY.getFullYear(),
  String(TODAY.getMonth() + 1).padStart(2, '0'),
  String(TODAY.getDate()).padStart(2, '0'),
].join('-');

function timed(id, title, startTime, endTime, extra = {}) {
  return {
    executionItemId: id,
    title,
    scheduledDate: TODAY_STRING,
    startTime,
    endTime,
    estimatedMinutes: 30,
    status: 'PLANNED',
    priority: 'SHOULD',
    displayOrder: id,
    version: 0,
    ...extra,
  };
}

/** 15:40에 화면을 보고 있는 상황으로 고정한다 — 실제 시각에 따라 결과가 달라지면 안 된다. */
function freezeAt(hour, minute) {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const at = new Date(TODAY);
  at.setHours(hour, minute, 0, 0);
  vi.setSystemTime(at);
}

beforeEach(() => {
  vi.clearAllMocks();
  executionItemAPI.move.mockResolvedValue({});
  executionItemAPI.reduce.mockResolvedValue({ version: 1 });
  executionItemAPI.hold.mockResolvedValue({});
  executionItemAPI.resume.mockResolvedValue({});
  executionItemAPI.delete.mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

function renderToday(items, props = {}) {
  return render(<TodayView items={items} loading={false} error={null} {...props} />);
}

describe('지금 영역', () => {
  it('예정 시간이 지난 항목이 있으면 빈 상태 대신 다시 잡기를 제안한다', () => {
    freezeAt(15, 40);
    renderToday([
      timed(1, '아침 루틴', '10:00', '10:15'),
      timed(2, '프로젝트 우선작업', '10:30', '11:20'),
      timed(3, '산책 또는 휴식', '11:30', '11:50'),
      timed(4, '알바', '17:00', '23:00'),
    ]);

    expect(screen.queryByText('지금 잡힌 것이 없어요')).not.toBeInTheDocument();
    expect(screen.getByText('예정 시간이 지난 일정이 3개 있어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '남은 오늘 다시 잡기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '그대로 둘게요' })).toBeInTheDocument();
  });

  it('앞으로 올 일정은 지난 항목으로 세지 않는다', () => {
    freezeAt(15, 40);
    renderToday([timed(1, '아침 루틴', '10:00', '10:15'), timed(4, '알바', '17:00', '23:00')]);

    expect(screen.getByText('예정 시간이 지난 일정이 1개 있어요')).toBeInTheDocument();
  });

  it('오늘 아무것도 없으면 직접 추가와 AI 정리를 제안한다', () => {
    freezeAt(15, 40);
    renderToday([], { onOpenAi: vi.fn() });

    expect(screen.getByText('아직 계획된 항목이 없어요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /AI와 정리하기/ })).toBeInTheDocument();
  });

  it('앞으로 올 일정만 있으면 남은 시간을 알려준다', () => {
    freezeAt(15, 40);
    renderToday([timed(4, '영어 복습', '16:30', '17:00')]);

    expect(screen.getByText(/다음 일정까지 50분 남았어요/)).toBeInTheDocument();
  });
});

describe('남은 오늘', () => {
  it('지나간 항목과 앞으로 할 일을 나눠 보여준다', () => {
    freezeAt(15, 40);
    renderToday([
      timed(1, '아침 루틴', '10:00', '10:15'),
      timed(2, '프로젝트 우선작업', '10:30', '11:20'),
      timed(4, '영어 복습', '16:30', '17:00'),
    ]);

    expect(screen.getByRole('button', { name: /예정 시간이 지난 항목 2개/ })).toBeInTheDocument();
    expect(screen.getByText('앞으로 할 일')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '한번에 정리' })).toBeInTheDocument();
  });

  it('지나간 항목 묶음을 접을 수 있다', async () => {
    freezeAt(15, 40);
    const user = userEvent.setup();
    renderToday([timed(1, '아침 루틴', '10:00', '10:15')]);

    expect(screen.getByText('아침 루틴')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /예정 시간이 지난 항목 1개/ }));
    expect(screen.queryByText('아침 루틴')).not.toBeInTheDocument();
  });
});

describe('다시 잡기 검토', () => {
  it('열기만 해서는 저장된 계획이 바뀌지 않는다', async () => {
    freezeAt(15, 40);
    const user = userEvent.setup();
    renderToday([timed(1, '아침 루틴', '10:00', '10:15'), timed(4, '알바', '17:00', '23:00')]);

    await user.click(screen.getByRole('button', { name: '남은 오늘 다시 잡기' }));

    expect(screen.getByLabelText('오늘 계획 다시 잡기')).toBeInTheDocument();
    expect(executionItemAPI.move).not.toHaveBeenCalled();
    expect(executionItemAPI.reduce).not.toHaveBeenCalled();
    expect(executionItemAPI.hold).not.toHaveBeenCalled();
  });

  it('취소하면 아무것도 반영되지 않는다', async () => {
    freezeAt(15, 40);
    const user = userEvent.setup();
    renderToday([timed(1, '아침 루틴', '10:00', '10:15')]);

    await user.click(screen.getByRole('button', { name: '남은 오늘 다시 잡기' }));
    await user.click(screen.getByRole('button', { name: '취소' }));

    await waitFor(() => expect(screen.queryByLabelText('오늘 계획 다시 잡기')).not.toBeInTheDocument());
    expect(executionItemAPI.move).not.toHaveBeenCalled();
    expect(executionItemAPI.hold).not.toHaveBeenCalled();
  });

  it('적용을 눌러야 기존 도메인 액션이 호출된다', async () => {
    freezeAt(15, 40);
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    renderToday([timed(1, '아침 루틴', '10:00', '10:15', { estimatedMinutes: 15 })], { onRefresh });

    await user.click(screen.getByRole('button', { name: '남은 오늘 다시 잡기' }));
    await user.click(screen.getByRole('button', { name: /이대로 적용/ }));

    await waitFor(() => expect(executionItemAPI.move).toHaveBeenCalledTimes(1));
    // 오늘 안에서 뒤로 옮기는 것도 move다 — 상태를 직접 갈아끼우지 않는다.
    expect(executionItemAPI.move).toHaveBeenCalledWith(1, TODAY_STRING, 0, expect.objectContaining({
      startTime: '15:40',
      endTime: '15:55',
    }));
    expect(onRefresh).toHaveBeenCalled();
  });

  it('선택한 상황 태그가 이벤트에 남을 이유로 함께 전달된다', async () => {
    freezeAt(15, 40);
    const user = userEvent.setup();
    renderToday([timed(1, '아침 루틴', '10:00', '10:15', { estimatedMinutes: 15 })], { onRefresh: vi.fn() });

    await user.click(screen.getByRole('button', { name: '남은 오늘 다시 잡기' }));
    await user.click(screen.getByRole('button', { name: '기상 늦음' }));
    await user.click(screen.getByRole('button', { name: /이대로 적용/ }));

    await waitFor(() => expect(executionItemAPI.move).toHaveBeenCalledWith(1, TODAY_STRING, 0,
      expect.objectContaining({ reason: '다시 잡기: 기상 늦음' })));
  });

  it('AI에게 다시 조정 요청은 입력창을 채우기만 하고 초안을 만들지 않는다', async () => {
    freezeAt(15, 40);
    const user = userEvent.setup();
    const onAsk = vi.fn();
    renderToday([timed(1, '아침 루틴', '10:00', '10:15'), timed(4, '알바', '17:00', '23:00')], { onAsk });

    await user.click(screen.getByRole('button', { name: '남은 오늘 다시 잡기' }));
    await user.click(screen.getByRole('button', { name: /AI에게 다시 조정 요청/ }));

    expect(onAsk).toHaveBeenCalledTimes(1);
    expect(onAsk.mock.calls[0][0]).toContain('남은 오늘을 다시 잡아줘');
    expect(onAsk.mock.calls[0][0]).toContain('17:00');
    expect(executionItemAPI.move).not.toHaveBeenCalled();
  });
});

describe('보류한 것', () => {
  const heldItem = () => timed(9, '산책 또는 휴식', '11:30', '11:50', { status: 'HOLD', version: 2 });

  it('완료와 섞지 않고 "보류한 것"으로 따로 보여준다', () => {
    freezeAt(15, 40);
    renderToday([heldItem(), timed(8, '아침 루틴', '10:00', '10:15', { status: 'DONE' })]);

    expect(screen.getByText('보류한 것')).toBeInTheDocument();
    expect(screen.getByText('오늘 정리한 것')).toBeInTheDocument();
  });

  it('보류 항목에서 다시 시작과 삭제를 할 수 있다 — 손댈 수 없는 유령 항목이 아니다', () => {
    freezeAt(15, 40);
    renderToday([heldItem()]);

    expect(screen.getByRole('button', { name: /다시 시작/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /삭제/ })).toBeInTheDocument();
  });

  it('다시 시작은 resume 액션을 부른다(HOLD -> PLANNED, RESUMED 이벤트)', async () => {
    freezeAt(15, 40);
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    renderToday([heldItem()], { onRefresh });

    await user.click(screen.getByRole('button', { name: /다시 시작/ }));

    await waitFor(() => expect(executionItemAPI.resume).toHaveBeenCalledWith(9, 2));
    expect(onRefresh).toHaveBeenCalled();
  });

  it('삭제는 확인 없이 바로 지우고, 되돌릴 수 있게 알린다', async () => {
    freezeAt(15, 40);
    const user = userEvent.setup();
    const onItemDeleted = vi.fn();
    renderToday([heldItem()], { onRefresh: vi.fn(), onItemDeleted });

    // 확인 관문을 두지 않는다 — 되돌릴 수 있으므로 잘못 눌러도 비용이 0에 가깝다.
    await user.click(screen.getByRole('button', { name: /삭제/ }));

    await waitFor(() => expect(executionItemAPI.delete).toHaveBeenCalledWith(9, 2));
    expect(screen.queryByText('삭제할까요?')).not.toBeInTheDocument();
    // 되돌리기가 무엇을 되살릴지 알아야 하므로 지운 항목을 그대로 넘긴다.
    await waitFor(() => expect(onItemDeleted).toHaveBeenCalledWith(
        expect.objectContaining({ executionItemId: 9, version: 2 })));
  });

  it('계획된 항목에도 삭제가 있다 — 보류로 내린 뒤에야 지울 수 있게 하지 않는다', () => {
    freezeAt(15, 40);
    renderToday([timed(9, '계획한 일', '16:00', '16:30')], { onRefresh: vi.fn() });

    expect(screen.getByRole('button', { name: /삭제/ })).toBeInTheDocument();
  });

  it('완료·취소 항목에는 다시 시작을 노출하지 않는다', () => {
    freezeAt(15, 40);
    renderToday([
      timed(8, '아침 루틴', '10:00', '10:15', { status: 'DONE' }),
      timed(7, '취소한 것', '09:00', '09:30', { status: 'CANCELLED' }),
    ]);

    expect(screen.queryByRole('button', { name: /다시 시작/ })).not.toBeInTheDocument();
  });
});

describe('이동 액션', () => {
  it('"미루기"가 아니라 "이동"이고, 오늘 뒤로 / 내일로 / 날짜 선택을 준다', async () => {
    freezeAt(15, 40);
    const user = userEvent.setup();
    renderToday([timed(2, '진행 중인 일', '15:30', '16:10')]);

    expect(screen.queryByRole('button', { name: '미루기' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '이동' }));

    expect(screen.getByRole('button', { name: '오늘 뒤로' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '내일로' })).toBeInTheDocument();
    expect(screen.getByLabelText('옮길 날짜')).toBeInTheDocument();
  });
});
