/**
 * 방금 지운 실행 조각을 되돌리는 장치.
 *
 * 삭제 확인 창을 없앤 대신 여기가 안전망이다. 확인 창은 "지우기 전에 한 번 더 생각하게"
 * 하지만 실제로는 매번 누르는 관문이 되어 읽히지 않는다. 지운 뒤 되돌릴 수 있으면 잘못
 * 눌러도 비용이 0에 가깝고, 맞게 누른 사람은 방해받지 않는다.
 *
 * 한 건만 기억한다. 여러 단계 실행 취소는 "지금 Ctrl+Z를 누르면 무엇이 돌아오는지"를
 * 사용자가 머릿속으로 세게 만드는데, 방금 지운 것 하나만 되돌릴 수 있으면 그 질문이 아예
 * 생기지 않는다.
 *
 * 되돌릴 수 있는 시간과 안내가 떠 있는 시간을 같은 타이머로 묶는다. 안내가 사라졌는데
 * 단축키만 살아 있으면 눌러도 아무 일이 없는 구간이 생기고, 그건 고장으로 읽힌다.
 *
 * 되돌리기가 실패해도 다시 알리지 않는다. 사용자가 요청한 조작이 아니라 방금 한 조작을
 * 취소하려던 것이고, 실패해도 원래 하려던 일(삭제)은 이미 됐다. 항목은 soft delete라
 * 서버에 그대로 있다 — 사라지는 것은 되돌릴 "길"이지 데이터가 아니다.
 */

import { useCallback, useEffect, useState } from 'react';
import { executionItemAPI } from '../api/api.js';

/** 되돌리기 안내가 떠 있는 시간. 이 창이 닫히면 Ctrl+Z도 함께 꺼진다. */
export const UNDO_WINDOW_MS = 8000;

/** 입력 중에는 브라우저 기본 실행 취소를 뺏지 않는다. */
function isTyping(el) {
  return Boolean(el?.isContentEditable)
      || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName);
}

export default function useUndoDelete({ onRestored }) {
  const [undoTarget, setUndoTarget] = useState(null);
  const [undoBusy, setUndoBusy] = useState(false);

  /**
   * version은 삭제가 올려준 값이다 — 서버의 모든 *WithVersion 갱신이 version을 정확히
   * 1 올린다. 어긋나면 restore가 409를 주고, 그때는 조용히 안내만 지운다.
   */
  const rememberDeleted = useCallback((item) => {
    setUndoTarget({
      executionItemId: item.executionItemId,
      version: (item.version ?? 0) + 1,
      title: item.title,
    });
  }, []);

  const undoDelete = useCallback(async () => {
    if (!undoTarget || undoBusy) return;

    setUndoBusy(true);
    try {
      await executionItemAPI.restore(undoTarget.executionItemId, undoTarget.version);
      setUndoTarget(null);
      await onRestored?.();
    } catch {
      setUndoTarget(null);
    } finally {
      setUndoBusy(false);
    }
  }, [undoTarget, undoBusy, onRestored]);

  // 되돌릴 것이 있을 때만 단축키를 건다.
  useEffect(() => {
    if (!undoTarget) return undefined;

    const onKeyDown = (e) => {
      if (e.key !== 'z' && e.key !== 'Z') return;
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      if (isTyping(e.target)) return;

      e.preventDefault();
      undoDelete();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undoTarget, undoDelete]);

  useEffect(() => {
    if (!undoTarget) return undefined;
    const timer = setTimeout(() => setUndoTarget(null), UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [undoTarget]);

  return { undoTarget, undoBusy, rememberDeleted, undoDelete };
}
