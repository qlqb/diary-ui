/**
 * 계획 항목의 「자세히」.
 *
 * 같은 활동의 설명을 펼치는 동작이다 — 항목·선택·시간·마감·배치·완료 상태는 건드리지 않는다.
 * 처음 펼칠 때만 서버가 그 항목이 실제로 인용한 자료 구간으로 단계를 만들고(모델 1회), 그 뒤로는
 * 저장된 것을 다시 쓴다. 원문이나 항목이 바뀌면 stale=true로 와서 "이전 원문 기준 안내"라고 표시한다.
 * 늦게 도착한 응답은 요청 순번으로 버린다 — 다른 항목을 펼치는 사이에 옛 응답이 덮지 않는다.
 */

import { useEffect, useRef, useState } from 'react';
import { planAPI } from '../../api/api.js';
import MaterialFileLink from '../../components/MaterialFileLink.jsx';

/**
 * @param mode 'draft' | 'item'  초안 항목이면 proposalItemId, 확정 조각이면 executionItemId
 */
export default function PlanItemDetail({ mode = 'draft', id, expanded }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const ticket = useRef(0);

  const getter = mode === 'item' ? planAPI.itemDetail : planAPI.draftItemDetail;
  const creator = mode === 'item' ? planAPI.createItemDetail : planAPI.createDraftItemDetail;

  useEffect(() => {
    if (!expanded || id == null || !getter) return undefined;
    const mine = ticket.current + 1;
    ticket.current = mine;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        let loaded = await getter(id);
        if (ticket.current !== mine) return;
        if (!loaded?.available && loaded?.canGenerate && creator) {
          loaded = await creator(id);
          if (ticket.current !== mine) return;
        }
        setDetail(loaded ?? null);
      } catch (err) {
        if (ticket.current === mine) setError(err.message || '자세한 안내를 불러오지 못했어요.');
      } finally {
        if (ticket.current === mine) setLoading(false);
      }
    })();
    return () => { ticket.current += 1; };
  }, [expanded, id, getter, creator]);

  if (!expanded) return null;
  if (loading && !detail) return <p className="plan-item-detail hint">자세한 안내를 준비하는 중…</p>;
  if (error) return <p className="plan-item-detail error-text">{error}</p>;
  if (!detail) return null;

  if (!detail.available) {
    return (
      <p className="plan-item-detail hint">
        {detail.canGenerate ? '자세한 안내를 아직 만들지 않았어요.' : '이 항목에는 자세히 볼 근거 자료가 없어요. 활동 설명을 그대로 따라 하면 돼요.'}
      </p>
    );
  }

  return (
    <div className="plan-item-detail">
      {detail.stale && (
        <p className="plan-item-detail-stale">이전 원문 기준으로 만든 안내예요. 항목이나 자료가 그 뒤에 바뀌었어요.</p>
      )}
      <ol className="plan-item-steps">
        {(detail.steps ?? []).map((step, i) => (
          <li key={i}>
            {step.text}
            {(step.sectionIds ?? []).length > 0 && (
              <span className="plan-item-step-refs">
                {step.sectionIds.map((sectionId) => {
                  const section = (detail.sections ?? []).find((s) => s.sectionId === sectionId);
                  return section ? (
                    <span key={sectionId} className="plan-item-step-ref">
                      {section.title}{section.locator ? ` (${section.locator})` : ''}
                    </span>
                  ) : null;
                })}
              </span>
            )}
          </li>
        ))}
      </ol>
      {detail.userText && (
        <p className="plan-item-detail-user"><span className="plan-item-done-label">내 메모</span>{detail.userText}</p>
      )}
      {(detail.sections ?? []).length > 0 && (
        <p className="plan-item-detail-sources">
          {detail.sections.map((s) => (
            <MaterialFileLink key={s.sectionId} materialId={s.materialId} filename={s.title}
              label={`원본 자료 열기 · ${s.locator || s.title}`} />
          ))}
        </p>
      )}
    </div>
  );
}
