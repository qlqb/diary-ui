/**
 * 방금 지운 것을 되돌릴 수 있다고 알리는 줄.
 *
 * 실행 조각과 자료가 같은 모양을 쓴다. 안쪽 동작은 서로 반대지만(하나는 서버에 복구를 걸고
 * 하나는 아직 보내지 않은 요청을 취소한다) 사용자가 보는 것과 하는 일은 같다 — 같은 일이면
 * 같아 보여야 한다.
 *
 * 여러 개를 지웠으면 개수를 함께 말한다. 한 번 누를 때 하나씩, 마지막에 지운 것부터
 * 돌아온다 — 실행 취소는 원래 그렇게 동작하고, 다르게 만들면 몇 번 눌러야 하는지를
 * 사용자가 세야 한다.
 */

import { RotateCcw } from 'lucide-react';

export default function UndoToast({ title, count = 1, busy = false, onUndo }) {
  return (
    <div className="undo-toast" role="status">
      <span className="undo-toast-text">
        <strong>{title}</strong>
        {count > 1 ? ` 외 ${count - 1}개 지웠어요` : ' 지웠어요'}
      </span>
      <button type="button" className="undo-toast-btn" disabled={busy} onClick={onUndo}>
        <RotateCcw size={13} /> 되돌리기
        <kbd className="undo-toast-kbd">Ctrl+Z</kbd>
      </button>
    </div>
  );
}
