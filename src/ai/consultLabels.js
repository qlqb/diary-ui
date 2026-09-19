/**
 * 상담 작업 공간이 쓰는 표시 문구. enum 원문을 화면에 내보내지 않는다 — 서버 값은 전부 여기를 지난다.
 *
 * 상태는 색만으로 말하지 않는다. 여기 있는 라벨이 곧 그 상태의 글자 표시다.
 */

/** "내가 이해한 내용" 한 줄의 근거. 말한 것과 AI의 추정이 같은 무게로 읽히면 안 된다. */
export const UNDERSTANDING_EVIDENCE_LABEL = {
  STATED: '내가 말한 것',
  SELF_REPORT: '내 자기평가',
  OBSERVED: '실행 기록에서 확인',
  INFERRED: 'AI 추정 · 확인 전',
};

/**
 * 계획 생성의 진행 단계. 서버가 실제로 밟은 단계(stage)만 말한다 — 가짜 진행률을 만들지 않는다.
 * 모르는 단계가 오면 서버가 함께 준 문구를 그대로 쓴다.
 */
export const PLAN_STAGE_LABEL = {
  COLLECTING: '상황 확인 중',
  SELECTING: '자료 고르는 중',
  RETRIEVING: '원문 읽는 중',
  PLANNING: '계획 정리 중',
  READING_MORE: '더 읽는 중',
  SAVING: '배치 확인 중(저장)',
};

export function planStageLabel(stage, fallback = null) {
  return PLAN_STAGE_LABEL[stage] ?? fallback ?? null;
}

/**
 * 프로젝트별 "대화 상태". 학습 완료·숙달과 섞지 않는다 — 이 프로젝트에 대해 이야기를 나눴는가일 뿐이다.
 */
export const TALK_STATUS_LABEL = {
  TALKING: '이야기 중',
  CONFIRMED: '확인한 내용 있음',
  NONE: '확인 전',
};

/**
 * @param inScope      지금 대화 범위가 이 프로젝트인가
 * @param hasMessages  그 대화에 실제로 오간 말이 있는가
 * @param hasKnowledge 이 프로젝트에 묶인 "이해한 내용"(기억·합의)이 있는가
 */
export function talkStatusOf({ inScope, hasMessages, hasKnowledge }) {
  if (inScope && hasMessages) return 'TALKING';
  if (hasKnowledge) return 'CONFIRMED';
  return 'NONE';
}

/** 오른쪽 칸의 상태. 다섯 가지를 글자로 구분한다. */
export const PLAN_PANE_STATE_LABEL = {
  DIRECTION: '계획 방향',
  GENERATING: '만드는 중',
  DRAFT: '초안',
  APPLIED: '적용됨',
  STALE: '갱신 필요',
};
