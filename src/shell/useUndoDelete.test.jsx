import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import useUndoDelete, { UNDO_WINDOW_MS } from './useUndoDelete.js';
import { executionItemAPI } from '../api/api.js';

vi.mock('../api/api.js', () => ({
  executionItemAPI: { restore: vi.fn() },
}));

const ITEM = { executionItemId: 9, version: 2, title: '자료구조 3장 읽기' };

/** window에 실제 keydown을 흘려 단축키 경로를 그대로 지나가게 한다. */
function pressCtrlZ(target = document.body, init = {}) {
  const event = new KeyboardEvent('keydown', {
    key: 'z', ctrlKey: true, bubbles: true, cancelable: true, ...init,
  });
  target.dispatchEvent(event);
  return event;
}

describe('useUndoDelete - 삭제 되돌리기', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executionItemAPI.restore.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('삭제를 기억하기 전에는 Ctrl+Z가 아무 일도 하지 않는다', () => {
    renderHook(() => useUndoDelete({ onRestored: vi.fn() }));

    pressCtrlZ();

    expect(executionItemAPI.restore).not.toHaveBeenCalled();
  });

  it('Ctrl+Z가 삭제가 올려준 version으로 되돌린다', async () => {
    const onRestored = vi.fn();
    const { result } = renderHook(() => useUndoDelete({ onRestored }));

    act(() => result.current.rememberDeleted(ITEM));
    expect(result.current.undoTarget).toMatchObject({ executionItemId: 9, title: ITEM.title });

    await act(async () => { pressCtrlZ(); });

    // 삭제가 version을 1 올렸으므로 되돌리기는 3으로 건다.
    expect(executionItemAPI.restore).toHaveBeenCalledWith(9, 3);
    await waitFor(() => expect(onRestored).toHaveBeenCalled());
    expect(result.current.undoTarget).toBeNull();
  });

  it('버튼으로도 같은 경로를 지나간다', async () => {
    const { result } = renderHook(() => useUndoDelete({ onRestored: vi.fn() }));

    act(() => result.current.rememberDeleted(ITEM));
    await act(async () => { await result.current.undoDelete(); });

    expect(executionItemAPI.restore).toHaveBeenCalledWith(9, 3);
  });

  it('입력 중에는 브라우저 기본 실행 취소를 뺏지 않는다', () => {
    const { result } = renderHook(() => useUndoDelete({ onRestored: vi.fn() }));
    act(() => result.current.rememberDeleted(ITEM));

    const input = document.createElement('input');
    document.body.appendChild(input);
    const event = pressCtrlZ(input);

    expect(executionItemAPI.restore).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    input.remove();
  });

  it('Ctrl+Shift+Z(다시 실행)는 되돌리기가 아니다', () => {
    const { result } = renderHook(() => useUndoDelete({ onRestored: vi.fn() }));
    act(() => result.current.rememberDeleted(ITEM));

    pressCtrlZ(document.body, { shiftKey: true });

    expect(executionItemAPI.restore).not.toHaveBeenCalled();
  });

  it('마지막 한 건만 되돌린다 — 다시 지우면 그것이 대상이 된다', async () => {
    const { result } = renderHook(() => useUndoDelete({ onRestored: vi.fn() }));

    act(() => result.current.rememberDeleted(ITEM));
    act(() => result.current.rememberDeleted({ executionItemId: 12, version: 0, title: '다른 일' }));
    await act(async () => { pressCtrlZ(); });

    expect(executionItemAPI.restore).toHaveBeenCalledTimes(1);
    expect(executionItemAPI.restore).toHaveBeenCalledWith(12, 1);
  });

  it('안내가 사라지면 단축키도 함께 꺼진다 — 눌러도 아무 일이 없는 구간을 만들지 않는다', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useUndoDelete({ onRestored: vi.fn() }));

    act(() => result.current.rememberDeleted(ITEM));
    act(() => { vi.advanceTimersByTime(UNDO_WINDOW_MS + 1); });

    expect(result.current.undoTarget).toBeNull();

    pressCtrlZ();
    expect(executionItemAPI.restore).not.toHaveBeenCalled();
  });

  it('되돌리지 못해도 다시 알리지 않고 안내만 접는다', async () => {
    executionItemAPI.restore.mockRejectedValue(new Error('버전이 일치하지 않습니다'));
    const onRestored = vi.fn();
    const { result } = renderHook(() => useUndoDelete({ onRestored }));

    act(() => result.current.rememberDeleted(ITEM));
    await act(async () => { await result.current.undoDelete(); });

    // 원래 하려던 일(삭제)은 이미 됐고, 항목은 soft delete라 서버에 그대로 있다.
    expect(result.current.undoTarget).toBeNull();
    expect(onRestored).not.toHaveBeenCalled();
  });
});
