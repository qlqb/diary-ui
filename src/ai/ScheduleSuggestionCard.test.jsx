/**
 * AI 일정 후보 카드.
 *
 * 여기서 지키는 선 셋: 승인 전에는 아무것도 저장되지 않는다는 것이 화면에서도 분명할 것,
 * [수정]이 화면을 옮기지 않을 것, 그리고 서버가 거절할 값으로는 [적용]을 누를 수 없을 것.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import ScheduleSuggestionCard from './ScheduleSuggestionCard.jsx';

const commitment = (payload = {}) => ({
  suggestionId: 700,
  kind: 'COMMITMENT',
  status: 'PROPOSED',
  payload: {
    title: '친구 약속',
    startAt: '2026-09-04T19:00',
    endAt: '2026-09-04T21:00',
    locationText: '홍대',
    ...payload,
  },
});

const routine = (payload = {}) => ({
  suggestionId: 701,
  kind: 'ROUTINE',
  status: 'PROPOSED',
  payload: {
    title: '알바',
    daysOfWeek: ['THURSDAY'],
    startTime: '18:00',
    endTime: '23:00',
    effectiveFrom: '2026-09-01',
    effectiveUntil: null,
    ...payload,
  },
});

function renderCard(suggestion, props = {}) {
  const onApply = vi.fn();
  const onDismiss = vi.fn();
  render(
    <ScheduleSuggestionCard
      suggestion={suggestion}
      state={undefined}
      onApply={onApply}
      onDismiss={onDismiss}
      {...props}
    />,
  );
  return { onApply, onDismiss };
}

describe('약속 후보 카드', () => {
  it('접힌 상태에서도 무엇이 저장될지 다 말한다', () => {
    renderCard(commitment());

    expect(screen.getByText('친구 약속')).toBeInTheDocument();
    expect(screen.getByText('9/4 19:00 ~ 21:00')).toBeInTheDocument();
    expect(screen.getByText('홍대')).toBeInTheDocument();
    expect(screen.getByText('약속')).toBeInTheDocument();
  });

  it('자정을 넘기면 종료 쪽 날짜도 보여준다', () => {
    renderCard(commitment({ startAt: '2026-09-04T22:00', endAt: '2026-09-05T02:00' }));

    expect(screen.getByText('9/4 22:00 ~ 9/5 02:00')).toBeInTheDocument();
  });

  it('세 버튼이 있고, 기본 상태에서는 편집 필드가 펼쳐져 있지 않다', () => {
    renderCard(commitment());

    expect(screen.getByRole('button', { name: /적용$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '수정' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /적용 안 함/ })).toBeInTheDocument();
    // 대부분은 그대로 적용하고 끝난다 — 처음부터 필드를 늘어놓지 않는다.
    expect(screen.queryByLabelText('약속 제목')).not.toBeInTheDocument();
  });

  it('그대로 적용하면 원본 payload로 부른다', async () => {
    const user = userEvent.setup();
    const { onApply } = renderCard(commitment());

    await user.click(screen.getByRole('button', { name: /적용$/ }));

    expect(onApply).toHaveBeenCalledWith(700, expect.objectContaining({
      title: '친구 약속', startAt: '2026-09-04T19:00', endAt: '2026-09-04T21:00',
    }));
  });

  it('수정은 같은 카드 안에서 펼쳐진다', async () => {
    const user = userEvent.setup();
    renderCard(commitment());

    await user.click(screen.getByRole('button', { name: '수정' }));

    // 화면을 옮기면 사용자가 방금 무슨 얘기를 하고 있었는지 잃는다.
    expect(screen.getByLabelText('약속 제목')).toHaveValue('친구 약속');
    expect(screen.getByLabelText('시작 시각')).toHaveValue('19:00');
    expect(screen.getByText('친구 약속')).toBeInTheDocument();
  });

  it('고친 값으로 적용한다', async () => {
    const user = userEvent.setup();
    const { onApply } = renderCard(commitment());

    await user.click(screen.getByRole('button', { name: '수정' }));
    await user.clear(screen.getByLabelText('종료 시각'));
    await user.type(screen.getByLabelText('종료 시각'), '21:30');
    await user.click(screen.getByRole('button', { name: /적용$/ }));

    expect(onApply).toHaveBeenCalledWith(700, expect.objectContaining({
      endAt: '2026-09-04T21:30',
    }));
  });

  it('종료가 시작보다 이르면 적용할 수 없다', async () => {
    const user = userEvent.setup();
    renderCard(commitment());

    await user.click(screen.getByRole('button', { name: '수정' }));
    await user.clear(screen.getByLabelText('종료 시각'));
    await user.type(screen.getByLabelText('종료 시각'), '18:00');

    expect(screen.getByRole('button', { name: /적용$/ })).toBeDisabled();
  });

  it('적용하지 않기를 누르면 payload 없이 거절만 부른다', async () => {
    const user = userEvent.setup();
    const { onDismiss, onApply } = renderCard(commitment());

    await user.click(screen.getByRole('button', { name: /적용 안 함/ }));

    expect(onDismiss).toHaveBeenCalledWith(700);
    expect(onApply).not.toHaveBeenCalled();
  });
});

describe('반복 일정 후보 카드', () => {
  it('요일·시간·적용 기간을 요약으로 보여준다', () => {
    renderCard(routine());

    expect(screen.getByText('알바')).toBeInTheDocument();
    expect(screen.getByText('매주 목요일')).toBeInTheDocument();
    expect(screen.getByText('18:00 ~ 23:00')).toBeInTheDocument();
    // 끝이 없는 것은 정상값이다(알바·운동). 빈칸으로 두면 잘못 입력한 것처럼 보인다.
    expect(screen.getByText('9/1부터 · 종료 없음')).toBeInTheDocument();
    expect(screen.getByText('반복 일정')).toBeInTheDocument();
  });

  it('요일을 눌러 바꾼 값으로 적용한다', async () => {
    const user = userEvent.setup();
    const { onApply } = renderCard(routine());

    await user.click(screen.getByRole('button', { name: '수정' }));
    await user.click(screen.getByRole('button', { name: '금' }));
    await user.click(screen.getByRole('button', { name: /적용$/ }));

    expect(onApply).toHaveBeenCalledWith(701, expect.objectContaining({
      daysOfWeek: ['THURSDAY', 'FRIDAY'],
    }));
  });

  it('요일이 하나도 없으면 적용할 수 없다', async () => {
    const user = userEvent.setup();
    renderCard(routine());

    await user.click(screen.getByRole('button', { name: '수정' }));
    await user.click(screen.getByRole('button', { name: '목' }));

    expect(screen.getByRole('button', { name: /적용$/ })).toBeDisabled();
  });

  it('자정을 넘기는 야간 근무는 막지 않는다', async () => {
    const user = userEvent.setup();
    renderCard(routine({ startTime: '18:00', endTime: '02:00' }));

    // 서버가 endTime < startTime을 다음 날 종료로 읽는다 — 화면이 더 엄격하면 안 된다.
    await user.click(screen.getByRole('button', { name: '수정' }));
    expect(screen.getByRole('button', { name: /적용$/ })).toBeEnabled();
  });
});

describe('처리 결과', () => {
  it('적용하면 카드가 사라지지 않고 결과를 남긴다', () => {
    renderCard(commitment(), { state: { status: 'applied' } });

    // 사라지면 사용자가 방금 무엇을 승인했는지 확인할 방법이 없다.
    expect(screen.getByText('일정에 넣었어요.')).toBeInTheDocument();
    expect(screen.getByText('친구 약속')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /적용$/ })).not.toBeInTheDocument();
  });

  it('거절하면 넣지 않았다고 말한다', () => {
    renderCard(commitment(), { state: { status: 'dismissed' } });

    expect(screen.getByText('넣지 않았어요.')).toBeInTheDocument();
  });

  it('실패하면 카드를 닫지 않고 그 자리에 이유를 남긴다', () => {
    renderCard(commitment(), { state: { status: 'error', message: '이미 처리된 일정 후보입니다' } });

    expect(screen.getByText('이미 처리된 일정 후보입니다')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /적용$/ })).toBeInTheDocument();
  });

  it('처리 중에는 버튼을 잠근다', () => {
    renderCard(commitment(), { state: { status: 'working' } });

    expect(screen.getByRole('button', { name: /적용$/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /적용 안 함/ })).toBeDisabled();
  });
});
