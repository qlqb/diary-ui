/**
 * 계획 항목의 「자세히」.
 *
 * 같은 활동의 설명을 펼치는 동작이다 — 항목·선택·시간·마감·배치·완료 상태는 건드리지 않는다.
 * 처음 펼칠 때만 서버가 그 항목이 실제로 인용한 자료 구간으로 단계를 만들고(모델 1회), 그 뒤로는
 * 저장된 것을 다시 쓴다. 원문이나 항목이 바뀌면 stale=true로 와서 "이전 원문 기준 안내"라고 표시하고,
 * [지금 원문으로 다시 만들기]를 누를 때만 새 판을 만든다 — 저절로 다시 만들지 않는다(모델 호출은 사용자가 고른다).
 * 내 메모(userText)는 서버가 판이 바뀌어도 보존하고, 여기서 바로 고칠 수 있다.
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
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [memoOpen, setMemoOpen] = useState(false);
  const [memoDraft, setMemoDraft] = useState('');
  const [memoSaving, setMemoSaving] = useState(false);
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

  /** 옛 원문 기준 안내를 지금 원문으로 다시 만든다. 내 메모는 서버가 새 판으로 옮긴다. */
  const refresh = async () => {
    if (!creator || refreshing) return;
    const mine = ticket.current;
    setRefreshing(true);
    setError(null);
    try {
      const next = await creator(id);
      if (ticket.current === mine) setDetail(next ?? null);
    } catch (err) {
      if (ticket.current === mine) setError(err.message || '안내를 다시 만들지 못했어요.');
    } finally {
      if (ticket.current === mine) setRefreshing(false);
    }
  };

  const saveMemo = async () => {
    if (!detail?.detailId || memoSaving || !planAPI.updateItemDetailText) return;
    setMemoSaving(true);
    try {
      const saved = await planAPI.updateItemDetailText(detail.detailId, memoDraft.trim() || null);
      // 서버는 메모만 바꾼다. 단계·구간·판은 화면이 들고 있는 것을 그대로 쓴다.
      setDetail((prev) => (prev ? { ...prev, userText: saved?.userText ?? (memoDraft.trim() || null) } : prev));
      setMemoOpen(false);
    } catch (err) {
      setError(err.message || '메모를 저장하지 못했어요.');
    } finally {
      setMemoSaving(false);
    }
  };

  if (!expanded) return null;
  if (loading && !detail) return <p className="plan-item-detail hint">자세한 안내를 준비하는 중…</p>;
  if (error && !detail) return <p className="plan-item-detail error-text">{error}</p>;
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
        <p className="plan-item-detail-stale">
          이전 원문 기준으로 만든 안내예요. 항목이나 자료가 그 뒤에 바뀌었어요.
          {creator && (
            <button type="button" className="btn-ghost btn-sm" disabled={refreshing} onClick={refresh}>
              {refreshing ? '다시 만드는 중…' : '지금 원문으로 다시 만들기'}
            </button>
          )}
        </p>
      )}
      {error && <p className="error-text">{error}</p>}
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
      {memoOpen ? (
        <div className="plan-item-detail-user">
          <label>
            <span className="plan-item-done-label">내 메모</span>
            <textarea rows={2} value={memoDraft} onChange={(e) => setMemoDraft(e.target.value)}
              placeholder="이 항목을 할 때 기억할 것" />
          </label>
          <span className="plan-item-actions">
            <button type="button" className="btn-ghost btn-sm" disabled={memoSaving} onClick={saveMemo}>저장</button>
            <button type="button" className="btn-ghost btn-sm" disabled={memoSaving} onClick={() => setMemoOpen(false)}>취소</button>
          </span>
        </div>
      ) : (
        <p className="plan-item-detail-user">
          {detail.userText && <><span className="plan-item-done-label">내 메모</span>{detail.userText} </>}
          {detail.detailId && (
            <button type="button" className="btn-ghost btn-sm"
              onClick={() => { setMemoDraft(detail.userText ?? ''); setMemoOpen(true); }}>
              {detail.userText ? '메모 고치기' : '메모 남기기'}
            </button>
          )}
        </p>
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
