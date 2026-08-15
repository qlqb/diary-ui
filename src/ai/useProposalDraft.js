/**
 * AI 제안을 "화면 위의 편집 가능한 초안"으로 들고 있는 상태.
 *
 * 이 앱에서 제안은 AI 패널 안의 카드 목록이 아니다. AI가 만든 초안은 오늘/일정 화면에
 * ghost로 겹쳐 보이고, 사용자가 거기서 직접 고치고 빼고, 마지막에 한 번 적용한다.
 * 그래서 초안 상태는 AI 패널이 아니라 셸(MainShell)이 소유하고 각 화면에 내려준다.
 *
 * 지켜야 하는 순서(사용자 승인 원칙):
 *   AI 생성 -> 초안 -> 편집 가능한 미리보기 -> 사용자 수정 -> 명시적 Apply -> 실제 데이터 변경
 * 이 훅은 apply()가 호출되기 전까지 어떤 서버 상태도 바꾸지 않는다.
 */

import { useCallback, useRef, useState } from 'react';
import { proposalAPI, schedulePreviewAPI } from '../api/api.js';
import { toHHmm } from '../lib/datetime.js';

/** 서버 제안 항목 -> 화면에서 다루는 초안 카드. */
function toCard(item) {
  const operation = item.operation ?? 'CREATE';
  return {
    proposalItemId: item.proposalItemId,
    operation,
    excluded: false,
    title: item.title ?? '',
    description: item.description ?? '',
    expectedMinutes: item.expectedMinutes ?? 0,
    priority: item.priority ?? 'SHOULD',
    placementType: item.placementType ?? (operation === 'CREATE' ? 'DATE_ONLY' : null),
    scheduledDate: item.targetDate ?? null,
    startTime: toHHmm(item.scheduledStartAt),
    endTime: toHHmm(item.scheduledEndAt),
    /** 서버가 자동 배치한 값인지(사용자가 직접 시간을 정하면 false). */
    autoPlaced: false,
    unplacedReason: null,
    // 조정 제안 전용
    targetExecutionItemId: item.targetExecutionItemId ?? null,
    beforeTitle: item.beforeTitle ?? null,
    beforeExpectedMinutes: item.beforeExpectedMinutes ?? null,
    beforeScheduledDate: item.beforeScheduledDate ?? null,
    reason: item.reason ?? null,
  };
}

export function useProposalDraft({ onApplied } = {}) {
  const [draft, setDraft] = useState(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState(null);
  const [placing, setPlacing] = useState(false);
  // 자동 배치 요청이 겹치지 않게 한다. state는 비동기라 클릭이 겹치는 순간을 못 잡는다.
  const placingRef = useRef(false);

  /**
   * 날짜·시각이 정해지지 않은(UNSCHEDULED) 후보가 있으면 서버에 배치를 계산시킨다.
   * OpenAI를 다시 부르지 않는다 — 서버가 가용시간 계산과 Timefold만 돌린다.
   */
  const placeUnscheduled = useCallback(async (proposalId, cards) => {
    if (!cards.some((c) => c.operation === 'CREATE' && c.placementType === 'UNSCHEDULED')) {
      return cards;
    }
    if (placingRef.current) return cards;
    placingRef.current = true;
    setPlacing(true);
    try {
      const stored = await schedulePreviewAPI.get(proposalId);
      const preview = stored ?? (await schedulePreviewAPI.recompute(proposalId, {}));
      const placedById = new Map((preview?.placedItems ?? []).map((p) => [p.proposalItemId, p]));
      const unplacedById = new Map((preview?.unplacedItems ?? []).map((p) => [p.proposalItemId, p]));

      return cards.map((card) => {
        const placed = placedById.get(card.proposalItemId);
        if (placed) {
          return {
            ...card,
            placementType: 'TIME_FIXED',
            scheduledDate: placed.scheduledDate,
            startTime: toHHmm(placed.scheduledStartAt),
            endTime: toHHmm(placed.scheduledEndAt),
            autoPlaced: true,
            unplacedReason: null,
          };
        }
        const unplaced = unplacedById.get(card.proposalItemId);
        return unplaced ? { ...card, unplacedReason: unplaced.reason } : card;
      });
    } catch {
      // 배치를 못 구해도 초안 자체는 보여준다 — 사용자가 직접 시간을 정할 수 있다.
      return cards;
    } finally {
      placingRef.current = false;
      setPlacing(false);
    }
  }, []);

  /** AI가 새 제안을 만들었을 때(SSE) 또는 저장된 제안을 복원할 때 호출한다. */
  const openDraft = useCallback(async (proposal, meta = {}) => {
    if (!proposal) return;
    const initial = (proposal.items ?? []).map(toCard);
    setApplyError(null);
    setDraft({ proposalId: proposal.proposalId, cards: initial, ...meta });

    const placed = await placeUnscheduled(proposal.proposalId, initial);
    setDraft((prev) => (prev && prev.proposalId === proposal.proposalId ? { ...prev, cards: placed } : prev));
  }, [placeUnscheduled]);

  const patchCard = useCallback((proposalItemId, patch) => {
    setDraft((prev) => prev && ({
      ...prev,
      cards: prev.cards.map((c) => (c.proposalItemId === proposalItemId ? { ...c, ...patch } : c)),
    }));
  }, []);

  /** 초안에서 이 항목만 뺀다. 되돌릴 수 있어야 하므로 목록에서 지우지 않고 표시만 바꾼다. */
  const toggleExclude = useCallback((proposalItemId) => {
    setDraft((prev) => prev && ({
      ...prev,
      cards: prev.cards.map((c) =>
        c.proposalItemId === proposalItemId ? { ...c, excluded: !c.excluded } : c),
    }));
  }, []);

  const discardDraft = useCallback(() => {
    setDraft(null);
    setApplyError(null);
  }, []);

  const apply = useCallback(async () => {
    if (!draft || applying) return false;
    const remaining = draft.cards.filter((c) => !c.excluded);
    if (remaining.length === 0) {
      setApplyError('적용할 변경이 없어요. 하나 이상 남겨주세요.');
      return false;
    }

    const editedItems = remaining.map((card) => {
      if (card.operation !== 'CREATE') {
        // 조정 제안은 대상 항목에 무엇을 할지만 보낸다(분량/제목/옮길 날짜·시각).
        // 시각은 "오늘 뒤로"처럼 같은 날 안에서 시각만 옮기는 이동에서만 채워진다 —
        // 비워 보내면 서버가 제안에 담겨 있던 값을 그대로 쓴다.
        const movesToTime = Boolean(card.scheduledDate && card.startTime && card.endTime);
        return {
          proposalItemId: card.proposalItemId,
          title: card.title,
          expectedMinutes: card.expectedMinutes,
          scheduledDate: card.scheduledDate,
          scheduledStartAt: movesToTime ? `${card.scheduledDate}T${card.startTime}:00` : null,
          scheduledEndAt: movesToTime ? `${card.scheduledDate}T${card.endTime}:00` : null,
        };
      }
      const hasTime = Boolean(card.scheduledDate && card.startTime && card.endTime);
      return {
        proposalItemId: card.proposalItemId,
        title: card.title,
        description: card.description,
        expectedMinutes: card.expectedMinutes,
        priority: card.priority,
        placementType: hasTime ? 'TIME_FIXED' : (card.scheduledDate ? 'DATE_ONLY' : 'UNSCHEDULED'),
        scheduledDate: card.scheduledDate,
        scheduledStartAt: hasTime ? `${card.scheduledDate}T${card.startTime}:00` : null,
        scheduledEndAt: hasTime ? `${card.scheduledDate}T${card.endTime}:00` : null,
      };
    });
    const excludedItemIds = draft.cards.filter((c) => c.excluded).map((c) => c.proposalItemId);

    setApplying(true);
    setApplyError(null);
    try {
      await proposalAPI.apply(draft.proposalId, editedItems, excludedItemIds);
      setDraft(null);
      await onApplied?.();
      return true;
    } catch (err) {
      setApplyError(err.message || '적용하지 못했습니다.');
      return false;
    } finally {
      setApplying(false);
    }
  }, [draft, applying, onApplied]);

  return { draft, openDraft, patchCard, toggleExclude, discardDraft, apply, applying, applyError, placing };
}

/** 이 초안이 특정 날짜에 영향을 주는 카드들. 오늘 화면이 겹쳐 그릴 대상을 고른다. */
export function cardsForDate(draft, dateString) {
  if (!draft) return [];
  return draft.cards.filter((card) => {
    if (card.operation === 'CREATE') return card.scheduledDate === dateString;
    if (card.operation === 'MOVE') return card.beforeScheduledDate === dateString || card.scheduledDate === dateString;
    return card.beforeScheduledDate === dateString;
  });
}

/** 이 초안이 특정 실행 조각을 바꾸려 하는지. 실제 항목 위에 변경 전/후를 겹쳐 보여줄 때 쓴다. */
export function adjustmentFor(draft, executionItemId) {
  if (!draft) return null;
  return draft.cards.find(
    (card) => card.operation !== 'CREATE' && card.targetExecutionItemId === executionItemId,
  ) ?? null;
}
