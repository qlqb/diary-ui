/**
 * 배치 미리보기(Timefold)의 주인을 제안 하나당 하나로 만든다.
 *
 * 같은 제안을 두 곳이 본다 — 셸의 초안 훅(useProposalDraft.placeUnscheduled)과 계획 검토 화면
 * (PlanDraftReview). 둘 다 "저장된 미리보기가 있으면 그대로, 없으면 한 번 계산"을 각자 불렀고,
 * 그래서 AI 패널에서 기간 계획을 열면 같은 입력으로 get/recompute가 두 번씩 나갔다.
 *
 * 여기서는 (제안 id + 입력 지문)이 같으면 같은 Promise를 나눠 준다. 입력 지문은 항목 id·분량·날짜다 —
 * 그중 하나라도 바뀌면 다른 문제이므로 앞의 결과를 버리고, 저장된 미리보기(get)도 낡은 것이라
 * 곧바로 다시 계산한다.
 *
 * 들고 있는 쪽이 하나도 없으면 항목을 지운다. 화면을 떠났다 돌아오면 서버에 저장된 미리보기를
 * 다시 읽는 것이 맞다(그 사이 일정이 바뀌었을 수 있다) — 브라우저가 오래된 배치를 쥐고 있지 않는다.
 */

const entries = new Map();

/** 입력 지문. 순서가 달라도 같은 집합이면 같은 지문이다. */
export function previewInputKey(proposalId, items) {
  const parts = (items ?? [])
    .filter((item) => !item.operation || item.operation === 'CREATE')
    .map((item) => `${item.proposalItemId}:${item.expectedMinutes ?? ''}:${item.targetDate ?? item.scheduledDate ?? ''}`)
    .sort();
  return `${proposalId}|${parts.join(',')}`;
}

/**
 * @param solve ({ stale }) => Promise. stale이면 저장된 미리보기를 믿지 말고 다시 계산한다
 * @returns {{ promise: Promise, release: () => void }}
 */
export function acquirePreview(proposalId, key, solve) {
  let entry = entries.get(proposalId);
  if (!entry || entry.key !== key) {
    const stale = Boolean(entry);
    const created = { key, holders: 0, promise: null };
    created.promise = Promise.resolve().then(() => solve({ stale }));
    // 못 구한 결과를 나눠 주지 않는다 — 다음 요청이 다시 시도한다.
    created.promise.catch(() => {
      if (entries.get(proposalId) === created) entries.delete(proposalId);
    });
    entries.set(proposalId, created);
    entry = created;
  }
  const held = entry;
  held.holders += 1;
  let released = false;
  return {
    promise: held.promise,
    release: () => {
      if (released) return;
      released = true;
      held.holders -= 1;
      if (held.holders <= 0 && entries.get(proposalId) === held) entries.delete(proposalId);
    },
  };
}

/**
 * 두 곳이 같은 방식으로 푼다: 저장된 미리보기가 있으면 그대로, 없으면 한 번 계산. OpenAI를 부르지 않는다.
 * 입력이 바뀌어 앞의 결과를 버린 경우(stale)에는 저장된 것도 낡았으므로 바로 다시 계산한다.
 */
export function storedOrRecompute(api, proposalId) {
  return async ({ stale }) => {
    const stored = stale ? null : await api.get(proposalId);
    return stored ?? (await api.recompute(proposalId, {}));
  };
}

/** 확정 거절 뒤처럼 강제로 다시 계산한 결과로 갈아 끼운다. 같은 입력을 보는 다른 쪽도 새 결과를 받는다. */
export function replacePreview(proposalId, key, promise) {
  const entry = entries.get(proposalId);
  if (!entry || entry.key !== key) return;
  entry.promise = promise;
  promise.catch(() => {
    if (entries.get(proposalId) === entry) entries.delete(proposalId);
  });
}

/** 테스트와 로그아웃용. */
export function clearPreviewCache() {
  entries.clear();
}
