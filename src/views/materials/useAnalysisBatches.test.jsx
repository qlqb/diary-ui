/**
 * 분석 묶음 목록 — 서버가 확인하지 않은 것을 끝났다고 보여 주지 않는다.
 *
 * 2026-09-21 판의 결함: 열린 목록이 5개에서 잘렸고, 이 훅은 목록에서 빠진 묶음을 곧바로
 * FINISHED로 바꾸고 이전 진행률을 그대로 붙였다. 그래서 여섯 번째 묶음을 만드는 순간 40% 분석
 * 중이던 묶음이 "처리 종료 · 40%"가 됐다. 목록에 없다는 것은 끝났다는 증거가 아니다.
 *
 * 여기서 고정하는 것:
 *  - 열린 목록을 끝까지 넘겨 읽는다.
 *  - 그래도 빠진 묶음은 하나씩 서버에 묻고, 그 답(최종 수와 실제 진행률)을 그대로 쓴다.
 *  - 물어도 답이 없으면 "모른다"로 두고 끝났다고 하지 않는다.
 *  - 프로젝트를 옮긴 뒤 도착한 응답은 새 프로젝트에 섞이지 않는다.
 *  - 다시 시도해 다시 끝나면 다시 알린다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

vi.mock('../../api/api.js', () => ({
  analysisBatchAPI: {
    estimate: vi.fn(), create: vi.fn(), get: vi.fn(), listOpen: vi.fn(), listOpenPage: vi.fn(),
  },
  materialStoreAPI: { upload: vi.fn() },
  materialAPI: { upload: vi.fn() },
}));

import { useAnalysisBatches } from './useAnalysisBatches.js';
import { analysisBatchAPI } from '../../api/api.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** 서버가 돌려주는 묶음 하나. */
const batch = (batchId, overrides = {}) => ({
  batchId,
  courseId: null,
  status: 'ANALYZING',
  itemCount: 5,
  processedPercent: 40,
  doneCount: 2,
  runningCount: 1,
  waitingCount: 2,
  failedCount: 0,
  skippedCount: 0,
  finishedAt: null,
  items: [],
  ...overrides,
});

/**
 * 서버의 쪽 나눈 목록을 흉내 낸다. 옛 목록 경로(listOpen)도 옛 서버처럼 최대 5개를 준다 —
 * 수정 전 훅으로 같은 테스트를 돌려 결함을 재현할 때 그 경로를 탄다.
 */
function serveOpen(all, pageSize = 20) {
  analysisBatchAPI.listOpen.mockImplementation(async () => [...all]
    .sort((a, b) => b.batchId - a.batchId).slice(0, 5));
  analysisBatchAPI.listOpenPage.mockImplementation(async ({ cursor = null } = {}) => {
    const sorted = [...all].sort((a, b) => b.batchId - a.batchId);
    const after = cursor == null ? sorted : sorted.filter((b) => b.batchId < cursor);
    const page = after.slice(0, pageSize);
    return {
      batches: page,
      nextCursor: after.length > pageSize ? page[page.length - 1].batchId : null,
      totalOpen: sorted.length,
    };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('열린 묶음 목록', () => {
  it('여섯 번째 묶음이 생겨도 앞 묶음이 끝났다고 바뀌지 않는다', async () => {
    // 서버에는 열린 묶음이 여섯 개. 한 쪽에 다섯 개씩 준다.
    const six = [1, 2, 3, 4, 5, 6].map((id) => batch(id));
    serveOpen(six, 5);
    const { result } = renderHook(() => useAnalysisBatches());

    await waitFor(() => expect(result.current.batches).toHaveLength(6));
    const first = result.current.batches.find((b) => b.batchId === 1);
    expect(first.status).toBe('ANALYZING');
    expect(first.processedPercent).toBe(40);
  });

  it('목록에서 빠진 묶음은 서버에 물어 그 답을 그대로 쓴다', async () => {
    serveOpen([batch(7)]);
    const { result } = renderHook(() => useAnalysisBatches());
    await waitFor(() => expect(result.current.batches).toHaveLength(1));

    // 이제 목록에서 빠졌다. 서버는 실제로 끝났다고, 실패 하나를 포함해 답한다.
    serveOpen([]);
    analysisBatchAPI.get.mockResolvedValue(batch(7, {
      status: 'FINISHED', processedPercent: 100, doneCount: 4, failedCount: 1, finishedAt: '2026-09-21T10:00:00',
    }));
    await act(async () => { await result.current.refresh(); });

    const seven = result.current.batches.find((b) => b.batchId === 7);
    expect(analysisBatchAPI.get).toHaveBeenCalledWith(7);
    expect(seven.status).toBe('FINISHED');
    // 이전 40%를 복사해 "완료"만 붙이지 않는다. 서버의 최종 수를 쓴다.
    expect(seven.processedPercent).toBe(100);
    expect(seven.failedCount).toBe(1);
  });

  it('물어도 답이 없으면 끝났다고 하지 않는다', async () => {
    serveOpen([batch(8)]);
    const { result } = renderHook(() => useAnalysisBatches());
    await waitFor(() => expect(result.current.batches).toHaveLength(1));

    serveOpen([]);
    analysisBatchAPI.get.mockRejectedValue(new Error('네트워크'));
    await act(async () => { await result.current.refresh(); });

    const eight = result.current.batches.find((b) => b.batchId === 8);
    expect(eight.status).toBe('ANALYZING');
    expect(eight.unknown).toBe(true);
  });

  it('목록을 한 쪽이라도 못 읽으면 아무것도 바꾸지 않는다', async () => {
    serveOpen([batch(9)]);
    const { result } = renderHook(() => useAnalysisBatches());
    await waitFor(() => expect(result.current.batches).toHaveLength(1));

    analysisBatchAPI.listOpenPage.mockRejectedValue(new Error('서버 오류'));
    await act(async () => { await result.current.refresh(); });

    expect(result.current.batches[0].status).toBe('ANALYZING');
    expect(analysisBatchAPI.get).not.toHaveBeenCalled();
  });
});

describe('늦게 온 응답', () => {
  it('프로젝트를 옮긴 뒤 도착한 묶음 응답은 새 프로젝트에 섞이지 않는다', async () => {
    serveOpen([]);
    const slow = deferred();
    analysisBatchAPI.get.mockReturnValueOnce(slow.promise);
    const { result, rerender } = renderHook(({ courseId }) => useAnalysisBatches({ courseId }),
      { initialProps: { courseId: 1 } });
    await waitFor(() => expect(analysisBatchAPI.listOpenPage).toHaveBeenCalled());

    let pending;
    act(() => { pending = result.current.refreshOne(40); });
    rerender({ courseId: 2 });
    await waitFor(() => expect(analysisBatchAPI.listOpenPage).toHaveBeenCalledTimes(2));

    await act(async () => { slow.resolve(batch(40, { courseId: 1 })); await pending; });

    expect(result.current.batches.find((b) => b.batchId === 40)).toBeUndefined();
  });

  it('먼저 보낸 요청의 답이 나중에 와도 더 새 답을 덮지 않는다', async () => {
    serveOpen([batch(50)]);
    const { result } = renderHook(() => useAnalysisBatches());
    await waitFor(() => expect(result.current.batches).toHaveLength(1));

    const older = deferred();
    analysisBatchAPI.get.mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce(batch(50, { processedPercent: 80 }));
    let first;
    act(() => { first = result.current.refreshOne(50); });
    await act(async () => { await result.current.refreshOne(50); });
    expect(result.current.batches[0].processedPercent).toBe(80);

    await act(async () => { older.resolve(batch(50, { processedPercent: 45 })); await first; });
    expect(result.current.batches[0].processedPercent).toBe(80);
  });
});

describe('다시 시도', () => {
  it('다시 열렸다가 다시 끝나면 끝남을 다시 알린다', async () => {
    const onBatchFinished = vi.fn();
    serveOpen([]);
    analysisBatchAPI.get.mockResolvedValueOnce(batch(60, {
      status: 'FINISHED', failedCount: 1, finishedAt: '2026-09-21T10:00:00',
    }));
    const { result } = renderHook(() => useAnalysisBatches({ onBatchFinished }));
    await waitFor(() => expect(analysisBatchAPI.listOpenPage).toHaveBeenCalled());

    await act(async () => { await result.current.refreshOne(60); });
    expect(onBatchFinished).toHaveBeenCalledTimes(1);

    // 실패한 것을 다시 돌렸다 → 서버가 묶음을 다시 연다.
    analysisBatchAPI.get.mockResolvedValueOnce(batch(60, { status: 'ANALYZING', finishedAt: null }));
    await act(async () => { await result.current.refreshOne(60); });
    expect(result.current.batches[0].status).toBe('ANALYZING');

    // 다시 끝났다. 새 종료 시각.
    analysisBatchAPI.get.mockResolvedValueOnce(batch(60, {
      status: 'FINISHED', failedCount: 0, doneCount: 5, finishedAt: '2026-09-21T10:05:00',
    }));
    await act(async () => { await result.current.refreshOne(60); });
    expect(onBatchFinished).toHaveBeenCalledTimes(2);
  });
});
