/**
 * 화면 위 초안(useProposalDraft의 카드)에서 "기간 안에 못 넣은 항목" 묶음을 만든다. 일정·오늘 화면이 같이 쓴다.
 *
 * 카드를 고칠 뿐 서버를 부르지 않는다 — 적용(apply) 전까지 아무것도 바뀌지 않는 초안 원칙 그대로다. 되돌리기를 위해
 * 처리 직전 값을 카드에 남겨 둔다(unplacedBefore).
 */

import { formatSlot, slotParts } from '../lib/unplacedSlot.js';

const SNAPSHOT_KEYS = ['scheduledDate', 'startTime', 'endTime', 'placementType', 'expectedMinutes', 'autoPlaced'];

function snapshot(card) {
  return Object.fromEntries(SNAPSHOT_KEYS.map((k) => [k, card[k]]));
}

/** 시작·끝 ISO → 카드의 날짜·시각. 끝이 다음 날 00:00이면 24:00으로 둔다(적용 때 endAtOf가 다음 날로 바꾼다). */
function timesOf(slot) {
  const s = slotParts(slot.start);
  const e = slotParts(slot.end);
  return { scheduledDate: s.date, startTime: s.time, endTime: e.date !== s.date && e.time === '00:00' ? '24:00' : e.time };
}

export function trayItemsOf(cards) {
  return (cards ?? [])
    .filter((c) => c.operation === 'CREATE' && c.unplacedHint)
    .map((c) => {
      const hint = c.unplacedHint;
      const status = c.excluded ? 'excluded' : c.unplacedResolved ?? 'open';
      return {
        id: c.proposalItemId,
        title: c.title,
        minutes: hint.expectedMinutes ?? c.expectedMinutes,
        reason: hint.reason,
        nextSlot: hint.nextSlotStartAt ? { start: hint.nextSlotStartAt, end: hint.nextSlotEndAt } : null,
        fit: hint.fitMinutes && hint.fitStartAt ? { minutes: hint.fitMinutes, start: hint.fitStartAt } : null,
        status,
        placedLabel: status === 'placed' && c.scheduledDate && c.startTime
          ? `${formatSlot(`${c.scheduledDate}T${c.startTime}`)}~${c.endTime}에 넣었어요`
            + (c.unplacedBefore && c.expectedMinutes !== c.unplacedBefore.expectedMinutes ? ` (${c.expectedMinutes}분으로 줄임)` : '')
          : null,
      };
    });
}

/** UnplacedTray에 넘길 처리 함수들. */
export function trayHandlersOf(cards, onPatchCard, onToggleExclude) {
  const byId = new Map((cards ?? []).map((c) => [c.proposalItemId, c]));
  return {
    onPlace: (id, slot) => {
      const card = byId.get(id);
      if (!card) return;
      onPatchCard(id, {
        ...timesOf(slot),
        placementType: 'TIME_FIXED',
        autoPlaced: false,
        expectedMinutes: slot.minutes ?? card.expectedMinutes,
        unplacedResolved: 'placed',
        unplacedBefore: card.unplacedBefore ?? snapshot(card),
      });
    },
    onDefer: (id) => {
      const card = byId.get(id);
      if (!card) return;
      onPatchCard(id, {
        scheduledDate: null, startTime: null, endTime: null, placementType: 'UNSCHEDULED',
        unplacedResolved: 'deferred',
        unplacedBefore: card.unplacedBefore ?? snapshot(card),
      });
    },
    onExclude: (id) => onToggleExclude(id),
    onUndo: (id) => {
      const card = byId.get(id);
      if (!card) return;
      if (card.excluded) onToggleExclude(id);
      if (card.unplacedBefore) {
        onPatchCard(id, { ...card.unplacedBefore, unplacedResolved: null, unplacedBefore: null });
      }
    },
  };
}
