/**
 * 자료 원본 열기.
 *
 * 여기서 고정하는 것은 "인증이 실리는 경로로 받아서 연다"는 점이다. <a href>로 바꾸면
 * 토큰이 실리지 않아 401이 나고, 토큰을 주소에 붙이면 링크 복사가 곧 유출이 된다.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MaterialFileLink from './MaterialFileLink.jsx';
import { materialStoreAPI } from '../api/api.js';

vi.mock('../api/api.js', () => ({
  materialStoreAPI: { file: vi.fn() },
}));

const BLOB_URL = 'blob:mock-url';

beforeEach(() => {
  vi.clearAllMocks();
  materialStoreAPI.file.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }));
  URL.createObjectURL = vi.fn(() => BLOB_URL);
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('자료 원본 열기', () => {
  it('PDF는 새 탭에서 연다 — 탭은 클릭 즉시 열고 주소만 나중에 넣는다', async () => {
    const tab = { location: null, opener: {}, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab);
    const user = userEvent.setup();

    render(<MaterialFileLink materialId={4} filename="자료구조.pdf" contentType="application/pdf" />);
    await user.click(screen.getByRole('button', { name: /PDF 열기/ }));

    expect(open).toHaveBeenCalledWith('', '_blank');
    await waitFor(() => expect(tab.location).toBe(BLOB_URL));
    expect(materialStoreAPI.file).toHaveBeenCalledWith(4);
    expect(tab.opener).toBeNull();
  });

  it('PDF가 아니면 탭을 열지 않고 내려받는다 — 라벨도 그렇게 말한다', async () => {
    const open = vi.spyOn(window, 'open');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const user = userEvent.setup();

    render(<MaterialFileLink materialId={7} filename="강의.pptx" contentType={null} />);
    await user.click(screen.getByRole('button', { name: /파일 내려받기/ }));

    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(open).not.toHaveBeenCalled();
  });

  it('열지 못하면 이유를 그 자리에 적고 빈 탭을 닫는다', async () => {
    const tab = { location: null, opener: {}, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(tab);
    materialStoreAPI.file.mockRejectedValue(new Error('자료의 원본 파일을 찾을 수 없습니다'));
    const user = userEvent.setup();

    render(<MaterialFileLink materialId={4} filename="자료구조.pdf" contentType="application/pdf" />);
    await user.click(screen.getByRole('button', { name: /PDF 열기/ }));

    expect(await screen.findByText('자료의 원본 파일을 찾을 수 없습니다')).toBeInTheDocument();
    expect(tab.close).toHaveBeenCalled();
  });

  it('이름에 파일명이 붙어 목록에서 어느 자료인지 갈린다', () => {
    render(
      <>
        <MaterialFileLink materialId={4} filename="자료구조.pdf" contentType="application/pdf" />
        <MaterialFileLink materialId={5} filename="네트워크.pdf" contentType="application/pdf" />
      </>,
    );
    expect(screen.getByRole('button', { name: 'PDF 열기 — 자료구조.pdf' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PDF 열기 — 네트워크.pdf' })).toBeInTheDocument();
  });
});
