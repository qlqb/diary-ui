import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../api/api.js', () => ({
  changeBundleAPI: {
    apply: vi.fn(),
    select: vi.fn(),
    refresh: vi.fn(),
    get: vi.fn(),
    dismiss: vi.fn(),
  },
}));

import { changeBundleAPI } from '../api/api.js';
import ChangeBundleCard from './ChangeBundleCard.jsx';

const BUNDLE = {
  bundleId: 7,
  status: 'PROPOSED',
  revision: 1,
  items: [
    { itemId: 1, seq: 1, opType: 'ROUTINE_SKIP', summary: '10/25 쿠팡알바 근무(17:00~02:00) 이날만 빼기', origin: 'PROPOSED',
      selected: true, status: 'PROPOSED', checkCode: 'OK' },
    { itemId: 2, seq: 2, opType: 'ROUTINE_SKIP', summary: '10/25 쿠팡알바 이동시간(15:30~17:00) 이날만 빼기',
      origin: 'INFERRED_LINK', selected: false, status: 'PROPOSED', checkCode: 'OK' },
  ],
};

describe('ChangeBundleCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('적용 전이라고 말하고 추정 연결은 기본 미선택이며 이유를 보인다', () => {
    render(<ChangeBundleCard bundle={BUNDLE} />);
    expect(screen.getByText('변경 제안(아직 적용 전)')).toBeInTheDocument();
    expect(screen.getByLabelText(/쿠팡알바 근무/)).toBeChecked();
    expect(screen.getByLabelText(/이동시간/)).not.toBeChecked();
    expect(screen.getByText(/제목·시각으로 추정한 연결/)).toBeInTheDocument();
  });

  it('적용은 리비전·고른 항목·멱등 키를 보내고, 실패 뒤 다시 눌러도 같은 키를 쓴다', async () => {
    changeBundleAPI.apply.mockRejectedValueOnce(Object.assign(new Error('네트워크 오류'), { code: null }));
    changeBundleAPI.apply.mockResolvedValueOnce({ ...BUNDLE, status: 'APPLIED',
      items: BUNDLE.items.map((i) => ({ ...i, status: i.selected ? 'APPLIED' : 'DISMISSED' })) });
    const onApplied = vi.fn();
    render(<ChangeBundleCard bundle={BUNDLE} onApplied={onApplied} />);

    fireEvent.click(screen.getByRole('button', { name: /고른 1개 적용/ }));
    await waitFor(() => expect(screen.getByText('네트워크 오류')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /고른 1개 적용/ }));
    await waitFor(() => expect(onApplied).toHaveBeenCalled());

    const [first, second] = changeBundleAPI.apply.mock.calls;
    expect(first.slice(0, 3)).toEqual([7, 1, [1]]);
    expect(second[3]).toBe(first[3]); // 같은 시도는 같은 키 — 두 번 적용되지 않는다
    expect(screen.getByText('적용한 변경')).toBeInTheDocument();
  });

  it('검토 뒤 바뀌었으면 다시 검토를 보이고 최신 상태로 다시 확인한다', async () => {
    changeBundleAPI.apply.mockRejectedValueOnce(Object.assign(new Error('검토한 뒤 일정이나 항목이 바뀌었어요.'),
      { code: 'E409_049' }));
    changeBundleAPI.refresh.mockResolvedValueOnce({ ...BUNDLE, revision: 2 });
    render(<ChangeBundleCard bundle={BUNDLE} />);

    fireEvent.click(screen.getByRole('button', { name: /고른 1개 적용/ }));
    const again = await screen.findByRole('button', { name: /다시 검토/ });
    fireEvent.click(again);
    await waitFor(() => expect(changeBundleAPI.refresh).toHaveBeenCalledWith(7, 1));
    expect(await screen.findByRole('button', { name: /고른 1개 적용/ })).toBeInTheDocument();
  });
});
