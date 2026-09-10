/**
 * 이미 계획에 들어간 실행 조각의 근거. 계획 화면과 오늘 화면이 둘 다 이걸 쓴다.
 *
 * 두 화면이 각자 근거를 그리면 같은 사실이 두 곳에서 다르게 보이기 시작하고, 고칠 때도
 * 두 곳을 고쳐야 한다.
 *
 * ★ 펼칠 때 불러온다. 목록의 모든 항목이 화면에 뜨자마자 근거를 부르면 오늘 화면
 * 한 번에 수십 번의 요청이 나간다 — 대부분은 아무도 열지 않는다.
 *
 * ★ 조각이 바뀌면(version) 들고 있던 응답을 버린다. 옮기거나 줄인 뒤에도 옛 응답을 보여주면
 * "적용한 뒤 바뀜" 표식이 뜨지 않아, 사용자는 지금 보는 배치가 AI가 낸 것이라고 읽는다.
 * 같은 조각·같은 version의 응답은 화면들 사이에서 다시 쓴다 — 오늘 화면에서 열어 본 것을
 * 계획 화면에서 또 부르지 않는다.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { planAPI } from '../../api/api.js';
import { EVIDENCE_STATUS_LABEL } from '../../lib/planLabels.js';
import { evidenceCacheKey, getCachedEvidence, rememberEvidence } from '../../lib/evidenceCache.js';
import PlanProvenancePanel, { EvidenceBody } from './PlanProvenance.jsx';

export default function ExecutionItemEvidence({
  executionItemId, version = null, onOpenSource, label = '근거 보기',
}) {
  const [open, setOpen] = useState(false);
  const [provenance, setProvenance] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  /*
   * 지금 어느 조각·어느 version의 응답을 기다리는지. 늦게 도착한 옛 요청의 응답이 새 조각의
   * 근거로 들어가지 않게 한다.
   */
  const requestKey = useRef(null);
  const key = evidenceCacheKey(executionItemId, version);

  const load = useCallback(async (forKey) => {
    const cached = getCachedEvidence(forKey);
    if (cached) {
      setProvenance(cached);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const loaded = await planAPI.itemProvenance(executionItemId);
      if (requestKey.current !== forKey) return; // 그 사이 조각이 바뀌었다.
      rememberEvidence(forKey, loaded);
      setProvenance(loaded);
    } catch (err) {
      if (requestKey.current !== forKey) return;
      setError(err.message || '근거를 불러오지 못했어요.');
    } finally {
      if (requestKey.current === forKey) setLoading(false);
    }
  }, [executionItemId]);

  // 조각이 바뀌면(id 또는 version) 옛 응답을 버리고, 열려 있으면 새로 불러온다.
  useEffect(() => {
    requestKey.current = key;
    setProvenance(getCachedEvidence(key));
    setError(null);
    setLoading(false);
    if (open && !getCachedEvidence(key)) load(key);
    // open은 여기서 의도적으로 뺀다 — 토글은 아래 toggle이 처리한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, load]);

  const toggle = useCallback(() => {
    const next = !open;
    setOpen(next);
    if (!next || provenance || loading) return;
    requestKey.current = key;
    load(key);
  }, [open, provenance, loading, key, load]);

  const retry = useCallback(() => {
    requestKey.current = key;
    load(key);
  }, [key, load]);

  // 응답의 items는 이 조각을 만든 제안 항목 하나뿐이다.
  const item = provenance?.items?.[0] ?? null;
  const statusLabel = EVIDENCE_STATUS_LABEL[item?.evidenceStatus] ?? null;
  const changedAfterApply = (item?.afterApplyChanges ?? []).length > 0;

  return (
    <div className="plan-evidence">
      <button
        type="button"
        className="btn-ghost btn-sm plan-evidence-toggle"
        onClick={toggle}
        aria-expanded={open}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {label}
        {statusLabel && <span className="plan-evidence-flag">{statusLabel}</span>}
        {changedAfterApply && <span className="plan-evidence-flag">적용 후 바뀜</span>}
      </button>

      {open && (
        <div className="plan-evidence-loaded">
          {loading && <p className="muted">불러오는 중…</p>}
          {error && (
            <p className="error-text">
              {error}
              {' '}
              <button type="button" className="btn-ghost btn-sm" onClick={retry}>다시 시도</button>
            </p>
          )}
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
