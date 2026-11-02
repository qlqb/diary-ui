/**
 * "사용자가 방금 버린 초안" — 되살리기가 건너뛰어야 할 id.
 *
 * 버린 사실의 원본은 서버다(ai_proposals.status = DISMISSED). 되살리기는 PROPOSED만 되살리므로 보통은
 * 그것만으로 충분하고, 이 목록은 서버 기록이 아직/영영 도착하지 못한 두 틈만 막는다.
 *   1) 버리는 순간 이미 날아가 있던 대화 조회가 뒤늦게 돌아와 같은 초안을 다시 여는 것
 *   2) 버리기를 서버에 쓰지 못했을 때(오프라인·실패) 탭을 옮길 때마다 다시 튀어나오는 것
 *
 * 새로고침하면 비워진다 — 그때는 서버가 답한다.
 */

import { proposalAPI } from '../api/api.js';

const dismissed = new Set();

export function markDismissed(proposalId) {
  if (proposalId == null) return;
  dismissed.add(Number(proposalId));
}

export function isDismissed(proposalId) {
  if (proposalId == null) return false;
  return dismissed.has(Number(proposalId));
}

/**
 * 사용자가 이 초안을 버렸다 — 서버에 쓰고(status DISMISSED) 이 세션에서도 되살리지 않는다.
 *
 * 화면은 응답을 기다리지 않는다: 버리기는 되돌릴 것이 없고, 실패해도 사용자가 다시 누를 일이 아니다.
 * 쓰지 못하면 다음 새로고침에 다시 나타날 수 있다 — 그때 다시 버리면 된다.
 */
export function dismissDraft(proposalId) {
  if (proposalId == null) return;
  markDismissed(proposalId);
  Promise.resolve(proposalAPI.dismiss?.(proposalId))
    .catch(() => { /* 못 써도 화면에서는 이미 버렸다 */ });
}

/** 테스트 전용. 화면 코드에서는 부르지 않는다. */
export function resetDismissed() {
  dismissed.clear();
}
