/**
 * 프로젝트 정리안 화면의 문구. 순수 함수만 둔다.
 *
 * 문장은 대부분 서버가 만든다(근거 자료 이름·위치가 서버에만 있다). 여기 있는 것은 화면
 * 구조에 붙는 말 — 범위 안내, 버튼 이름, 무엇이 왜 빠졌는지다.
 */

/** 정리안이 무엇을 보았는지 한 줄. "자료 5개 검토 · 2개 제외" */
export function describeScope(scope) {
  if (!scope) return null;
  const reviewed = scope.reviewed?.length ?? 0;
  const excluded = scope.excluded?.length ?? 0;
  const parts = [`자료 ${reviewed}개 검토`];
  if (excluded > 0) parts.push(`${excluded}개 제외`);
  return parts.join(' · ');
}

/**
 * 부분 정리 안내. 입력 한도로 일부만 본 경우에만 값이 있다.
 *
 * 이 문장이 없으면 사용자는 전체를 반영한 결과라고 믿는다. 숨기지 않는 것이 규칙이다.
 */
export function partialNote(scope) {
  if (!scope?.truncated) return null;
  const seen = scope.sectionsReviewed ?? 0;
  const total = scope.sectionsTotal ?? 0;
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
    case 'saving':
      return '저장 중…';
    case 'saved':
      return '저장됨';
    case 'error':
      return '저장하지 못했어요 · 다시 시도해 주세요';
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
