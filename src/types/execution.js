/**
 * 실행 데이터 계약. 백엔드 execution 패키지와 1:1 대응한다.
 *
 * 화면이 임시 필드명을 따로 만들지 않도록, 가짜 데이터 단계부터 이 타입을 쓴다.
 * DB 테이블을 먼저 만들지는 않지만 필드 이름과 상태 언어는 여기서 확정한다.
 */

/** 실행 조각의 성격. */
export const ExecutionItemType = Object.freeze({
  /** 사용자가 수행하는 행동. 시간 배치는 선택. */
  TASK: 'TASK',
  /** 수업·약속처럼 시각이 정해진 외부 일정. */
  FIXED_EVENT: 'FIXED_EVENT',
  /** 반복 루틴이 특정 날짜에 만들어낸 인스턴스. */
  ROUTINE_OCCURRENCE: 'ROUTINE_OCCURRENCE',
});

/**
 * 얼마나 구체적으로 배치되었는지. scheduledDate/startTime 유효성을 결정한다.
 * 실제 execution_items.placement_type 체크 제약과 1:1 대응한다 (TIME_BLOCK이 아니라 TIME_FIXED).
 */
export const PlacementType = Object.freeze({
  /** 날짜 미정. */
  UNSCHEDULED: 'UNSCHEDULED',
  /** 날짜만 지정. 하루 안의 시각은 미정. */
  DATE_ONLY: 'DATE_ONLY',
  /** 날짜와 시작·종료 시각까지 지정. */
  TIME_FIXED: 'TIME_FIXED',
});

/** 실행 조각의 현재 상태. 실제 execution_items.status 체크 제약과 1:1 대응한다. */
export const ExecutionStatus = Object.freeze({
  PLANNED: 'PLANNED',
  /** 일부만 진행. */
  PARTIAL: 'PARTIAL',
  /** 지금은 안 한다는 판단이 이미 내려진 상태. */
  HOLD: 'HOLD',
  DONE: 'DONE',
  CANCELLED: 'CANCELLED',
});

/**
 * 사용자가 확인한 중요도. AI 추천 점수를 여기 쓰지 않는다.
 * 실제 execution_items.priority 체크 제약과 1:1 대응한다 (HIGH/NORMAL/LOW가 아니라 MUST/SHOULD/OPTIONAL).
 */
export const ExecutionPriority = Object.freeze({
  MUST: 'MUST',
  SHOULD: 'SHOULD',
  OPTIONAL: 'OPTIONAL',
});

export const ExecutionOriginType = Object.freeze({
  MANUAL: 'MANUAL',
  AI_GENERATED: 'AI_GENERATED',
  ROUTINE_GENERATED: 'ROUTINE_GENERATED',
  IMPORTED: 'IMPORTED',
});

/** 현실에서 실제로 일어난 결과의 유형. */
export const ExecutionResultType = Object.freeze({
  COMPLETED: 'COMPLETED',
  PARTIAL: 'PARTIAL',
  NO_PROGRESS: 'NO_PROGRESS',
  EXCEEDED: 'EXCEEDED',
  REPLACED: 'REPLACED',
  OBSERVED: 'OBSERVED',
  CANCELLED: 'CANCELLED',
});

/** 계획 조정 사건. 실제 수행 결과는 ExecutionRecord 가 담당한다. */
export const ExecutionEventType = Object.freeze({
  CREATED: 'CREATED',
  MOVED: 'MOVED',
  REDUCED: 'REDUCED',
  SPLIT: 'SPLIT',
  HOLD: 'HOLD',
  RESUMED: 'RESUMED',
  CANCELLED: 'CANCELLED',
  DELETED: 'DELETED',
});

/* ===================== 화면 표기 ===================== */

/**
 * 내부 enum 값에 대응하는 화면 기본 표기(v6.1 부록 A.1).
 *
 * 원칙: 실패 판단을 덧붙이지 않는다.
 * "실패", "미완료", "아예 못 함", "부족", "이행률" 같은 표현을 기본 라벨로 쓰지 않는다.
 * 컴포넌트가 enum 값을 직접 한글로 바꾸지 말고 항상 이 표를 거친다.
 */
export const RESULT_TYPE_LABEL = Object.freeze({
  COMPLETED: '완료',
  PARTIAL: '일부 진행',
  NO_PROGRESS: '진행 없음',
  EXCEEDED: '예상보다 더 진행',
  REPLACED: '다른 방식으로 진행',
  OBSERVED: '실제 상태 기록',
  CANCELLED: '계획에서 제외',
});

export const STATUS_LABEL = Object.freeze({
  PLANNED: '예정',
  PARTIAL: '일부 진행',
  DONE: '완료',
  HOLD: '잠시 멈춤',
  CANCELLED: '계획에서 제외',
});

export const PRIORITY_LABEL = Object.freeze({
  MUST: '꼭',
  SHOULD: '보통',
  OPTIONAL: '여유 있으면',
});

export const EVENT_TYPE_LABEL = Object.freeze({
  CREATED: '만듦',
  MOVED: '옮김',
  REDUCED: '작게 줄임',
  SPLIT: '나눔',
  HOLD: '잠시 멈춤',
  RESUMED: '다시 시작',
  CANCELLED: '계획에서 제외',
  DELETED: '지움',
});

/* ===================== 타입 정의 ===================== */

/**
 * 실행 조각. 목표 데이터의 단일 원본.
 *
 * 오늘·실행·계획·기록 네 화면이 모두 이 타입을 공유한다.
 * 각 화면은 같은 원본을 다르게 투영할 뿐 자기 데이터를 소유하지 않는다.
 *
 * @typedef {Object} ExecutionItemDto
 * @property {number}  executionItemId
 * @property {number}  userId
 * @property {number|null} routineId
 * @property {number|null} parentExecutionItemId 분할로 생긴 조각의 부모
 * @property {string}  title
 * @property {string|null} description
 * @property {string}  itemType                  ExecutionItemType
 * @property {string}  placementType             PlacementType
 * @property {string|null} scheduledDate         'YYYY-MM-DD'. UNSCHEDULED 면 null
 * @property {string|null} startTime             'HH:mm'. TIME_FIXED 일 때만
 * @property {string|null} endTime               'HH:mm'. TIME_FIXED 일 때만
 * @property {number|null} estimatedMinutes      예상 소요. 실제는 Record 가 가짐
 * @property {string|null} targetAmount          '3장' 같은 분량 표현
 * @property {string|null} targetScope
 * @property {string}  status                    ExecutionStatus
 * @property {boolean} isFixed                   재배치 대상에서 제외되는지
 * @property {string}  priority                  ExecutionPriority. 우선 조각 정렬 1순위
 * @property {number}  displayOrder              정렬 2순위
 * @property {string}  originType                ExecutionOriginType
 * @property {boolean} modifiedAfterCreation
 * @property {number}  version                   낙관적 락 전용. updatedAt 과 역할이 다름
 * @property {string}  createdAt
 * @property {string}  updatedAt
 */

/**
 * 현실에서 실제로 일어난 결과.
 *
 * 입력은 오늘 화면 또는 현재 대상을 참조하는 AI 패널에서만 발생한다.
 * 실행 탭의 진행 목록에서는 결과를 직접 기록하지 않는다.
 *
 * @typedef {Object} ExecutionRecordDto
 * @property {number}  executionRecordId
 * @property {number}  userId
 * @property {number|null} executionItemId  계획에 없던 일이면 null
 * @property {string}  title
 * @property {string}  recordDate           'YYYY-MM-DD'
 * @property {string}  resultType           ExecutionResultType
 * @property {number|null} actualMinutes    실제 소요
 * @property {string|null} actualAmount     실제 분량
 * @property {string|null} actualStartAt
 * @property {string|null} actualEndAt
 * @property {string|null} memo
 * @property {boolean} aiExtracted          승인 전에는 저장되지 않음
 * @property {number|null} sourceProposalId
 * @property {string}  createdAt
 * @property {string}  updatedAt
 */

/**
 * 계획 조정 사건. 기록 탭의 패턴 화면이 이걸 집계한다.
 *
 * @typedef {Object} ExecutionItemEventDto
 * @property {number}  executionItemEventId
 * @property {number}  userId
 * @property {number}  executionItemId
 * @property {string}  eventType             ExecutionEventType
 * @property {string}  eventDate             'YYYY-MM-DD'
 * @property {Object|null} beforeJson        바뀐 필드만
 * @property {Object|null} afterJson         beforeJson 과 같은 키 집합
 * @property {number|null} resultExecutionItemId  SPLIT 으로 생긴 조각
 * @property {string|null} memo
 * @property {number|null} sourceProposalId
 * @property {string}  createdAt
 */

export {};

/** 계획 강도. 서버 PlanIntensity와 값이 같아야 한다. */
export const PlanIntensity = Object.freeze({
  LIGHT: 'LIGHT',
  NORMAL: 'NORMAL',
  FOCUSED: 'FOCUSED',
});

/**
 * 강도 라벨과 보조 설명.
 *
 * "가볍게"가 게으름으로 읽히지 않게 한다 — 최소/느슨하게/저강도 같은 말을 쓰지 않는다.
 * 주당 시간을 함께 보여줘야 고를 수 있다: 라벨만으로는 "집중"이 얼마나 집중인지 모른다.
 */
export const PLAN_INTENSITY_LABEL = Object.freeze({
  LIGHT: '가볍게',
  NORMAL: '보통',
  FOCUSED: '집중',
});

export const PLAN_INTENSITY_HINT = Object.freeze({
  LIGHT: '주 4시간쯤',
  NORMAL: '주 10시간쯤',
  FOCUSED: '주 18시간쯤',
});

/**
 * 회고 분류 라벨. 서버 PlanReviewCategory와 키가 같아야 한다.
 *
 * 실패 프레이밍 금지 — 미완료/실패/못 함/부족/밀림을 쓰지 않는다. 안 한 것은
 * "아직" 으로 말한다.
 */
export const PLAN_REVIEW_CATEGORY_LABEL = Object.freeze({
  DONE: '했어요',
  PARTIAL_DONE: '일부 진행했어요',
  REMAINING: '아직 남아 있어요',
  UNPLACED: '아직 시작하지 않았어요',
  HOLD: '잠시 멈춰뒀어요',
  EXCLUDED: '계획에서 뺐어요',
  OUTSIDE_PLAN: '계획 밖에서 한 일',
  LEFTOVER: '남은 분량',
});

/** 부가 플래그. 배치는 이동이 아니다 — "옮겼다"고 쓰면 어긋난 것처럼 읽힌다. */
export const PLAN_REVIEW_MOVE_FLAG_LABEL = Object.freeze({
  MOVED: '다른 날로 옮겨서',
  SCHEDULED: '날짜를 정해서',
  UNPLACED_AGAIN: '날짜를 다시 뗐어요',
});
