/**
 * 수업 한 번 확인: "오늘 수업 어디까지 했어요?"
 *
 * ★ 기본값을 미리 골라 둔다 — [맞아요] 한 번이면 끝난다. 기본값이 없으면 [맞아요] 대신 고르기를 연다.
 * ★ [고치기]는 이 과목 수업자료의 구간 목록(기본값 포함)에서 고르거나, "아직 자료가 안 올라왔어요"·"휴강"·"결석"을 고른다.
 * ★ 이 확인은 "수업에서 다룬 것"이다 — 내가 공부했다는 기록이 아니다.
 * ★ 부모는 회차·판·기본값이 바뀌면 key를 바꿔 새로 그린다(옛 선택이 남지 않게).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { MAX_SOURCES, optionLabel, sessionLabel } from '../../lib/classCheck.js';

const OTHER_CHOICES = [
  { action: 'UNKNOWN_CONTENT', label: '아직 자료가 안 올라왔어요' },
  { action: 'CANCELLED', label: '휴강했어요' },
  { action: 'ABSENT', label: '결석했어요' },
];

export default function ClassCheckSession({ title, session, options = [], busy = false, onConfirm, onLater }) {
  const defaults = useMemo(() => session.defaults ?? [], [session.defaults]);
  // 고를 수 있는 것: 기본값 + 목록(목록이 잘려 기본값이 빠졌을 수 있다)
  const choices = useMemo(() => {
    const seen = new Set(options.map((o) => o.ref));
    return [...defaults.filter((d) => !seen.has(d.ref)), ...options];
  }, [defaults, options]);
  const [editing, setEditing] = useState(defaults.length === 0);
  const [picked, setPicked] = useState(() => new Set(defaults.map((o) => o.ref)));
  const [other, setOther] = useState(null);
  const firstInput = useRef(null);
  const editButton = useRef(null);
  const wasEditing = useRef(editing);

  useEffect(() => {
    if (editing && !wasEditing.current) firstInput.current?.focus();
    if (!editing && wasEditing.current) editButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  const selected = choices.filter((o) => picked.has(o.ref));
  const full = selected.length >= MAX_SOURCES;

  const toggle = (ref) => {
    setOther(null);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(ref)) next.delete(ref);
      else if (next.size < MAX_SOURCES) next.add(ref);
      return next;
    });
  };

  const save = () => {
    if (other) {
      onConfirm(other, []);
      return;
    }
    onConfirm('COVERED', selected);
  };

  const canSave = Boolean(other) || selected.length > 0;
  const heading = `${title ? `${title} · ` : ''}${sessionLabel(session)} 수업 어디까지 했어요?`;

  return (
    <div className="class-check" role="group" aria-label={heading}>
      <p className="class-check-title">{heading}</p>
      {!editing && (
        <>
          <ul className="class-check-defaults">
            {defaults.map((o) => <li key={o.ref}>{optionLabel(o)}</li>)}
          </ul>
          <div className="class-check-actions">
            <button type="button" className="btn-primary btn-sm" disabled={busy}
              onClick={() => onConfirm('COVERED', defaults)}>맞아요</button>
            <button type="button" className="btn-ghost btn-sm" disabled={busy} ref={editButton}
              onClick={() => setEditing(true)}>고치기</button>
            {onLater && <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={onLater}>나중에</button>}
          </div>
        </>
      )}
      {editing && (
        <>
          {choices.length === 0 && <p className="view-dim">이 과목에 올린 수업자료가 아직 없어요.</p>}
          {full && <p className="view-dim">한 수업에 {MAX_SOURCES}개까지 고를 수 있어요.</p>}
          <ul className="class-check-options">
            {choices.map((o, i) => (
              <li key={o.ref}>
                <label>
                  <input type="checkbox" ref={i === 0 ? firstInput : undefined} disabled={busy || (full && !picked.has(o.ref))}
                    checked={picked.has(o.ref) && !other} onChange={() => toggle(o.ref)} />
                  {' '}{optionLabel(o)}
                </label>
              </li>
            ))}
            {OTHER_CHOICES.map((c, i) => (
              <li key={c.action}>
                <label>
                  <input type="radio" name={`other-${session.routineId}-${session.sourceDate}`} disabled={busy}
                    ref={choices.length === 0 && i === 0 ? firstInput : undefined}
                    checked={other === c.action} onChange={() => { setOther(c.action); setPicked(new Set()); }} />
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

