/**
 * 실행 기록 화면이 함께 쓰는 문구. 기록하는 곳(ExecutionRow)과 돌아보는 곳(RecordView)이 같은 말을 써야 한다.
 */

/**
 * 걸린 점(선택). 서버 blockerKind와 1:1이다.
 *
 * 문구는 사용자의 말투로 쓴다 — "왜 못 했나요"처럼 이유를 캐묻는 문장은 쓰지 않는다. 고르지 않아도
 * 기록은 그대로 남고, 고른 값은 다음 상담이 분량·순서를 다시 잡을 때만 쓰인다.
 */
export const BLOCKER_OPTIONS = Object.freeze([
  { kind: 'TIME', label: '시간이 없었어' },
  { kind: 'CONCEPT', label: '개념에서 막혔어' },
  { kind: 'ENERGY', label: '컨디션이 안 좋았어' },
  { kind: 'OTHER', label: '다른 이유' },
]);

export const BLOCKER_LABEL = Object.freeze(
  Object.fromEntries(BLOCKER_OPTIONS.map((o) => [o.kind, o.label])),
);

/**
 * 어떻게 해냈는가(선택). 서버 supportLevel과 1:1이다. 이 활동 하나에 대한 사용자 진술이지 과목 전체의 판정이 아니다.
 * 고르지 않으면 보내지 않는다 — "모름"이지 "혼자 못 함"이 아니다.
 */
export const SUPPORT_OPTIONS = Object.freeze([
  { level: 'SOLO', label: '혼자 해냈어' },
  { level: 'GUIDED', label: '설명·예제를 보고 했어' },
]);

export const SUPPORT_LABEL = Object.freeze(
  Object.fromEntries(SUPPORT_OPTIONS.map((o) => [o.level, o.label])),
);
