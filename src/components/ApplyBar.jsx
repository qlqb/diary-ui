/**
 * 초안을 실제로 반영하는 유일한 버튼.
 *
 * 항목마다 적용 버튼을 두지 않는다 — 화면에서 본 그대로 한 번에 반영한다. 이 버튼을 누르기
 * 전까지는 서버 데이터가 전혀 바뀌지 않았다는 사실이 문구에서도 분명해야 한다.
 */

import { Loader2, Sparkles } from 'lucide-react';

export default function ApplyBar({ draft, applying, error, onApply, onDiscard, placing }) {
  if (!draft) return null;
  const active = draft.cards.filter((c) => !c.excluded);
  const excludedCount = draft.cards.length - active.length;

  return (
    <div className="apply-bar" role="region" aria-label="AI 초안 적용">
      <div className="apply-bar-text">
        <Sparkles size={15} />
        <div>
          <p className="apply-bar-title">
            아직 적용 전이에요 · 변경 {active.length}개
            {excludedCount > 0 && <span className="apply-bar-dim"> (뺀 것 {excludedCount}개)</span>}
          </p>
          <p className="apply-bar-sub">
            {placing ? '가능한 시간을 계산하는 중...' : '화면에서 직접 고치거나 AI에게 말해서 조정할 수 있어요.'}
          </p>
        </div>
      </div>
      {error && <p className="apply-bar-error">{error}</p>}
      <div className="apply-bar-actions">
        <button type="button" className="btn-ghost" onClick={onDiscard} disabled={applying}>
          초안 버리기
        </button>
        <button type="button" className="btn-primary" onClick={onApply} disabled={applying || active.length === 0}>
          {applying ? <><Loader2 size={14} className="spin" /> 적용 중...</> : `변경 ${active.length}개 적용`}
        </button>
      </div>
    </div>
  );
}
