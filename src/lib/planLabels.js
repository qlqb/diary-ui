/**
 * 계획 화면이 쓰는 표시 문구를 한 곳에 모은다.
 *
 * ★ enum 원문을 화면에 내보내지 않는다. `SKIM`, `PRACTICE`, `MUST`는 서버가 값을 구분하려고
 * 쓰는 이름이지 사용자에게 할 말이 아니다. 여기를 지나지 않은 값이 화면에 뜨면 그건 번역을
 * 빠뜨린 것이고, copy.test.js가 그것을 잡는다.
 *
 * ★ 능력을 판정하는 어조를 쓰지 않는다. "이미 알아요 / 처음이에요"는 익숙함의 진술이지
 * "안다 / 모른다"가 아니다. 금지어 목록은 copy.test.js에 있다.
 */

/** 시간이 모자랄 때 무엇을 지킬 것인가. */
export const PRIORITY_LABEL = {
  MUST: '꼭 하기',
  SHOULD: '권장',
  OPTIONAL: '여유되면',
};

/** 이번 기간에 이 내용을 어떻게 다루는가. 우선순위와 독립이다. */
export const TREATMENT_LABEL = {
  FULL: '충분히 보기',
  SKIM: '핵심만 보기',
  REVIEW: '복습',
};

/** 앉아서 실제로 하는 행동. */
export const ACTION_TYPE_LABEL = {
  READ: '읽기',
  PRACTICE: '문제 풀기',
  RECALL: '떠올려 보기',
  LAB: '실습',
};

/** 되묻기 선택지 → 서버가 받는 값. 문구는 서버가 내려주지만 매핑은 화면이 안다. */
export const FAMILIARITY_CHOICE = {
  '처음이에요': 'FIRST_TIME',
  '이미 익숙해요': 'FAMILIAR',
  '일부는 익숙해요': 'PARTIAL',
};

/** 선택지를 못 알아보면 저장할 것이 없는 쪽으로 보낸다 — 없는 사실을 만들지 않는다. */
export const FALLBACK_FAMILIARITY_CHOICE = 'FIRST_TIME';

/**
 * 생성 회차에 모델로 나간 원본의 종류.
 *
 * ★ "검증됨"류의 말을 쓰지 않는다. 여기 있는 것은 "이 정보를 AI에게 줬다"는 사실일 뿐,
 * AI가 그것을 제대로 반영했다는 뜻도 제약을 다 지켰다는 뜻도 아니다.
 */
export const PROVENANCE_SOURCE_LABEL = {
  COURSE: '프로젝트',
  TOPIC: '학습 항목',
  COURSE_NOTE: '평가 안내',
  MATERIAL_KEY_DATE: '자료에서 읽은 일정',
  ROUTINE_OCCURRENCE: '반복 일정',
  COMMITMENT: '약속',
  EXECUTION_ITEM_FIXED: '시각이 정해진 일정',
  EXECUTION_ITEM_PLANNED: '이 기간에 있던 일정',
  USER_CONTEXT: '확인된 이야기',
  PLAN_REVIEW: '직전 계획 돌아보기',
  TURN_INPUT: '이번에 직접 말한 것',
};

/** 원본을 어떤 모양으로 줬는가. "원본 전체"로 오해하지 않게 하는 값이다. */
export const PROVENANCE_REPRESENTATION_LABEL = {
  SELECTED_FIELDS: '필요한 항목만 골라서',
  SUMMARY_LINE: '여러 건을 한 줄로 요약해서',
  EXCERPT: '적어 준 문장 그대로',
};

/** 서버가 실제로 계산한 것. AI의 추정과 같은 자리에 두지 않는다. */
export const SERVER_CALCULATION_LABEL = {
  AVAILABILITY_ESTIMATE: '남는 시간 추정',
  STUDY_BUDGET: '학습 예산',
};

/**
 * 이 계산의 입력이 전부 남아 있는가.
 *
 * 일부만 남은 것을 "그대로 다시 계산할 수 있음"으로 말하지 않는다.
 */
export const INPUT_LINEAGE_LABEL = {
  COMPLETE: '이 계산에 들어간 입력이 전부 남아 있어요',
  PARTIAL: '입력 일부만 가리킬 수 있어요',
};

/** 근거가 지금도 이 항목을 설명하는가. 그대로면 아무 말도 하지 않는다. */
export const EVIDENCE_STATUS_LABEL = {
  CURRENT: null,
  EDITED_BY_USER: '수정 전 제안의 근거',
  NEEDS_REVIEW: '다시 볼 근거',
};

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * 마감 표시. 그 시각이 어떤 수업의 시작이면 "화요일 수업 전"이 훨씬 읽기 쉽다 —
 * "9/8 14:00까지"는 사용자가 시간표를 떠올려야 뜻이 생긴다.
 *
 * @param deadlineAt ISO datetime 또는 null
 * @param classAt    같은 과목 조각들이 공유하는 다음 수업 시각. 모르면 생략
 */
export function formatDeadline(deadlineAt, classAt = null) {
  if (!deadlineAt) return null;
  const at = new Date(deadlineAt);
  if (Number.isNaN(at.getTime())) return null;
  if (classAt && new Date(classAt).getTime() === at.getTime()) {
    return `${WEEKDAY_KO[at.getDay()]}요일 수업 전`;
  }
  const hh = String(at.getHours()).padStart(2, '0');
  const mm = String(at.getMinutes()).padStart(2, '0');
  return `${at.getMonth() + 1}/${at.getDate()} ${hh}:${mm}까지`;
}

/**
 * 예상 시간. 범위로 적지 않는다 — 서버가 내는 것은 하나의 추정이고, 범위로 보이면
 * 실제로 없는 정밀도를 주장하게 된다.
 */
export function formatEstimate(minutes) {
  return minutes ? `약 ${minutes}분` : null;
}
