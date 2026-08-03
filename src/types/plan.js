/**
 * 계획 데이터 계약. 백엔드 plan 패키지와 1:1 대응한다.
 *
 * PlanItem 은 "무엇을 달성하려는가",
 * ExecutionItem 은 "그걸 위해 실제로 실행할 조각"이다.
 * 하나의 PlanItem 이 여러 ExecutionItem 으로 쪼개질 수 있다.
 */

/** 계획의 생애주기. */
export const PlanStatus = Object.freeze({
  /** 초안. 아직 적용하지 않았고 실행에 나타나지 않는다. */
  DRAFT: 'DRAFT',
  /** 실행 중. 사용자가 적용해 현재 활성화된 계획. */
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  /** 보관. 더 이상 운영하지 않지만 기록으로 남긴다. */
  ARCHIVED: 'ARCHIVED',
});

export const PLAN_STATUS_LABEL = Object.freeze({
  DRAFT: '초안',
  ACTIVE: '진행 중',
  COMPLETED: '마무리함',
  ARCHIVED: '보관',
});

/**
 * @typedef {Object} PlanDto
 * @property {number}  planId
 * @property {number}  userId
 * @property {string}  title
 * @property {string|null} purpose           무엇을 위해 하는 계획인지
 * @property {string}  status                PlanStatus
 * @property {string|null} startDate         'YYYY-MM-DD'
 * @property {string|null} endDate           'YYYY-MM-DD'
 * @property {string|null} successCondition  무엇이 되면 잘 된 것인지
 * @property {number|null} subjectId
 * @property {number|null} sourceProposalId
 * @property {string|null} appliedAt         DRAFT 인 동안 null
 * @property {number}  version
 * @property {string}  createdAt
 * @property {string}  updatedAt
 * @property {PlanItemDto[]|null} items      상세 조회에서만 채움
 */

/**
 * @typedef {Object} PlanItemDto
 * @property {number}  planItemId
 * @property {number}  planId
 * @property {number}  userId
 * @property {string}  title
 * @property {string|null} description
 * @property {number|null} parentPlanItemId  단계·장 구조. 최상위면 null
 * @property {number}  sortOrder
 * @property {string|null} targetDate        강제하지 않는 참고값
 * @property {string|null} targetAmount
 * @property {number|null} estimatedMinutes
 * @property {number}  version
 * @property {string}  createdAt
 * @property {string}  updatedAt
 */

export {};
