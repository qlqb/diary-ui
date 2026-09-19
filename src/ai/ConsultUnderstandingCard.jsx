/**
 * "내가 이해한 내용" — AI가 이번 대화에서 중요하게 받아들인 해석을 짧게 보여 주고, 틀렸으면 바로 고치게 한다.
 *
 * 서버가 중요한 해석이 생겼을 때만 보낸다. 없으면 이 카드도 없다.
 *
 * ★ 줄마다 근거를 평범한 말로 붙인다(내가 말한 것 / 내 자기평가 / 실행 기록에서 확인 / AI 추정 · 확인 전).
 *   추정이 내가 한 말과 같은 무게로 읽히면, 틀린 추정이 사실처럼 계획에 들어간다.
 * ★ [조금 달라요]는 확인 창 없이 그 자리에서 고친다. 기억(MEMORY)은 곧바로 저장하고, 이번 대화의
 *   합의(BRIEF)는 저장할 대상이 따로 없으므로 "다시 말할게요: …"를 입력창에 채워 대화로 고치게 한다.
 */

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { UNDERSTANDING_EVIDENCE_LABEL } from './consultLabels.js';

export default function ConsultUnderstandingCard({ lines = [], onEdit, onRestate }) {
  const [editingId, setEditingId] = useState(null);
  const [text, setText] = useState('');
  const [state, setState] = useState({}); // id -> { status: 'saving'|'fixed'|'error', message, content }

  if (!lines || lines.length === 0) return null;

  const startEdit = (line) => {
    if (line.source !== 'MEMORY') {
      onRestate?.(line);
      return;
    }
    setEditingId(line.id);
    setText(state[line.id]?.content ?? line.text ?? '');
  };

  const save = async (line) => {
    const content = text.trim();
    if (!content) return;
    setState((prev) => ({ ...prev, [line.id]: { ...prev[line.id], status: 'saving' } }));
    const result = await onEdit?.(line, content);
    if (result?.ok) {
      setState((prev) => ({ ...prev, [line.id]: { status: 'fixed', content } }));
      setEditingId(null);
    } else {
      setState((prev) => ({
        ...prev,
        [line.id]: { ...prev[line.id], status: 'error', message: result?.message || '고치지 못했어요. 다시 시도해 주세요.' },
      }));
    }
  };

  return (
    <section className="consult-understanding" aria-label="내가 이해한 내용">
      <p className="consult-understanding-head">내가 이해한 내용</p>
      <ul>
        {lines.map((line) => {
          const lineState = state[line.id];
          const editing = editingId === line.id;
          return (
            <li key={line.id} className="consult-understanding-line">
              {editing ? (
                <div className="consult-understanding-edit">
                  <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)}
                    aria-label="고친 내용" />
                  <span className="consult-understanding-actions">
                    <button type="button" className="btn-ghost btn-sm" onClick={() => setEditingId(null)}
                      disabled={lineState?.status === 'saving'}>
                      그대로 두기
                    </button>
                    <button type="button" className="btn-primary btn-sm" onClick={() => save(line)}
                      disabled={lineState?.status === 'saving' || !text.trim()}>
                      {lineState?.status === 'saving' ? <Loader2 size={13} className="spin" /> : null} 이렇게 고치기
                    </button>
                  </span>
                </div>
              ) : (
                <>
                  <span className="consult-understanding-text">{lineState?.content ?? line.text}</span>
                  <span className="consult-understanding-meta">
                    {/* 고친 뒤에는 내가 말한 것이 된다 — 서버도 그렇게 저장한다. */}
                    {lineState?.status === 'fixed'
                      ? UNDERSTANDING_EVIDENCE_LABEL.STATED
                      : (UNDERSTANDING_EVIDENCE_LABEL[line.evidenceType] ?? '근거 미확인')}
                    {line.scopeLabel ? ` · ${line.scopeLabel}` : ''}
                    {line.isNew && lineState?.status !== 'fixed' ? ' · 이번에 새로 이해함' : ''}
                  </span>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => startEdit(line)}>
                    조금 달라요
                  </button>
                  {lineState?.status === 'fixed' && (
                    <span className="consult-understanding-fixed" role="status">고쳤어요</span>
                  )}
                </>
              )}
              {lineState?.status === 'error' && <p className="ai-error">{lineState.message}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
