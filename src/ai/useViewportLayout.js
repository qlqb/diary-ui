/**
 * 상담 작업 공간이 옆 칸을 어떻게 놓을지 정하는 화면 폭 구분.
 *
 *   'inline'  1100px 이상 — 세 칸을 나란히 둔다
 *   'drawer'  700~1099px — 대화가 가운데를 다 쓰고, 옆 칸은 눌러서 여는 서랍이다
 *   'sheet'   700px 미만 — 대화가 기본 화면이고, 옆 칸은 아래에서 올라오는 시트다
 *
 * CSS만으로 하지 않는 이유: 좁은 화면에서는 옆 칸을 "줄여서" 보여 주는 게 아니라 아예 다른 방식
 * (대화 상자)으로 연다. 같은 내용을 두 군데에 동시에 그려 두고 하나를 숨기면 초안 검토 상태가 둘이 된다.
 *
 * matchMedia가 없는 환경(테스트)은 넓은 화면으로 본다.
 */

import { useEffect, useState } from 'react';

const WIDE = '(min-width: 1100px)';
const NARROW = '(max-width: 699px)';

function read() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'inline';
  if (window.matchMedia(NARROW).matches) return 'sheet';
  return window.matchMedia(WIDE).matches ? 'inline' : 'drawer';
}

export function useViewportLayout() {
  const [layout, setLayout] = useState(read);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const queries = [window.matchMedia(WIDE), window.matchMedia(NARROW)];
    const update = () => setLayout(read());
    queries.forEach((q) => q.addEventListener?.('change', update));
    return () => queries.forEach((q) => q.removeEventListener?.('change', update));
  }, []);

  return layout;
}
