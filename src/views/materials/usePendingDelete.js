/**
 * 자료 삭제를 잠깐 미뤄 두고, 그 사이에는 없던 일로 되돌릴 수 있게 하는 장치.
 *
 * ★ 실행 조각(useUndoDelete)과 방향이 반대다. 거기서는 바로 지우고 되돌릴 때 서버에
 *   복구를 건다. 여기서는 되돌릴 수가 없어서 아예 늦게 지운다.
 *
 * 자료 삭제는 되돌릴 수 없다. 서버가 링크를 물리 삭제하고, extracted_text를 NULL로 비우고,
 * 디스크의 원본 파일까지 지운다. 그중 extracted_text를 비우는 것은 "남겨두면 AI가 계속
 * 읽을 수 있으니 삭제는 삭제여야 한다"는 의도된 결정이라, 되돌리기를 만들자고 그 결정을
 * 뒤집지 않는다.
 *
 * 그래서 되돌리기의 의미가 다르다 — 되돌리기는 복구가 아니라 "아직 보내지 않은 요청을
 * 취소하는 것"이다. 창이 열려 있는 동안 서버는 아무것도 모른다.
 *
 * 여러 건을 동시에 미뤄 둔다. 각자 자기 타이머를 갖고 따로 만료되며, 되돌리기는 마지막에
 * 지운 것부터 하나씩 취소한다. 앞의 것을 뒤의 것 때문에 서둘러 보내지 않는다 — 지운 순서와
 * 되돌리는 순서만 맞으면 사용자가 무엇이 남았는지 셀 필요가 없다.
 *
 * 늦게 지우기 때문에 지켜야 하는 것이 하나 늘어난다: 창이 닫히기 전에 화면을 떠나도 삭제는
 * 되어야 한다. 사용자는 이미 지웠다고 생각하고 떠났기 때문이다. 언마운트에서 남은 것을
 * 전부 흘려보낸다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { materialStoreAPI } from '../../api/api.js';

/** 되돌리기 안내가 떠 있는 시간. 이 창이 닫히는 순간 그 자료를 실제로 지운다. */
export const PENDING_DELETE_WINDOW_MS = 8000;

/** 입력 중에는 브라우저 기본 실행 취소를 뺏지 않는다. */
function isTyping(el) {
  return Boolean(el?.isContentEditable)
      || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName);
}

export default function usePendingDelete({ onCommitted, onFailed }) {
  const [pending, setPending] = useState([]);
  const pendingRef = useRef([]);
  const timersRef = useRef(new Map());

  const setPendingBoth = useCallback((update) => {
    const next = typeof update === 'function' ? update(pendingRef.current) : update;
    pendingRef.current = next;
    setPending(next);
  }, []);

  /** 실제로 지운다. 창이 닫혔거나 화면을 떠났을 때. */
  const commit = useCallback(async (target) => {
    if (!target) return;
    try {
      await materialStoreAPI.delete(target.materialId);
      await onCommitted?.();
    } catch (err) {
      // 여기서는 화면에서 이미 사라진 뒤다 — 목록을 다시 읽어 실제 상태로 되돌려야 한다.
      await onFailed?.(err);
    }
  }, [onCommitted, onFailed]);

  const commitRef = useRef(commit);
  useEffect(() => { commitRef.current = commit; });

  const schedule = useCallback((material) => {
    const entry = { materialId: material.materialId, title: material.originalFilename };
    setPendingBoth((prev) => [...prev, entry]);

    timersRef.current.set(material.materialId, setTimeout(() => {
      timersRef.current.delete(material.materialId);
      setPendingBoth((prev) => prev.filter((it) => it.materialId !== material.materialId));
      commitRef.current(entry);
    }, PENDING_DELETE_WINDOW_MS));
  }, [setPendingBoth]);

  /** 되돌리기 = 아직 보내지 않은 요청을 취소하는 것. 서버는 이 일을 모른다. */
  const undo = useCallback(() => {
    const target = pendingRef.current[pendingRef.current.length - 1];
    if (!target) return;

    const timer = timersRef.current.get(target.materialId);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(target.materialId);
    }
    setPendingBoth((prev) => prev.filter((it) => it.materialId !== target.materialId));
  }, [setPendingBoth]);

  // 되돌릴 것이 있을 때만 단축키를 건다.
  useEffect(() => {
    if (pending.length === 0) return undefined;

    const onKeyDown = (e) => {
      if (e.key !== 'z' && e.key !== 'Z') return;
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      if (isTyping(e.target)) return;

      e.preventDefault();
      undo();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pending, undo]);

  /*
    창이 닫히기 전에 화면을 떠나도 삭제는 되어야 한다.

    ★ 의존성이 비어 있어야 한다. commit을 의존성에 넣으면 호출부가 onCommitted를 인라인
      함수로 넘길 때(=매 렌더 새 함수) 정리 함수가 렌더마다 돌아, 예약하자마자 곧바로
      지워버린다. 되돌릴 창이 아예 열리지 않는다.
  */
  useEffect(() => () => {
    const timers = timersRef.current;
    if (timers.size === 0) return;
    timers.forEach((timer) => clearTimeout(timer));
    timers.clear();
    pendingRef.current.forEach((entry) => commitRef.current(entry));
    pendingRef.current = [];
  }, []);

  const pendingIds = useMemo(
      () => new Set(pending.map((it) => it.materialId)),
      [pending],
  );

  return {
    /** 다음 Ctrl+Z가 되살릴 것. 안내에 이름을 띄우는 데 쓴다. */
    latest: pending[pending.length - 1] ?? null,
    pendingCount: pending.length,
    pendingIds,
    schedule,
    undo,
  };
}
