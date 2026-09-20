/**
 * 실행 기록의 "걸린 점(선택)"과 시간 문구를 고정한다.
 *
 * 걸린 점은 어디까지나 선택이다 — 고르지 않아도 기록되고, 고르지 않았으면 필드 자체를 보내지 않는다.
 * 문구는 사용자의 말투이고 탓하는 말이 없다. 사용자가 적은 시간은 "측정"이라고 부르지 않는다.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// 근거 펼침은 이 테스트의 관심사가 아니다. api를 끌고 들어오지 않게 비운다.
vi.mock('../views/plan/ExecutionItemEvidence.jsx', () => ({ default: () => null }));

import ExecutionRow from './ExecutionRow.jsx';

const ITEM = {
  executionItemId: 11, title: '연결 리스트 예제 풀기', scheduledDate: '2026-09-19', startTime: null, endTime: null,
  estimatedMinutes: 40, status: 'PLANNED', priority: 'SHOULD', version: 3,
};

function setup() {
  const onAction = vi.fn().mockResolvedValue({ ok: true });
  render(<ExecutionRow item={ITEM} onAction={onAction} />);
  return { onAction, user: userEvent.setup() };
}

describe('ExecutionRow - 걸린 점(선택)', () => {
  it('일부 했어요: 네 가지 이유가 사용자 말투로 보이고, 고른 것이 blockerKind로 간다', async () => {
    const { onAction, user } = setup();
    await user.click(screen.getByRole('button', { name: '일부 했어요' }));

    const group = screen.getByRole('group', { name: '걸린 점이 있었다면 (선택)' });
    expect(group).toBeInTheDocument();
    ['시간이 없었어', '개념에서 막혔어', '컨디션이 안 좋았어', '다른 이유'].forEach((label) => {
      expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'false');
    });

    await user.click(screen.getByRole('button', { name: '개념에서 막혔어' }));
    expect(screen.getByRole('button', { name: '개념에서 막혔어' })).toHaveAttribute('aria-pressed', 'true');
    await user.type(screen.getByLabelText('메모 (선택)'), '포인터가 헷갈림');
    await user.type(screen.getByLabelText('실제 걸린 시간(분)'), '25');
    await user.click(screen.getByRole('button', { name: '기록' }));

    expect(onAction).toHaveBeenCalledWith('partial', ITEM, {
      completionPercent: 50, actualMinutes: 25, blockerKind: 'CONCEPT', note: '포인터가 헷갈림',
    });
  });

  it('이유를 고르지 않아도 기록되고, 그때는 blockerKind를 아예 보내지 않는다', async () => {
    const { onAction, user } = setup();
    await user.click(screen.getByRole('button', { name: '일부 했어요' }));
    await user.click(screen.getByRole('button', { name: '시간은 모르겠어요' }));

    expect(onAction).toHaveBeenCalledWith('partial', ITEM, { completionPercent: 50 });
    const payload = onAction.mock.calls[0][2];
    expect(payload).not.toHaveProperty('blockerKind');
    expect(payload).not.toHaveProperty('actualMinutes');
  });

  it('고른 이유를 다시 누르면 풀린다', async () => {
    const { onAction, user } = setup();
    await user.click(screen.getByRole('button', { name: '일부 했어요' }));
    await user.click(screen.getByRole('button', { name: '시간이 없었어' }));
    await user.click(screen.getByRole('button', { name: '시간이 없었어' }));
    await user.click(screen.getByRole('button', { name: '시간은 모르겠어요' }));

    expect(onAction.mock.calls[0][2]).not.toHaveProperty('blockerKind');
  });

  it('완료: 걸린 점은 접혀 있고, 펼쳐 고르면 함께 간다', async () => {
    const { onAction, user } = setup();
    await user.click(screen.getByRole('button', { name: '완료' }));
    expect(screen.queryByRole('group', { name: '걸린 점이 있었다면 (선택)' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '걸린 점 남기기 (선택)' }));
    await user.click(screen.getByRole('button', { name: '컨디션이 안 좋았어' }));
    await user.click(screen.getByRole('button', { name: '모르겠어요' }));

    expect(onAction).toHaveBeenCalledWith('complete', ITEM, { blockerKind: 'ENERGY' });
  });

  it('탓하는 말이 없고, 사용자가 적는 시간을 "측정"이라고 부르지 않는다', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: '일부 했어요' }));

    expect(screen.getByText('내가 적은 시간')).toBeInTheDocument();
    const text = document.body.textContent;
    expect(text).not.toMatch(/측정|왜 못|실패|게으|미달/);
    expect(screen.getByText(/고르지 않아도 기록돼요/)).toBeInTheDocument();
  });

  it('완료 기록에서 시간을 비우면 "시간 미기록"이 된다고 말한다 — 계획 시간으로 채우지 않는다', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: '완료' }));
    expect(screen.getByText(/비워 두면 "시간 미기록"이에요/)).toBeInTheDocument();
    expect(screen.getByLabelText('실제 걸린 시간(분)')).toHaveValue(null);
  });
});
