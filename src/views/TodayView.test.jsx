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

function untimed(id, title, extra = {}) {
  return {
    executionItemId: id,
    title,
    scheduledDate: TODAY_STRING,
    startTime: null,
    endTime: null,
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

/**
 * 실제 소요시간은 관찰 데이터다. 여기서 고정하는 것은 "안 쟀다"가 계획값으로 조용히
 * 채워지지 않는다는 것과, 실패했을 때 사용자가 친 값이 사라지지 않는다는 것 두 가지다.
 */
describe('실제 소요시간 기록', () => {
  const planned = () => timed(1, '웹서버 과제', '15:00', '15:45', { estimatedMinutes: 45 });

  beforeEach(() => {
    executionItemAPI.complete.mockResolvedValue({});
    executionItemAPI.partial.mockResolvedValue({});
  });

  it('완료를 누르면 바로 보내지 않고 실제 시간을 묻는다', async () => {
    freezeAt(15, 50);
    const user = userEvent.setup();
    renderToday([planned()], { onRefresh: vi.fn() });

    await user.click(screen.getByRole('button', { name: '완료' }));

    expect(screen.getByText('실제로 얼마나 걸렸어요?')).toBeInTheDocument();
    expect(executionItemAPI.complete).not.toHaveBeenCalled();
  });

  it('예상 시간을 기본값이나 추천 버튼으로 내밀지 않는다', async () => {
    freezeAt(15, 50);
    const user = userEvent.setup();
    renderToday([planned()], { onRefresh: vi.fn() });

    await user.click(screen.getByRole('button', { name: '완료' }));

    // 45분짜리 항목이지만 입력칸은 비어 있어야 한다 — 보여주면 그 근처를 고르게 된다.
    expect(screen.getByLabelText('실제 걸린 시간(분)')).toHaveValue(null);
    expect(screen.queryByRole('button', { name: '45분' })).not.toBeInTheDocument();
  });

  it('완료 + 70분 -> complete에 actualMinutes가 실린다', async () => {
    freezeAt(15, 50);
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    renderToday([planned()], { onRefresh });

    await user.click(screen.getByRole('button', { name: '완료' }));
    await user.type(screen.getByLabelText('실제 걸린 시간(분)'), '70');
    await user.click(screen.getByRole('button', { name: '완료 기록' }));

    await waitFor(() => expect(executionItemAPI.complete).toHaveBeenCalledWith(1, 0, { actualMinutes: 70 }));
    expect(onRefresh).toHaveBeenCalled();
  });

  it('모르겠어요는 예상값을 베끼지 않고 actualMinutes 없이 완료한다', async () => {
    freezeAt(15, 50);
    const user = userEvent.setup();
    renderToday([planned()], { onRefresh: vi.fn() });

    await user.click(screen.getByRole('button', { name: '완료' }));
    await user.click(screen.getByRole('button', { name: '모르겠어요' }));

    await waitFor(() => expect(executionItemAPI.complete).toHaveBeenCalledWith(1, 0, {}));
    // 45(estimatedMinutes)가 슬쩍 들어가면 관찰 데이터가 계획 데이터의 메아리가 된다.
    expect(executionItemAPI.complete.mock.calls[0][2]).not.toHaveProperty('actualMinutes');
  });

  it('일부 50% + 30분 -> partial에 둘 다 실린다', async () => {
    freezeAt(15, 50);
    const user = userEvent.setup();
    renderToday([planned()], { onRefresh: vi.fn() });

    await user.click(screen.getByRole('button', { name: '일부 했어요' }));
    await user.type(screen.getByLabelText('실제 걸린 시간(분)'), '30');
    await user.click(screen.getByRole('button', { name: '기록' }));

    await waitFor(() => expect(executionItemAPI.partial).toHaveBeenCalledWith(1, {
      version: 0, completionPercent: 50, actualMinutes: 30,
    }));
  });

  it('시간을 모르면 completionPercent만으로 PARTIAL을 기록한다', async () => {
    freezeAt(15, 50);
    const user = userEvent.setup();
    renderToday([planned()], { onRefresh: vi.fn() });

    await user.click(screen.getByRole('button', { name: '일부 했어요' }));
    await user.click(screen.getByRole('button', { name: '시간은 모르겠어요' }));

    await waitFor(() => expect(executionItemAPI.partial).toHaveBeenCalledWith(1, {
      version: 0, completionPercent: 50,
    }));
  });

  it.each([['0'], ['-5'], ['1.5']])('%s분은 제출할 수 없다', async (value) => {
    freezeAt(15, 50);
    const user = userEvent.setup();
    renderToday([planned()], { onRefresh: vi.fn() });

    await user.click(screen.getByRole('button', { name: '완료' }));
    await user.type(screen.getByLabelText('실제 걸린 시간(분)'), value);

    expect(screen.getByRole('button', { name: '완료 기록' })).toBeDisabled();
    expect(executionItemAPI.complete).not.toHaveBeenCalled();
  });

  it('실패하면 트레이가 열린 채 입력값이 남는다', async () => {
    freezeAt(15, 50);
    const user = userEvent.setup();
    executionItemAPI.complete.mockRejectedValue(new Error('서버가 응답하지 않습니다'));
    renderToday([planned()], { onRefresh: vi.fn() });

    await user.click(screen.getByRole('button', { name: '완료' }));
    await user.type(screen.getByLabelText('실제 걸린 시간(분)'), '70');
    await user.click(screen.getByRole('button', { name: '완료 기록' }));

    // 화면 위쪽 배너에도 뜨지만, 여기서 고정하는 것은 트레이 안에 남는 쪽이다 —
    // 입력값 옆에 있어야 무엇을 다시 할지 알 수 있다.
    const shown = await screen.findAllByText('서버가 응답하지 않습니다');
    expect(shown.some((el) => el.classList.contains('exec-tray-error'))).toBe(true);
    // 다시 칠 필요가 없어야 한다 — 값이 사라지면 오류 문구만 남고 무엇을 쳤는지도 잃는다.
    expect(screen.getByLabelText('실제 걸린 시간(분)')).toHaveValue(70);
  });

  it('버전 충돌이면 재시도가 아니라 새로고침을 안내한다', async () => {
    freezeAt(15, 50);
    const user = userEvent.setup();
    const conflict = new Error('다른 곳에서 먼저 변경되었습니다');
    conflict.code = 'E409_004';
    executionItemAPI.complete.mockRejectedValue(conflict);
    renderToday([planned()], { onRefresh: vi.fn() });

    await user.click(screen.getByRole('button', { name: '완료' }));
    await user.type(screen.getByLabelText('실제 걸린 시간(분)'), '70');
    await user.click(screen.getByRole('button', { name: '완료 기록' }));

    await waitFor(() => expect(
      screen.getByText('목록이 바뀌었어요. 새로고침 후 다시 기록해 주세요'),
    ).toBeInTheDocument());
    expect(screen.getByLabelText('실제 걸린 시간(분)')).toHaveValue(70);
    // 자동 재시도 금지 — 같은 version으로 다시 보내봐야 또 막힌다.
    expect(executionItemAPI.complete).toHaveBeenCalledTimes(1);
  });
});

/**
 * 루틴은 시간을 막지만 실행 대상이 아니다. 오늘 화면이 그 둘을 섞지 않는지 고정한다.
 */
describe('반복 일정 반영', () => {
  const CLASS_AT = (hhmm, date = TODAY_STRING) => `${date}T${hhmm}:00`;

  function occurrence(routineId, title, startAt, endAt) {
    return { routineId, courseId: null, title, location: null, startAt, endAt, moved: false };
  }

  const webClass = () => occurrence(9, '웹서버 수업', CLASS_AT('14:00'), CLASS_AT('17:00'));

  it('실행 조각만 있으면 기존 동작 그대로다', () => {
    freezeAt(15, 40);
    renderToday([timed(4, '영어 복습', '16:30', '17:00')], { occurrences: [] });

    expect(screen.getByText(/다음 일정까지 50분 남았어요/)).toBeInTheDocument();
  });

  it('실행 조각보다 루틴이 먼저 오면 다음 일정이 루틴으로 잡힌다', () => {
    freezeAt(13, 0);
    renderToday([timed(4, '영어 복습', '18:00', '18:30')], { occurrences: [webClass()] });

    expect(screen.getByText(/다음 일정까지 1시간 남았어요/)).toBeInTheDocument();
    // 안내 문구와 "남은 오늘" 줄 양쪽에 나온다 — 실행 조각이 다음일 때와 같은 모양이다.
    expect(screen.getAllByText(/웹서버 수업/).length).toBeGreaterThan(0);
  });

  it('루틴이 하나뿐이어도 "계획된 항목이 없어요"로 끝내지 않는다', () => {
    freezeAt(13, 0);
    renderToday([], { occurrences: [webClass()] });

    expect(screen.queryByText('아직 계획된 항목이 없어요.')).not.toBeInTheDocument();
    expect(screen.getByText(/다음 일정까지 1시간 남았어요/)).toBeInTheDocument();
  });

  describe('진행 중인 루틴', () => {
    it('진행 중으로 표시하고, 시각 없는 실행 조각을 지금 할 것으로 제안하지 않는다', () => {
      freezeAt(15, 0);
      renderToday([untimed(7, '웹서버 과제')], { occurrences: [webClass()] });

      expect(screen.getByText('진행 중')).toBeInTheDocument();
      expect(screen.getByText('14:00–17:00')).toBeInTheDocument();
      // 수업 중인데 "지금 웹서버 과제 하세요"가 뜨면 앱을 못 믿게 된다.
      expect(document.querySelector('.focus-slot')).toBeNull();
    });

    it('접힌 실행 조각은 사라지지 않고 남은 오늘로 내려간다', () => {
      freezeAt(15, 0);
      renderToday([untimed(7, '웹서버 과제')], { occurrences: [webClass()] });

      // 지금 자리에서 뺐다고 오늘 화면에서 통째로 없애면 안 된다.
      expect(screen.getByText('웹서버 과제')).toBeInTheDocument();
    });

    it('루틴 줄에는 실행 액션이 없다', () => {
      freezeAt(15, 0);
      renderToday([], { occurrences: [webClass()] });

      expect(screen.queryByRole('button', { name: '완료' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '일부 했어요' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '이동' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /삭제/ })).not.toBeInTheDocument();
    });

    it('밀린 실행 조각은 그대로 남는다', () => {
      freezeAt(15, 0);
      renderToday([timed(1, '아침 루틴', '10:00', '10:15')], { occurrences: [webClass()] });

      expect(screen.getByText('진행 중')).toBeInTheDocument();
      expect(screen.getByText(/예정 시간이 지난 일정이 1개 있어요/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '남은 오늘 다시 잡기' })).toBeInTheDocument();
    });
  });

  it('남은 예정 시간에 루틴 시간이 더해지지 않는다', () => {
    freezeAt(13, 0);
    // 실행 조각 30분 + 수업 3시간. "남은 예정"은 30분이어야 한다.
    renderToday([timed(4, '영어 복습', '18:00', '18:30')], { occurrences: [webClass()] });

    expect(screen.getByText(/남은 예정 30분/)).toBeInTheDocument();
    expect(screen.queryByText(/남은 예정 3시간 30분/)).not.toBeInTheDocument();
  });

  it('실행 조각은 루틴이 있어도 기존 액션을 그대로 갖는다', () => {
    freezeAt(13, 0);
    renderToday([timed(4, '영어 복습', '18:00', '18:30')], { occurrences: [webClass()] });

    expect(screen.getByRole('button', { name: '완료' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이동' })).toBeInTheDocument();
  });

  it('같은 시간대에 겹쳐도 시간순으로 나란히 나온다', () => {
    freezeAt(13, 0);
    renderToday(
      [timed(4, '영어 복습', '14:30', '15:00'), timed(5, '과제 정리', '18:00', '18:30')],
      { occurrences: [webClass()] },
    );

    const rows = [...document.querySelectorAll('.row-list .exec-row .exec-row-title')]
      .map((el) => el.textContent);
    expect(rows).toEqual(['웹서버 수업', '영어 복습', '과제 정리']);
  });

  it('전날 시작해 오늘까지 이어지는 알바가 새벽에 진행 중으로 잡힌다', () => {
    freezeAt(1, 0);
    const yesterday = new Date(TODAY);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayString = [
      yesterday.getFullYear(),
      String(yesterday.getMonth() + 1).padStart(2, '0'),
      String(yesterday.getDate()).padStart(2, '0'),
    ].join('-');

    renderToday([], {
      occurrences: [occurrence(3, '알바', `${yesterdayString}T22:00:00`, CLASS_AT('02:00'))],
    });

    expect(screen.getByText('알바')).toBeInTheDocument();
    expect(screen.getByText('진행 중')).toBeInTheDocument();
  });
});

describe('일회성 약속', () => {
  const AT = (hhmm, date = TODAY_STRING) => `${date}T${hhmm}:00`;
  const meetup = (overrides = {}) => ({
    commitmentId: 5,
    title: '친구 약속',
    startAt: AT('19:00'),
    endAt: AT('21:00'),
    locationText: '홍대',
    version: 0,
    ...overrides,
  });

  it('다음 일정 계산에 들어가고 "약속"으로 표시된다', () => {
    freezeAt(18, 0);
    renderToday([], { commitments: [meetup()] });

    expect(screen.getByText(/다음 일정까지 1시간 남았어요/)).toBeInTheDocument();
    expect(screen.getAllByText('약속').length).toBeGreaterThan(0);
  });

  it('진행 중이면 "지금"에 뜨고 시각 없는 실행 조각을 제안하지 않는다', () => {
    freezeAt(20, 0);
    renderToday([untimed(7, '웹서버 과제')], { commitments: [meetup()] });

    expect(screen.getByText('진행 중')).toBeInTheDocument();
    expect(document.querySelector('.focus-slot')).toBeNull();
    // 접힌 항목은 사라지지 않는다.
    expect(screen.getByText('웹서버 과제')).toBeInTheDocument();
  });

  it('장소를 보여준다', () => {
    freezeAt(20, 0);
    renderToday([], { commitments: [meetup()] });

    expect(screen.getByText('홍대')).toBeInTheDocument();
  });

  it('실행 액션이 없다', () => {
    freezeAt(20, 0);
    renderToday([], { commitments: [meetup()] });

    for (const name of ['완료', '일부 했어요', '줄이기', '이동']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('남은 예정 시간에 약속 시간이 더해지지 않는다', () => {
    freezeAt(18, 0);
    renderToday([timed(4, '영어 복습', '22:00', '22:30')], { commitments: [meetup()] });

    expect(screen.getByText(/남은 예정 30분/)).toBeInTheDocument();
  });

  it('전날 밤에 시작해 오늘 새벽에 끝나는 약속이 새벽에 진행 중으로 잡힌다', () => {
    freezeAt(1, 0);
    const yesterday = new Date(TODAY);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayString = [
      yesterday.getFullYear(),
      String(yesterday.getMonth() + 1).padStart(2, '0'),
      String(yesterday.getDate()).padStart(2, '0'),
    ].join('-');

    renderToday([], {
      commitments: [meetup({ title: '밤샘 행사', startAt: AT('22:00', yesterdayString), endAt: AT('02:00') })],
    });

    expect(screen.getByText('밤샘 행사')).toBeInTheDocument();
    expect(screen.getByText('진행 중')).toBeInTheDocument();
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
