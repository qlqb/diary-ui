import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ZipImportPanel from './ZipImportPanel.jsx';
import { zipImportAPI } from '../api/api.js';

vi.mock('../api/api.js', () => ({
  zipImportAPI: {
    get: vi.fn(),
    confirm: vi.fn(),
    retryEntry: vi.fn(),
    cancel: vi.fn(),
  },
}));

const READY = {
  importId: 5,
  originalFilename: '3주차.zip',
  status: 'READY',
  entryCount: 4,
  selectableCount: 2,
  doneCount: 0,
  failedCount: 0,
  remainingCount: 0,
  archiveAvailable: true,
  entries: [
    { entryId: 11, entryPath: '3주차/강의.pdf', displayName: '강의.pdf', extension: 'pdf', sizeBytes: 2048, supported: true, status: 'PENDING' },
    { entryId: 12, entryPath: '3주차/실습.ipynb', displayName: '실습.ipynb', extension: 'ipynb', sizeBytes: 1024, supported: true, status: 'PENDING' },
    { entryId: 13, entryPath: '3주차/데이터.csv', displayName: '데이터.csv', extension: 'csv', sizeBytes: 500, supported: false, skipReason: '지원하지 않는 형식이에요', status: 'UNSUPPORTED' },
    { entryId: 14, entryPath: '3주차/묶음.zip', displayName: '묶음.zip', extension: 'zip', sizeBytes: 900, supported: false, skipReason: '압축 안의 압축은 이번에 가져오지 않아요', status: 'UNSUPPORTED' },
  ],
};

describe('압축 가져오기 패널', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('지원하는 파일만 기본 선택되고, 나머지는 이유가 보인다', () => {
    render(<ZipImportPanel zipImport={READY} onChanged={vi.fn()} onClose={vi.fn()} />);

    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
    expect(boxes.every((box) => box.checked)).toBe(true);
    expect(screen.getByText('지원하지 않는 형식이에요')).toBeInTheDocument();
    expect(screen.getByText('압축 안의 압축은 이번에 가져오지 않아요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /2개 가져오기/ })).toBeInTheDocument();
    // 압축 자체는 자료가 되지 않는다는 것을 화면이 말한다.
    expect(screen.getByText(/압축 자체는 자료가 되지 않아요/)).toBeInTheDocument();
  });

  it('선택을 풀면 그만큼만 확정한다', async () => {
    const user = userEvent.setup();
    zipImportAPI.confirm.mockResolvedValue({ ...READY, status: 'IMPORTING', remainingCount: 1 });
    const onChanged = vi.fn();
    render(<ZipImportPanel zipImport={READY} onChanged={onChanged} onClose={vi.fn()} />);

    await user.click(screen.getAllByRole('checkbox')[1]);
    await user.click(screen.getByRole('button', { name: /1개 가져오기/ }));

    expect(zipImportAPI.confirm).toHaveBeenCalledWith(5, [11]);
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('가져오는 중에는 항목별 상태를 보여주고 고르기를 닫는다', () => {
    render(<ZipImportPanel onChanged={vi.fn()} onClose={vi.fn()} zipImport={{
      ...READY,
      status: 'IMPORTING',
      doneCount: 1,
      remainingCount: 1,
      entries: [
        { ...READY.entries[0], status: 'DONE', materialId: 77 },
        { ...READY.entries[1], status: 'IMPORTING' },
        READY.entries[2], READY.entries[3],
      ],
    }} />);

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText('자료 등록 완료')).toBeInTheDocument();
    expect(screen.getByText('가져오는 중')).toBeInTheDocument();
    // "완료"가 어디까지의 완료인지 말한다 — 분석은 그 다음이다.
    expect(screen.getByText(/자동 분석이 이어서 돌아요/)).toBeInTheDocument();
  });

  it('일부 실패면 실패한 것만 다시 시도한다', async () => {
    const user = userEvent.setup();
    const partial = {
      ...READY,
      status: 'PARTIAL',
      doneCount: 1,
      failedCount: 1,
      remainingCount: 0,
      entries: [
        { ...READY.entries[0], status: 'DONE', materialId: 77 },
        { ...READY.entries[1], status: 'FAILED', errorMessage: '파일이 손상됐어요' },
        READY.entries[2], READY.entries[3],
      ],
    };
    zipImportAPI.retryEntry.mockResolvedValue({ ...partial, status: 'IMPORTING' });
    render(<ZipImportPanel zipImport={partial} onChanged={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByText('파일이 손상됐어요')).toBeInTheDocument();
    expect(screen.getByText(/자료 1개 등록 · 1개 실패/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /실패한 1개 다시/ }));

    expect(zipImportAPI.retryEntry).toHaveBeenCalledWith(5, 12);
    // 이미 자료가 된 항목은 다시 만들지 않는다 — 실패한 항목만 보낸다.
    expect(zipImportAPI.retryEntry).toHaveBeenCalledTimes(1);
  });

  it('원본 압축이 지워졌으면 다시 시도 버튼을 주지 않는다', () => {
    render(<ZipImportPanel onChanged={vi.fn()} onClose={vi.fn()} zipImport={{
      ...READY,
      status: 'PARTIAL',
      archiveAvailable: false,
      failedCount: 1,
      entries: [{ ...READY.entries[1], status: 'FAILED', errorMessage: '파일이 손상됐어요' }],
    }} />);

    expect(screen.queryByRole('button', { name: /다시/ })).not.toBeInTheDocument();
  });

  it('진행 중이면 서버 상태를 따라본다', async () => {
    vi.useFakeTimers();
    try {
      zipImportAPI.get.mockResolvedValue({ ...READY, status: 'COMPLETED', doneCount: 2 });
      const onChanged = vi.fn();
      render(<ZipImportPanel onChanged={onChanged} onClose={vi.fn()}
        zipImport={{ ...READY, status: 'IMPORTING', remainingCount: 2 }} />);

      await vi.advanceTimersByTimeAsync(2000);

      expect(zipImportAPI.get).toHaveBeenCalledWith(5);
      expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ status: 'COMPLETED' }));
    } finally {
      vi.useRealTimers();
    }
  });

  it('끝난 가져오기는 더 이상 두드리지 않는다', async () => {
    vi.useFakeTimers();
    try {
      render(<ZipImportPanel onChanged={vi.fn()} onClose={vi.fn()}
        zipImport={{ ...READY, status: 'COMPLETED', doneCount: 2, remainingCount: 0 }} />);

      await vi.advanceTimersByTimeAsync(5000);

      expect(zipImportAPI.get).not.toHaveBeenCalled();
      expect(screen.getByText(/자료 2개 등록 완료/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('목록은 안쪽에서 스크롤해 버튼이 밀려나지 않는다', () => {
    const { container } = render(
      <ZipImportPanel zipImport={READY} onChanged={vi.fn()} onClose={vi.fn()} />);

    const list = container.querySelector('.zip-import-list');
    const foot = container.querySelector('.zip-import-foot');
    expect(list).toBeInTheDocument();
    expect(foot).toBeInTheDocument();
    // 목록과 바닥글이 형제다 — 목록이 길어져도 바닥글은 패널 안에 남는다.
    expect(within(foot).getByRole('button', { name: /2개 가져오기/ })).toBeInTheDocument();
  });
});
