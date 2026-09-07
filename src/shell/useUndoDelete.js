/**
 * 지운 실행 조각을 되돌리는 장치.
 *
 * 삭제 확인 창을 없앤 대신 여기가 안전망이다. 확인 창은 "지우기 전에 한 번 더 생각하게"
 * 하지만 실제로는 매번 누르는 관문이 되어 읽히지 않는다. 지운 뒤 되돌릴 수 있으면 잘못
 * 눌러도 비용이 0에 가깝고, 맞게 누른 사람은 방해받지 않는다.
 *
 * 여러 건을 쌓아 둔다. 한 번 누를 때 하나씩, 마지막에 지운 것부터 돌아온다 — 실행 취소는
 * 원래 그렇게 동작한다. 항목마다 자기 창을 따로 갖는다: 3분 전에 지운 것과 방금 지운 것이
 * 같이 만료되면, 화면에 남아 있던 되돌리기가 이유 없이 사라진다.
 *
 * 되돌릴 수 있는 시간과 안내가 떠 있는 시간은 같다. 안내가 사라졌는데 단축키만 살아 있으면
 * 눌러도 아무 일이 없는 구간이 생기고, 그건 고장으로 읽힌다.
 *
 * 되돌리기가 실패해도 다시 알리지 않는다. 사용자가 요청한 조작이 아니라 방금 한 조작을
 * 취소하려던 것이고, 실패해도 원래 하려던 일(삭제)은 이미 됐다. 항목은 soft delete라
 * 서버에 그대로 있다 — 사라지는 것은 되돌릴 "길"이지 데이터가 아니다.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { executionItemAPI } from '../api/api.js';

/** 되돌리기 안내가 떠 있는 시간. 이 창이 닫히면 그 항목의 Ctrl+Z도 함께 꺼진다. */
export const UNDO_WINDOW_MS = 8000;

let undoSeq = 0;
const nextKey = () => (undoSeq += 1);

/** 입력 중에는 브라우저 기본 실행 취소를 뺏지 않는다. */
function isTyping(el) {
  return Boolean(el?.isContentEditable)
      || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName);
}

export default function useUndoDelete({ onRestored }) {
  const [undoStack, setUndoStack] = useState([]);
  const [undoBusy, setUndoBusy] = useState(false);
  const timersRef = useRef(new Map());

  const dropEntry = useCallback((key) => {
    const timer = timersRef.current.get(key);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(key);
    }
    setUndoStack((prev) => prev.filter((entry) => entry.key !== key));
  }, []);

  /**
   * version은 삭제가 올려준 값이다 — 서버의 모든 *WithVersion 갱신이 version을 정확히
   * 1 올린다. 어긋나면 restore가 409를 주고, 그때는 조용히 그 줄만 접는다.
   */
  const rememberDeleted = useCallback((item) => {
    const key = nextKey();
    setUndoStack((prev) => [...prev, {
      key,
      executionItemId: item.executionItemId,
      version: (item.version ?? 0) + 1,
      title: item.title,
    }]);
    timersRef.current.set(key, setTimeout(() => dropEntry(key), UNDO_WINDOW_MS));
  }, [dropEntry]);

  const undoDelete = useCallback(async () => {
    if (undoBusy) return;
    const target = undoStack[undoStack.length - 1];
    if (!target) return;

    setUndoBusy(true);
    try {
      await executionItemAPI.restore(target.executionItemId, target.version);
      dropEntry(target.key);
      await onRestored?.();
    } catch {
      dropEntry(target.key);
    } finally {
      setUndoBusy(false);
    }
  }, [undoBusy, undoStack, dropEntry, onRestored]);

  // 되돌릴 것이 있을 때만 단축키를 건다.
  useEffect(() => {
    if (undoStack.length === 0) return undefined;

    const onKeyDown = (e) => {
      if (e.key !== 'z' && e.key !== 'Z') return;
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      if (isTyping(e.target)) return;

      e.preventDefault();
      undoDelete();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undoStack, undoDelete]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  return {
    /** 다음 Ctrl+Z가 되살릴 것. 안내에 이름을 띄우는 데 쓴다. */
    undoTarget: undoStack[undoStack.length - 1] ?? null,
    undoCount: undoStack.length,
    undoBusy,
    rememberDeleted,
    undoDelete,
  };
}
