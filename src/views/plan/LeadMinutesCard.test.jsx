/**
 * 이동시간 질문 카드.
 *
 * 지키는 선: 그룹마다 한 줄, 「없음」은 0으로 보내진다(null이 아니다 — null은 "아직 모름"이라
 * 다시 묻게 된다), 「나중에」는 아무것도 보내지 않는다, 직접 입력은 0~480 정수만 보낼 수 있다.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import LeadMinutesCard from './LeadMinutesCard.jsx';
import { parseCustomMinutes } from './leadMinutes.js';

const GROUPS = [
  {
    groupKey: '자료구조', label: '자료구조', routineIds: [1],
    sample: [{ dayOfWeek: 'TUESDAY', startTime: '14:00:00' }],
  },
  {
    groupKey: '웹서버', label: '웹서버', routineIds: [2, 3],
    sample: [{ dayOfWeek: 'WEDNESDAY', startTime: '09:00:00' }, { dayOfWeek: 'FRIDAY', startTime: '09:00:00' }],
  },
];

function renderCard(groups = GROUPS, props = {}) {
  const onSubmit = vi.fn();
  const onLater = vi.fn();
  render(<LeadMinutesCard groups={groups} onSubmit={onSubmit} onLater={onLater} {...props} />);
  return { onSubmit, onLater };
}

describe('LeadMinutesCard', () => {
  it('그룹 수만큼 줄을 그리고 샘플 시각을 보여준다', () => {
    renderCard();

    expect(screen.getByText('이 일정들 전 이동시간은 얼마나 걸리나요?')).toBeInTheDocument();
    expect(screen.getAllByRole('group')).toHaveLength(2);
    expect(screen.getByText('화 14:00')).toBeInTheDocument();
    expect(screen.getByText('수 09:00, 금 09:00')).toBeInTheDocument();
  });

  it('그룹이 하나면 그 이름으로 묻는다', () => {
    renderCard([GROUPS[0]]);

    expect(screen.getByText('자료구조 전 이동시간은 얼마나 걸리나요?')).toBeInTheDocument();
  });

  it('전부 고르기 전에는 보낼 수 없고, 「없음」은 0으로 보낸다', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderCard();
    const save = screen.getByRole('button', { name: '이대로 저장' });

    expect(save).toBeDisabled();
    await user.click(within(screen.getByRole('group', { name: '자료구조 이동시간' })).getByRole('button', { name: '1시간' }));
    expect(save).toBeDisabled();
    await user.click(within(screen.getByRole('group', { name: '웹서버 이동시간' })).getByRole('button', { name: '없음' }));
    expect(save).toBeEnabled();

    await user.click(save);

    expect(onSubmit).toHaveBeenCalledWith([
      { routineId: 1, leadMinutes: 60 },
      { routineId: 2, leadMinutes: 0 },
      { routineId: 3, leadMinutes: 0 },
    ]);
  });

  it('「나중에」는 아무것도 보내지 않는다', async () => {
    const user = userEvent.setup();
    const { onSubmit, onLater } = renderCard();

    await user.click(screen.getByRole('button', { name: '나중에' }));

    expect(onLater).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('직접 입력은 0~480 정수만 보낼 수 있다', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderCard([GROUPS[0]]);
    const save = screen.getByRole('button', { name: '이대로 저장' });

    await user.click(screen.getByRole('button', { name: '직접 입력' }));
    const input = screen.getByRole('spinbutton', { name: '자료구조 이동시간(분)' });

    await user.type(input, '481');
    expect(save).toBeDisabled();

    await user.clear(input);
    await user.type(input, '-5');
    expect(save).toBeDisabled();

    await user.clear(input);
    await user.type(input, '45');
    expect(save).toBeEnabled();
    await user.click(save);

    expect(onSubmit).toHaveBeenCalledWith([{ routineId: 1, leadMinutes: 45 }]);
  });

  it('parseCustomMinutes는 경계를 그대로 지킨다', () => {
    expect(parseCustomMinutes('0')).toBe(0);
    expect(parseCustomMinutes('480')).toBe(480);
    expect(parseCustomMinutes('481')).toBeNull();
    expect(parseCustomMinutes('-1')).toBeNull();
    expect(parseCustomMinutes('1.5')).toBeNull();
    expect(parseCustomMinutes('')).toBeNull();
  });
});

