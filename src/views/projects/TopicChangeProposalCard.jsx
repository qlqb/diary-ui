/**
 * 자료 정리 변경안 카드.
 *
 * 기본은 한 줄 요약("기존 내용에 자료 3곳 연결 · 새 항목 2개 제안")과 [적용]/[제외]. 세부 diff는 접혀
 * 있다. 다만 이동·병합·분할 같은 큰 변경은 접지 않고 요약 아래에 바로 보인다 — 작은 연결과 큰 재구성을
 * 같은 무게로 숨기지 않는다.
 *
 * 세부에서 작업마다 체크를 풀어 일부만 적용할 수 있고, 새 항목·이름 보완의 제목은 고칠 수 있다.
 * 적용은 서버가 한 트랜잭션으로 하고, 이 변경안을 만든 뒤 구조가 바뀌었으면(stale) 적용 대신
 * "다시 분석"을 안내한다.
 */

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { topicChangeProposalAPI } from '../../api/api.js';
import {
  CHANGE_OP_LABEL, describeChangeOp, isStructuralOp, summarizeChangeProposal,
} from '../../lib/analysisLabels.js';

export default function TopicChangeProposalCard({ proposal, onResolved, onReanalyze = null }) {
  const [open, setOpen] = useState(false);
  const [excluded, setExcluded] = useState(() => new Set());
  const [titles, setTitles] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const sectionsById = useMemo(() => {
    const map = {};
    (proposal?.sections ?? []).forEach((s) => { map[s.sectionId] = s; });
    return map;
  }, [proposal]);
  const ops = proposal?.ops ?? [];
  const structural = ops.map((op, i) => ({ op, i })).filter(({ op }) => isStructuralOp(op));
  const selectedCount = ops.length - excluded.size;

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      const selectedOpIndexes = ops.map((_, i) => i).filter((i) => !excluded.has(i));
      const result = await topicChangeProposalAPI.apply(proposal.proposalId, { selectedOpIndexes, titleOverrides: titles });
      onResolved?.(result);
    } catch (err) {
      if (err.code === 'E409_017') {
        setError('이 변경안을 만든 뒤 학습 구조가 바뀌었어요. 자료를 다시 분석하면 새 변경안이 만들어져요.');
      } else if (err.code === 'E409_018') {
        setError('이미 처리된 변경안이에요.');
        onResolved?.(null);
      } else {
        setError(err.message || '적용하지 못했어요.');
      }
    } finally {
      setBusy(false);
    }
  };

  const dismiss = async () => {
    setBusy(true);
    setError(null);
    try {
      onResolved?.(await topicChangeProposalAPI.dismiss(proposal.proposalId));
    } catch (err) {
      setError(err.message || '제외하지 못했어요.');
    } finally {
      setBusy(false);
    }
  };

  if (!proposal) return null;

  return (
    <div className="change-proposal" role="group" aria-label={`자료 정리 변경안: ${proposal.materialFilename ?? ''}`}>
      <div className="change-proposal-head">
        <button type="button" className="collapse-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          <span className="change-proposal-title">{proposal.materialFilename ?? '자료'}</span>
          <span className="change-proposal-summary">{summarizeChangeProposal(proposal.summary)}</span>
        </button>
        <span className="change-proposal-actions">
          <button type="button" className="btn-primary btn-sm" disabled={busy || proposal.stale || selectedCount === 0}
            onClick={apply}>
            {selectedCount < ops.length ? `${selectedCount}개 적용` : '적용'}
          </button>
          <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={dismiss}>제외</button>
        </span>
      </div>

      {proposal.stale && (
        <p className="change-proposal-stale">
          이 변경안을 만든 뒤 학습 구조가 바뀌었어요. 그대로 적용하지 않아요.
          {onReanalyze && (
            <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={onReanalyze}>다시 분석</button>
          )}
        </p>
      )}

      {/* 큰 변경은 접지 않는다. 학습 범위·기록에 영향이 있다는 것을 요약 자리에서 알 수 있어야 한다. */}
      {!open && structural.length > 0 && (
        <ul className="change-proposal-structural">
          {structural.map(({ op, i }) => (
            <li key={i}>
              <span className="chip chip-warn">{CHANGE_OP_LABEL[op.op]}</span>
              {' '}{describeChangeOp(op, proposal.topicTitles, sectionsById)}
              {op.op === 'MERGE' && <span className="view-dim"> · 흡수되는 항목의 기록은 복제하지 않고 안내로 남겨요</span>}
              {op.op === 'SPLIT' && <span className="view-dim"> · 기존 기록은 원래 항목에 남고 하위 항목은 새로 시작이에요</span>}
            </li>
          ))}
        </ul>
      )}

      {open && (
        <ul className="change-proposal-ops">
          {ops.map((op, i) => (
            <li key={i} className={`change-proposal-op${isStructuralOp(op) ? ' is-structural' : ''}`}>
              <label>
                <input type="checkbox" checked={!excluded.has(i)} disabled={busy}
                  onChange={() => setExcluded((prev) => {
                    const next = new Set(prev);
                    if (next.has(i)) next.delete(i); else next.add(i);
                    return next;
                  })} />
                <span className={`chip ${isStructuralOp(op) ? 'chip-warn' : 'chip-status'}`}>{CHANGE_OP_LABEL[op.op] ?? '변경'}</span>
                <span className="change-proposal-op-text">{describeChangeOp(op, proposal.topicTitles, sectionsById)}</span>
              </label>
              {(op.op === 'ADD' || op.op === 'RENAME') && (
                <input type="text" className="input change-proposal-title-input" aria-label="항목 제목 고치기"
                  value={titles[i] ?? op.title ?? ''} disabled={busy || excluded.has(i)}
                  onChange={(e) => setTitles((prev) => ({ ...prev, [i]: e.target.value }))} />
              )}
              {op.op === 'MERGE' && (
                <p className="hint">흡수되는 항목은 보관되고 id는 그대로예요. 학습 기록은 복제하지 않고, 승계가 애매하면 안내가 남아요.</p>
              )}
              {op.op === 'SPLIT' && (
                <p className="hint">원래 항목은 부모로 남고 기록도 거기 남아요. 하위 항목은 새로 시작이에요.</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="view-error">{error}</p>}
    </div>
  );
}
