/**
 * 상담 작업 공간의 옆 칸 하나를 화면 폭에 맞는 그릇에 담는다.
 *
 *   inline  셸 격자의 한 칸(늘 보인다)
 *   drawer  옆에서 나오는 서랍
 *   sheet   아래에서 올라오는 시트
 *
 * 내용은 하나만 만든다 — 그릇만 바뀐다. 서랍·시트는 닫혀 있어도 내용을 지우지 않아서(keepMounted)
 * 초안 검토에서 고르던 상태가 닫았다 여는 사이에 사라지지 않는다.
 */

import BottomSheet from '../../ai/BottomSheet.jsx';

export default function ConsultPaneFrame({ side, title, layout, open, onClose, children }) {
  if (layout === 'inline') {
    return (
      <aside className={`consult-pane consult-pane-${side}`} aria-label={title}>
        {children}
      </aside>
    );
  }
  return (
    <BottomSheet
      open={open}
      title={title}
      onClose={onClose}
      placement={layout === 'sheet' ? 'bottom' : side}
      keepMounted
    >
      {children}
    </BottomSheet>
  );
}
