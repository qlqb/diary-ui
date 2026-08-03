/**
 * AI 변경안 계약. 백엔드 ai 패키지와 1:1 대응한다.
 *
 * 모델은 변경안을 만들 뿐 DB를 직접 바꾸지 않는다.
 * 사용자가 검토·수정·선택해 적용한 것만 반영된다.
 */

/**
 * 변경안의 생애주기.
 *
 * 적용 규칙(v6.1 §3):
 * - 사용자는 항목을 골라 일부만 선택할 수 있다.
 * - 선택한 묶음은 하나의 트랜잭션으로 전부 성공하거나 전부 실패한다.
 * - 미선택 항목은 REJECTED 로 종료하고 Proposal 전체는 APPLIED 가 된다.
 * - 같은 Proposal 을 나중에 다시 나누어 적용할 수 없다.
 * - 따라서 PARTIALLY_APPLIED 상태는 존재하지 않는다.
 */
export const ProposalStatus = Object.freeze({
  GENERATING: 'GENERATING',
  DRAFT: 'DRAFT',
  APPLYING: 'APPLYING',
  APPLIED: 'APPLIED',
  DISMISSED: 'DISMISSED',
  GENERATION_FAILED: 'GENERATION_FAILED',
  APPLY_FAILED: 'APPLY_FAILED',
  EXPIRED: 'EXPIRED',
});

/** 변경안 개별 항목의 처리 결과. */
export const ProposalItemStatus = Object.freeze({
  PENDING: 'PENDING',
  APPLIED: 'APPLIED',
  /** 사용자가 내용을 고쳐서 적용됨. */
  MODIFIED_APPLIED: 'MODIFIED_APPLIED',
  /** 선택되지 않고 종료됨. 나중에 다시 적용할 수 없다. */
  REJECTED: 'REJECTED',
});

/** 변경안 항목이 DB에 무엇을 하려는지. */
export const ProposalItemAction = Object.freeze({
  CREATE_EXECUTION_ITEM: 'CREATE_EXECUTION_ITEM',
  UPDATE_EXECUTION_ITEM: 'UPDATE_EXECUTION_ITEM',
  MOVE_EXECUTION_ITEM: 'MOVE_EXECUTION_ITEM',
  REDUCE_EXECUTION_ITEM: 'REDUCE_EXECUTION_ITEM',
  SPLIT_EXECUTION_ITEM: 'SPLIT_EXECUTION_ITEM',
  HOLD_EXECUTION_ITEM: 'HOLD_EXECUTION_ITEM',
  CANCEL_EXECUTION_ITEM: 'CANCEL_EXECUTION_ITEM',
  CREATE_EXECUTION_RECORD: 'CREATE_EXECUTION_RECORD',
  CREATE_PLAN: 'CREATE_PLAN',
  UPDATE_PLAN_ITEM: 'UPDATE_PLAN_ITEM',
  CREATE_CONTEXT_ITEM: 'CREATE_CONTEXT_ITEM',
});

/* ===================== 실패 상태 표기 ===================== */

/**
 * 실패 상황의 화면 문구(v6.1 §10.8).
 * 서버의 failureReason 을 그대로 노출하지 않고 이 표를 거친다.
 */
export const PROPOSAL_FAILURE_MESSAGE = Object.freeze({
  GENERATION_FAILED: '변경안을 만들지 못했습니다.',
  APPLY_FAILED: '변경 사항이 적용되지 않았습니다.',
  EXPIRED: '변경안의 유효 기간이 지났습니다.',
  /** 낙관적 락 충돌. 강제 적용하지 않고 비교·재생성을 제공한다. */
  STALE: '변경안을 만든 뒤 원본 계획이 수정되었습니다.',
});

/** 실패 상태에서 사용자에게 제공하는 행동. */
export const PROPOSAL_RECOVERY_ACTION = Object.freeze({
  RETRY: '다시 시도',
  EDIT_INPUT: '내용 수정',
  REGENERATE: '변경안 다시 생성',
  COMPARE_CURRENT: '현재 내용과 비교',
  BACK_TO_PROPOSAL: '변경안으로 돌아가기',
});

/**
 * @typedef {Object} AiProposalDto
 * @property {number}  proposalId
 * @property {number}  userId
 * @property {string}  status                  ProposalStatus
 * @property {string}  userInput               자연어 원문. 생성 실패 시에도 보존
 * @property {string|null} aiSummary           모델이 상황을 어떻게 이해했는지
 * @property {string|null} sourceContext       today / plan / execution / record
 * @property {number|null} contextExecutionItemId
 * @property {number|null} contextPlanId
 * @property {AiProposalItemDto[]} items
 * @property {string|null} failureReason       화면에 그대로 노출하지 않음
 * @property {boolean} parseFailed             true 면 적용 가능한 변경안 없음
 * @property {string|null} fallbackMessage     파싱 실패해도 보여줄 대화 답변
 * @property {string}  idempotencyKey          중복 적용 방지
 * @property {string}  createdAt
 * @property {string|null} appliedAt
 * @property {string|null} expiresAt
 */

/**
 * @typedef {Object} AiProposalItemDto
 * @property {number}  proposalItemId
 * @property {number}  proposalId
 * @property {string}  action                  ProposalItemAction
 * @property {string}  status                  ProposalItemStatus
 * @property {string}  summary                 검토 화면의 한 줄 설명
 * @property {string|null} reason              왜 제안하는지
 * @property {number|null} evidenceCount       '관련 기록 N건'. 확신도 배지 대신 사용
 * @property {number|null} targetExecutionItemId
 * @property {number|null} targetPlanId
 * @property {number|null} targetPlanItemId
 * @property {number|null} targetVersion       적용 시 재검증. 불일치면 충돌
 * @property {Object}  payloadJson             적용할 값
 * @property {Object|null} modifiedPayloadJson 사용자가 고친 값. 있으면 우선
 * @property {Object|null} currentValueJson    비교 화면용 현재 값
 * @property {number}  displayOrder
 * @property {boolean} defaultSelected
 * @property {string}  createdAt
 */

export {};
