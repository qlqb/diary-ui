/**
 * 수업 한 번 확인: "오늘 수업 어디까지 했어요?"
 *
 * ★ 기본값을 미리 골라 둔다 — [맞아요] 한 번이면 끝난다. 기본값이 없으면 [맞아요] 대신 고르기를 연다.
 * ★ [고치기]는 이 과목 수업자료의 구간 목록에서 고르거나, "아직 자료가 안 올라왔어요"·"휴강"·"결석"을 고른다.
 * ★ 이 확인은 "수업에서 다룬 것"이다 — 내가 공부했다는 기록이 아니다.
 */

import { useState } from 'react';
import { optionLabel, sessionLabel } from '../../lib/classCheck.js';

const OTHER_CHOICES = [
  { action: 'UNKNOWN_CONTENT', label: '아직 자료가 안 올라왔어요' },
  { action: 'CANCELLED', label: '휴강했어요' },
  { action: 'ABSENT', label: '결석했어요' },
];

export default function ClassCheckSession({ title, session, options = [], busy = false, onConfirm, onLater }) {
  const defaults = session.defaults ?? [];
  const [editing, setEditing] = useState(defaults.length === 0);
  const [picked, setPicked] = useState(() => new Set(defaults.map((o) => o.ref)));
  const [other, setOther] = useState(null);

  const toggle = (ref) => {
    setOther(null);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(ref)) next.delete(ref); else next.add(ref);
      return next;
    });
  };

  const save = () => {
    if (other) {
      onConfirm(other, []);
      return;
    }
    onConfirm('COVERED', options.filter((o) => picked.has(o.ref)));
  };

  const canSave = Boolean(other) || picked.size > 0;
  const heading = `${title ? `${title} · ` : ''}${sessionLabel(session)} 수업 어디까지 했어요?`;

  return (
    <div className="class-check" aria-label={heading}>
      <p className="class-check-title">{heading}</p>
      {!editing && (
        <>
          <ul className="class-check-defaults">
            {defaults.map((o) => <li key={o.ref}>{optionLabel(o)}</li>)}
          </ul>
          <div className="class-check-actions">
            <button type="button" className="btn-primary btn-sm" disabled={busy}
              onClick={() => onConfirm('COVERED', defaults)}>맞아요</button>
            <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => setEditing(true)}>고치기</button>
            {onLater && <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={onLater}>나중에</button>}
          </div>
        </>
      )}
      {editing && (
        <>
          {options.length === 0 && <p className="view-dim">이 과목에 올린 수업자료가 아직 없어요.</p>}
          <ul className="class-check-options">
            {options.map((o) => (
              <li key={o.ref}>
                <label>
                  <input type="checkbox" checked={picked.has(o.ref) && !other} onChange={() => toggle(o.ref)} />
                  {' '}{optionLabel(o)}
                </label>
              </li>
            ))}
            {OTHER_CHOICES.map((c) => (
              <li key={c.action}>
                <label>
                  <input type="radio" name={`other-${session.routineId}-${session.sourceDate}`} checked={other === c.action}
                    onChange={() => { setOther(c.action); setPicked(new Set()); }} />
                  {' '}{c.label}
                </label>
              </li>
            ))}
          </ul>
          <div className="class-check-actions">
            <button type="button" className="btn-primary btn-sm" disabled={busy || !canSave} onClick={save}>저장</button>
            {defaults.length > 0 && (
              <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => setEditing(false)}>취소</button>
            )}
            {onLater && <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={onLater}>나중에</button>}
          </div>
        </>
      )}
    </div>
  );
}
