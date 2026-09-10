/**
 * 이미 계획에 들어간 실행 조각의 "이건 왜 여기 있나".
 *
 * 계획 화면과 오늘 화면이 둘 다 이걸 쓴다. 두 화면이 각자 근거를 그리면 같은 사실이
 * 두 곳에서 다르게 보이기 시작하고, 고칠 때도 두 곳을 고쳐야 한다.
 *
 * ★ 펼칠 때 불러온다. 목록의 모든 항목이 화면에 뜨자마자 근거를 부르면 오늘 화면
 * 한 번에 수십 번의 요청이 나간다 — 대부분은 아무도 열지 않는다.
 */

import { useCallback, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { planAPI } from '../../api/api.js';
import { EVIDENCE_STATUS_LABEL } from '../../lib/planLabels.js';
import PlanProvenancePanel, { EvidenceBody } from './PlanProvenance.jsx';

export default function ExecutionItemEvidence({ executionItemId, onOpenSource }) {
  const [open, setOpen] = useState(false);
  const [provenance, setProvenance] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const toggle = useCallback(async () => {
    const next = !open;
    setOpen(next);
    if (!next || provenance || loading) return;
    setLoading(true);
    setError(null);
    try {
      setProvenance(await planAPI.itemProvenance(executionItemId));
    } catch (err) {
      setError(err.message || '근거를 불러오지 못했어요.');
    } finally {
      setLoading(false);
    }
  }, [open, provenance, loading, executionItemId]);

  // 응답의 items는 이 조각을 만든 제안 항목 하나뿐이다.
  const item = provenance?.items?.[0] ?? null;
  const statusLabel = EVIDENCE_STATUS_LABEL[item?.evidenceStatus] ?? null;

  return (
    <div className="plan-evidence">
      <button
        type="button"
        className="btn-ghost btn-sm plan-evidence-toggle"
        onClick={toggle}
        aria-expanded={open}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        이건 왜 여기 있나요
        {statusLabel && <span className="plan-evidence-flag">{statusLabel}</span>}
      </button>

      {open && (
        <div className="plan-evidence-loaded">
          {loading && <p className="muted">불러오는 중…</p>}
          {error && <p className="error-text">{error}</p>}
          {!loading && !error && provenance && !provenance.recorded && !item && (
            <p className="muted">이 항목에는 생성 당시 출처 기록이 없어요.</p>
          )}
          {!loading && !error && provenance && item && (
            <>
              <EvidenceBody provenance={provenance} item={item} onOpenSource={onOpenSource} />
              <PlanProvenancePanel provenance={provenance} onOpenSource={onOpenSource} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
