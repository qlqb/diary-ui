/**
 * 좁은 화면에서 옆 칸(범위·자료, 계획 미리보기)을 여는 시트.
 *
 * 세 칸을 그대로 줄여 넣지 않는다 — 모바일에서는 대화가 기본 화면이고, 나머지는 필요할 때 아래에서
 * 올라온다. 700~1100px에서는 같은 컴포넌트가 옆에서 나오는 서랍(placement="left|right")이 된다.
 *
 * 접근성: role="dialog" + aria-modal, 제목으로 이름을 붙이고(aria-labelledby), Escape와 바깥 영역
 * 누르기로 닫히고, 닫히면 열기 전에 있던 자리로 초점을 돌려준다. 초점 가두기는 하지 않는다 —
 * 시트 밖은 가려져 있고 Escape가 늘 통한다.
 *
 * keepMounted면 닫혀 있을 때도 내용을 지우지 않고 숨기기만 한다. 계획 초안 검토처럼 안에서 고르던
 * 상태(체크·펼침)가 시트를 닫았다 여는 사이에 사라지면 안 되는 내용에 쓴다.
 */

import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

export default function BottomSheet({
  open, title, onClose, children, placement = 'bottom', keepMounted = false, footer = null,
}) {
  const titleId = useId();
  const panelRef = useRef(null);
  const returnFocusRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    // 열기 직전에 초점이 있던 곳(대개 시트를 연 버튼). 닫을 때 거기로 돌아간다.
    returnFocusRef.current = document.activeElement;
    panelRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose?.();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const target = returnFocusRef.current;
      returnFocusRef.current = null;
      if (target && typeof target.focus === 'function' && document.contains(target)) target.focus();
    };
  }, [open, onClose]);

  if (!open && !keepMounted) return null;

  return (
    <div className={`sheet-layer sheet-${placement}${open ? ' is-open' : ''}`} hidden={!open}>
      <button type="button" className="sheet-backdrop" aria-label={`${title} 닫기`} tabIndex={-1} onClick={onClose} />
      <div
        ref={panelRef}
        className="sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="sheet-head">
          <h2 id={titleId} className="sheet-title">{title}</h2>
          <button type="button" className="icon-btn" aria-label="닫기" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <footer className="sheet-foot">{footer}</footer>}
      </div>
    </div>
  );
}
