/**
 * 상담에서 만든 기간 계획 초안 하나를 셸이 들고 있는 상태.
 *
 * 대화(AiPanel)가 초안을 만들고, 오른쪽 칸과 계획 탭의 검토 화면이 같은 초안을 본다. 초안을 두 곳이 따로
 * 들면 한쪽은 옛 초안, 한쪽은 새 초안을 보여 주게 되므로 원본은 여기 하나다.
 *
 * ★ 늦게 온 결과가 새 초안을 덮지 않는다. 요청마다 단조 증가하는 순번(token)을 받고, 응답이 돌아왔을 때
 *   그 순번이 아직 최신일 때만 반영한다. 다시 만들기를 눌러 둔 사이에 대화가 새 초안을 가져왔으면, 뒤늦게
 *   도착한 다시 만들기 결과는 버린다 — 사용자가 마지막으로 본 것이 이긴다.
 * ★ 답이 바뀌어 초안이 낡아도 지우지 않는다. "이전 버전 · 최신 답변 반영 전"이라고 표시하고, 다시 만드는
 *   동안에도 이전 초안을 그대로 보여 준다. 다시 만들기는 사용자가 누른다.
 * ★ 사용자가 직접 고친 값은 새 초안으로 옮겨진다(서버의 carriedEdits). 서버 제안과 부딪친 값
 *   (editConflicts)은 기본으로 사용자 값을 지키고, 비교해서 고를 수 있게만 한다.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { planAPI } from '../api/api.js';
import { planStageLabel } from './consultLabels.js';

function newRequestKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `consult-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function useConsultDraft() {
  const [draft, setDraft] = useState(null);
  /** 화면이 알게 된 "낡음". 서버의 freshness와 별개로, 방금 온 답·방금 고친 기억이 이 초안을 낡게 했다. */
  const [localStale, setLocalStale] = useState(null);
  const [regenerating, setRegenerating] = useState(false);
  const [stageLabel, setStageLabel] = useState(null);
  const [error, setError] = useState(null);
  /** 마지막 다시 만들기가 알려 준 것: 무엇이 바뀌었나, 옮겨 온 편집, 부딪친 편집. */
  const [outcome, setOutcome] = useState(null);
  /** 적용(확정)된 계획. 오른쪽 칸이 "적용됨"을 말하는 근거다. */
  const [applied, setApplied] = useState(null);

  const token = useRef(0);
  const draftRef = useRef(null);
  useEffect(() => { draftRef.current = draft; }, [draft]);
  const activeKey = useRef(null);

  /** 대화가 새 초안을 가져왔다(SSE·복원). 진행 중이던 다시 만들기의 결과는 이제 낡은 요청이다. */
  const accept = useCallback((next) => {
    if (!next) return;
    token.current += 1;
    activeKey.current = null;
    setRegenerating(false);
    setStageLabel(null);
    setError(null);
    setLocalStale(null);
    setOutcome(null);
    setApplied(null);
    setDraft(next);
  }, []);

  const clear = useCallback(() => {
    token.current += 1;
    activeKey.current = null;
    setRegenerating(false);
    setStageLabel(null);
    setError(null);
    setLocalStale(null);
    setOutcome(null);
    setDraft(null);
  }, []);

  /**
   * @param draftIds null이면 지금 열린 초안. 목록이면 그 안에 열린 초안이 있을 때만 표시한다
   * @param reason   'DIRECTION'(답변으로 방향이 바뀜) | 'UNDERSTANDING'(이해한 내용을 고침)
   */
  const markStale = useCallback((draftIds = null, reason = 'DIRECTION') => {
    const current = draftRef.current;
    if (!current?.proposalId) return;
    if (Array.isArray(draftIds) && !draftIds.map(Number).includes(Number(current.proposalId))) return;
    setLocalStale({ proposalId: current.proposalId, reason });
  }, []);

  const markApplied = useCallback((plan) => {
    token.current += 1;
    setApplied({ plan, title: plan?.title ?? draftRef.current?.suggestedTitle ?? null });
    setLocalStale(null);
    setOutcome(null);
    setDraft(null);
  }, []);

  /** 같은 조건 + 최신 답변으로 다시 만든다. 실패하면 이전 초안을 그대로 둔다(서버도 폐기하지 않는다). */
  const regenerate = useCallback(async (changes = {}) => {
    const source = draftRef.current;
    if (!source?.proposalId) return false;
    const mine = token.current + 1;
    token.current = mine;
    const requestKey = newRequestKey();
    activeKey.current = requestKey;
    setRegenerating(true);
    setStageLabel(null);
    setError(null);
    try {
      const result = await planAPI.redraft(source.proposalId, { ...changes, requestKey });
      // 그 사이 더 새로운 요청이나 초안이 있었다 — 이 결과는 옛 요청의 것이라 버린다.
      if (token.current !== mine) return false;
      setOutcome({
        fromProposalId: source.proposalId,
        changes: result?.strategy?.changes ?? [],
        carriedEdits: result?.carriedEdits ?? [],
        editConflicts: result?.editConflicts ?? [],
      });
      setLocalStale(null);
      setDraft(result);
      return true;
    } catch (err) {
      if (token.current === mine) setError(err?.message || '초안을 다시 만들지 못했어요. 이전 초안은 그대로예요.');
      return false;
    } finally {
      if (token.current === mine) {
        activeKey.current = null;
        setRegenerating(false);
        setStageLabel(null);
      }
    }
  }, []);

  /*
   * 다시 만드는 동안의 진행 단계. 서버가 실제로 밟은 단계만 물어 온다 — 못 읽어도 생성은 계속되고,
   * 그때는 단계 없이 "만드는 중"만 보인다. 가짜 진행률은 만들지 않는다.
   */
  useEffect(() => {
    if (!regenerating || !activeKey.current) return undefined;
    let progressOf = null;
    try { progressOf = planAPI?.draftProgress ?? null; } catch { progressOf = null; }
    if (!progressOf) return undefined;
    const key = activeKey.current;
    let cancelled = false;
    const poll = async () => {
      try {
        const state = await progressOf(key);
        if (!cancelled && state?.known && activeKey.current === key) {
          setStageLabel(planStageLabel(state.stage, state.label));
        }
      } catch { /* 진행 상태는 보조 정보다 */ }
    };
    poll();
    const timer = setInterval(poll, 1500);
    return () => { cancelled = true; clearInterval(timer); };
  }, [regenerating]);

  const serverStale = draft?.freshness?.state === 'STALE';
  const stale = Boolean(draft) && (serverStale || (localStale != null && localStale.proposalId === draft.proposalId));
  const staleReasons = serverStale ? (draft.freshness.reasons ?? []) : [];

  return {
    draft, stale, staleReasons, regenerating, stageLabel, error, outcome, applied,
    accept, clear, markStale, markApplied, regenerate,
  };
}
