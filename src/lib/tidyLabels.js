/**
 * 프로젝트 정리안 화면의 문구. 순수 함수만 둔다.
 *
 * 문장은 대부분 서버가 만든다(근거 자료 이름·위치가 서버에만 있다). 여기 있는 것은 화면
 * 구조에 붙는 말 — 범위 안내, 버튼 이름, 무엇이 왜 빠졌는지다.
 */

/**
 * 정리안이 무엇을 보았는지 한 줄.
 *
 * "목록으로 봤다"와 "자세히 읽었다"를 나눠 말한다. 모든 구간을 목록으로 훑은 것을 두고 모든
 * 원문을 읽었다고 말하면 안 된다 — 사용자는 그 차이로 결과를 얼마나 믿을지 정한다.
 * 예: "자료 5개 · 구간 240개 모두 목록 확인 · 38개 자세히 검토 · 2개 제외"
 *
 * sectionsListed가 없으면(2026-09-21 판 정리안) 예전 문장을 쓴다.
 */
export function describeScope(scope) {
  if (!scope) return null;
  const materials = scope.reviewed?.length ?? 0;
  const excluded = scope.excluded?.length ?? 0;
  const total = scope.sectionsTotal ?? 0;
  const listed = scope.sectionsListed ?? 0;
  const detailed = scope.sectionsReviewed ?? 0;

  const parts = [];
  if (listed > 0 && total > 0) {
    parts.push(`자료 ${materials}개`);
    parts.push(listed >= total ? `구간 ${total}개 모두 목록 확인` : `구간 ${total}개 중 ${listed}개 목록 확인`);
    parts.push(detailed >= listed ? '전부 자세히 검토' : `${detailed}개 자세히 검토`);
  } else {
    parts.push(`자료 ${materials}개 검토`);
  }
  if (excluded > 0) parts.push(`${excluded}개 제외`);
  return parts.join(' · ');
}

/**
 * 부분 정리 안내. 목록 수준에서도 보지 못한 것이 있을 때만 값이 있다.
 *
 * 자세히 읽은 것이 일부라는 것만으로는 부분 정리가 아니다 — 모든 구간을 목록으로 보고 모델이
 * 무엇을 읽을지 골랐기 때문이다. 목록에도 오르지 못한 자료가 있으면 그때는 판단에서 빠진 것이
 * 있으므로 숨기지 않고 말한다.
 */
export function partialNote(scope) {
  if (!scope?.truncated) return null;
  const total = scope.sectionsTotal ?? 0;
  const listed = scope.sectionsListed ?? 0;
  const unseen = (scope.excluded ?? []).filter((e) => e.reason === 'OVER_BUDGET');
  if (listed > 0 && total > listed) {
    const names = unseen.map((e) => e.filename).filter(Boolean);
    return `자료가 많아 구간 ${total}개 중 ${total - listed}개는 목록으로도 보지 못했어요`
      + (names.length > 0 ? ` (${names.join(', ')})` : '')
      + '. 그 자료는 이번 판단에 쓰이지 않았어요';
  }
  // 예전 판: 목록/상세를 나눠 세기 전의 정리안.
  const seen = scope.sectionsReviewed ?? 0;
  if (total > seen) {
    return `분량이 많아 자료 구간 ${total}개 중 ${seen}개만 보고 정리했어요. 나머지는 이번 판단에 쓰이지 않았어요`;
  }
  return '분량이 많아 일부만 보고 정리했어요';
}

/** 요청 전 안내. "분석 완료 5개로 정리 · 분석 중 2개 제외" */
export function describeReadiness(view) {
  if (!view) return null;
  const ready = view.readyMaterialCount ?? 0;
  const analyzing = view.analyzingMaterialCount ?? 0;
  if (ready === 0) {
    return analyzing > 0
      ? `아직 분석 중인 자료 ${analyzing}개뿐이에요. 끝나면 정리할 수 있어요`
      : '이 프로젝트에 분석이 끝난 자료가 없어요';
  }
  const parts = [`분석 완료 ${ready}개로 정리`];
  if (analyzing > 0) parts.push(`분석 중 ${analyzing}개 제외`);
  return parts.join(' · ');
}

/** 작업 상태 → 사람 말. 만드는 중·실패를 화면이 구분해 보여준다. */
export function describeJob(job) {
  if (!job) return null;
  switch (job.status) {
    case 'QUEUED':
      return { tone: 'busy', text: '정리안을 만들 차례를 기다리는 중이에요' };
    case 'RUNNING':
      return { tone: 'busy', text: '자료를 함께 보며 정리안을 만드는 중이에요' };
    case 'FAILED':
      return { tone: 'problem', text: job.message || '정리안을 만들지 못했어요. 다시 시도할 수 있어요' };
    case 'UNAVAILABLE':
      return { tone: 'problem', text: job.message || '지금은 AI에 연결할 수 없어요. 잠시 뒤 다시 시도해 주세요' };
    default:
      return null;
  }
}

/** 변경 종류 → 칩 글자. 서버도 label을 주지만, 서버가 모르는 상태(로컬 제외)에 쓴다. */
export const TIDY_OP_LABEL = Object.freeze({
  LINK: '자료 연결',
  ADD: '새 항목',
  RENAME: '이름 보완',
  MOVE: '위치 이동',
  MERGE: '병합',
  SPLIT: '분할',
});

/** 저장 상태 → 한 줄. 실패를 조용히 넘기지 않는다. */
export function saveStateText(state) {
  switch (state) {
    // 아직 보내지 않았다. "저장 중"과 구분해야 한다 — 사용자가 이 순간 창을 닫으면
    // 서버에는 아직 없다는 뜻이고, 적용 버튼이 막히는 이유이기도 하다.
    case 'pending':
      return '저장 대기 중…';
    case 'saving':
      return '저장 중…';
    case 'saved':
      return '저장됨';
    case 'error':
      return '저장하지 못했어요 · 다시 시도해 주세요';
    case 'conflict':
      return '다른 곳에서 같은 항목을 고쳤어요 · 어느 쪽을 쓸지 골라 주세요';
    case 'stale':
      return '다른 곳에서 먼저 고쳤어요 · 최신 내용을 불러왔어요';
    default:
      return null;
  }
}

/**
 * 고른 변경 수 → 적용 버튼 이름.
 *
 * 전부 고른 것과 일부만 고른 것을 다르게 말한다 — "적용"만 있으면 몇 개가 빠졌는지 모른 채
 * 누르게 된다.
 */
export function applyButtonLabel(selectedCount, totalCount) {
  if (selectedCount === 0) return '적용할 변경을 골라주세요';
  if (selectedCount === totalCount) return '선택한 변경 적용';
  return `선택한 ${selectedCount}개 적용`;
}

/**
 * 서버가 준 dependsOn을 거꾸로 뒤집는다. "이것을 빼면 무엇도 함께 빠지는가".
 *
 * 화면은 체크를 풀 때 이 방향이 필요하다 — 서버가 주는 것은 "이것을 넣으려면 무엇이
 * 필요한가"이고, 사용자가 하는 동작은 그 반대다.
 */
export function dependentsOf(dependsOn) {
  const out = {};
  Object.entries(dependsOn ?? {}).forEach(([changeId, required]) => {
    (required ?? []).forEach((id) => {
      if (!out[id]) out[id] = [];
      out[id].push(changeId);
    });
  });
  return out;
}

/** 어떤 변경을 빼면 함께 빠져야 하는 것 전부(연쇄). */
export function collectDependents(changeId, dependents, seen = new Set()) {
  (dependents[changeId] ?? []).forEach((child) => {
    if (seen.has(child)) return;
    seen.add(child);
    collectDependents(child, dependents, seen);
  });
  return seen;
}
