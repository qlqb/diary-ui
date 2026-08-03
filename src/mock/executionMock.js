/**
 * 4개 탭이 공유하는 단일 가짜 원본.
 *
 * 핵심 규칙: 오늘·계획·실행·기록은 각자 데이터를 만들지 않는다.
 * 이 파일의 배열 하나를 서로 다르게 투영할 뿐이다.
 * 화면별 가짜 배열을 새로 만들면 나중에 실제 API 로 바꿀 때 통합이 깨진다.
 */

import {
  ExecutionItemType,
  PlacementType,
  ExecutionStatus,
  ExecutionPriority,
  ExecutionOriginType,
  ExecutionResultType,
  ExecutionEventType,
} from '../types/execution.js';
import { PlanStatus } from '../types/plan.js';

/* ===================== 날짜 도우미 ===================== */

/** 로컬 기준 오늘. UTC 밀림을 피하려고 toISOString 을 쓰지 않는다. */
export function getTodayString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function shiftDate(baseString, days) {
  const [y, m, d] = baseString.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

const TODAY = getTodayString();
const YESTERDAY = shiftDate(TODAY, -1);
const TOMORROW = shiftDate(TODAY, 1);
const IN_TWO_DAYS = shiftDate(TODAY, 2);
const IN_FOUR_DAYS = shiftDate(TODAY, 4);
const LAST_WEEK = shiftDate(TODAY, -6);

/* ===================== 계획 ===================== */

/** @type {import('../types/plan.js').PlanDto[]} */
export const MOCK_PLANS = [
  {
    planId: 1,
    userId: 1,
    title: '자료구조 중간고사 준비',
    purpose: '트리와 그래프까지 손으로 풀 수 있게',
    status: PlanStatus.ACTIVE,
    startDate: LAST_WEEK,
    endDate: IN_FOUR_DAYS,
    successCondition: '기출 2회분을 시간 안에 푼다',
    subjectId: 11,
    sourceProposalId: null,
    appliedAt: `${LAST_WEEK}T09:12:00`,
    version: 3,
    createdAt: `${LAST_WEEK}T09:00:00`,
    updatedAt: `${YESTERDAY}T21:40:00`,
    items: null,
  },
  {
    planId: 2,
    userId: 1,
    title: '캡스톤 1차 발표 준비',
    purpose: '팀 발표에서 내 파트를 막힘없이 설명',
    status: PlanStatus.ACTIVE,
    startDate: shiftDate(TODAY, -3),
    endDate: shiftDate(TODAY, 9),
    successCondition: '슬라이드와 대본이 연결된다',
    subjectId: 12,
    sourceProposalId: 7,
    appliedAt: `${shiftDate(TODAY, -3)}T18:30:00`,
    version: 1,
    createdAt: `${shiftDate(TODAY, -3)}T18:20:00`,
    updatedAt: `${shiftDate(TODAY, -3)}T18:30:00`,
    items: null,
  },
  {
    planId: 3,
    userId: 1,
    title: '여름 영어 회화 습관',
    purpose: '매일 조금씩 말하기',
    status: PlanStatus.DRAFT,
    startDate: null,
    endDate: null,
    successCondition: null,
    subjectId: null,
    sourceProposalId: null,
    appliedAt: null,
    version: 0,
    createdAt: `${YESTERDAY}T22:05:00`,
    updatedAt: `${YESTERDAY}T22:05:00`,
    items: null,
  },
];

/** @type {import('../types/plan.js').PlanItemDto[]} */
export const MOCK_PLAN_ITEMS = [
  {
    planItemId: 101,
    planId: 1,
    userId: 1,
    title: '트리 순회 복습',
    description: '전위·중위·후위와 레벨 순회',
    parentPlanItemId: null,
    sortOrder: 1,
    targetDate: TOMORROW,
    targetAmount: '교재 6장',
    estimatedMinutes: 180,
    version: 1,
    createdAt: `${LAST_WEEK}T09:00:00`,
    updatedAt: `${LAST_WEEK}T09:00:00`,
  },
  {
    planItemId: 102,
    planId: 1,
    userId: 1,
    title: '그래프 탐색 문제 풀이',
    description: 'BFS/DFS 기출 중심',
    parentPlanItemId: null,
    sortOrder: 2,
    targetDate: IN_FOUR_DAYS,
    targetAmount: '20문제',
    estimatedMinutes: 240,
    version: 1,
    createdAt: `${LAST_WEEK}T09:00:00`,
    updatedAt: `${LAST_WEEK}T09:00:00`,
  },
  {
    planItemId: 201,
    planId: 2,
    userId: 1,
    title: '내 파트 슬라이드 초안',
    description: '시스템 구조 설명 4장',
    parentPlanItemId: null,
    sortOrder: 1,
    targetDate: IN_TWO_DAYS,
    targetAmount: '4장',
    estimatedMinutes: 150,
    version: 1,
    createdAt: `${shiftDate(TODAY, -3)}T18:20:00`,
    updatedAt: `${shiftDate(TODAY, -3)}T18:20:00`,
  },
];

/* ===================== 실행 조각 (단일 원본) ===================== */

/**
 * 오늘·실행 두 화면이 공유하는 원본.
 * 오늘은 scheduledDate 가 오늘인 것만, 실행은 전체를 본다.
 *
 * @type {import('../types/execution.js').ExecutionItemDto[]}
 */
export const MOCK_EXECUTION_ITEMS = [
  // --- 오늘 날짜 ---
  {
    executionItemId: 1001,
    userId: 1,
    planItemId: 101,
    routineId: null,
    parentExecutionItemId: null,
    title: '트리 순회 복습 - 중위 순회',
    description: '교재 6장 앞부분',
    itemType: ExecutionItemType.TASK,
    placementType: PlacementType.DATE_ONLY,
    scheduledDate: TODAY,
    startTime: null,
    endTime: null,
    estimatedMinutes: 50,
    targetAmount: '2장',
    targetScope: '6.1 ~ 6.2',
    status: ExecutionStatus.PLANNED,
    isFixed: false,
    priority: ExecutionPriority.MUST,
    displayOrder: 1,
    originType: ExecutionOriginType.MANUAL,
    modifiedAfterCreation: false,
    version: 0,
    createdAt: `${YESTERDAY}T22:10:00`,
    updatedAt: `${YESTERDAY}T22:10:00`,
  },
  {
    executionItemId: 1002,
    userId: 1,
    planItemId: null,
    routineId: null,
    parentExecutionItemId: null,
    title: '자료구조 수업',
    description: null,
    itemType: ExecutionItemType.FIXED_EVENT,
    placementType: PlacementType.TIME_FIXED,
    scheduledDate: TODAY,
    startTime: '13:00',
    endTime: '14:50',
    estimatedMinutes: 110,
    targetAmount: null,
    targetScope: null,
    status: ExecutionStatus.PLANNED,
    isFixed: true,
    priority: ExecutionPriority.SHOULD,
    displayOrder: 1,
    originType: ExecutionOriginType.IMPORTED,
    modifiedAfterCreation: false,
    version: 0,
    createdAt: `${LAST_WEEK}T08:00:00`,
    updatedAt: `${LAST_WEEK}T08:00:00`,
  },
  {
    executionItemId: 1003,
    userId: 1,
    planItemId: 201,
    routineId: null,
    parentExecutionItemId: null,
    title: '캡스톤 슬라이드 구조 잡기',
    description: '목차와 흐름만',
    itemType: ExecutionItemType.TASK,
    placementType: PlacementType.TIME_FIXED,
    scheduledDate: TODAY,
    startTime: '19:00',
    endTime: '20:00',
    estimatedMinutes: 60,
    targetAmount: null,
    targetScope: null,
    status: ExecutionStatus.PLANNED,
    isFixed: false,
    priority: ExecutionPriority.SHOULD,
    displayOrder: 2,
    originType: ExecutionOriginType.AI_GENERATED,
    modifiedAfterCreation: true,
    version: 2,
    createdAt: `${shiftDate(TODAY, -3)}T18:30:00`,
    updatedAt: `${YESTERDAY}T09:15:00`,
  },
  {
    executionItemId: 1004,
    userId: 1,
    planItemId: null,
    routineId: 5,
    parentExecutionItemId: null,
    title: '아침 스트레칭',
    description: null,
    itemType: ExecutionItemType.ROUTINE_OCCURRENCE,
    placementType: PlacementType.DATE_ONLY,
    scheduledDate: TODAY,
    startTime: null,
    endTime: null,
    estimatedMinutes: 10,
    targetAmount: null,
    targetScope: null,
    status: ExecutionStatus.DONE,
    isFixed: false,
    priority: ExecutionPriority.OPTIONAL,
    displayOrder: 3,
    originType: ExecutionOriginType.ROUTINE_GENERATED,
    modifiedAfterCreation: false,
    version: 1,
    createdAt: `${TODAY}T06:00:00`,
    updatedAt: `${TODAY}T07:40:00`,
  },
  {
    executionItemId: 1005,
    userId: 1,
    planItemId: 102,
    routineId: null,
    parentExecutionItemId: null,
    title: '그래프 기출 5문제',
    description: null,
    itemType: ExecutionItemType.TASK,
    placementType: PlacementType.DATE_ONLY,
    scheduledDate: TODAY,
    startTime: null,
    endTime: null,
    estimatedMinutes: 45,
    targetAmount: '5문제',
    targetScope: null,
    status: ExecutionStatus.HOLD,
    isFixed: false,
    priority: ExecutionPriority.SHOULD,
    displayOrder: 4,
    originType: ExecutionOriginType.MANUAL,
    modifiedAfterCreation: false,
    version: 1,
    createdAt: `${shiftDate(TODAY, -2)}T20:00:00`,
    updatedAt: `${YESTERDAY}T23:10:00`,
  },

  // --- 다른 날짜: 실행 탭에만 보인다 ---
  {
    executionItemId: 1006,
    userId: 1,
    planItemId: 101,
    routineId: null,
    parentExecutionItemId: null,
    title: '트리 순회 복습 - 후위 순회',
    description: null,
    itemType: ExecutionItemType.TASK,
    placementType: PlacementType.DATE_ONLY,
    scheduledDate: TOMORROW,
    startTime: null,
    endTime: null,
    estimatedMinutes: 50,
    targetAmount: '2장',
    targetScope: '6.3 ~ 6.4',
    status: ExecutionStatus.PLANNED,
    isFixed: false,
    priority: ExecutionPriority.SHOULD,
    displayOrder: 1,
    originType: ExecutionOriginType.MANUAL,
    modifiedAfterCreation: false,
    version: 0,
    createdAt: `${YESTERDAY}T22:10:00`,
    updatedAt: `${YESTERDAY}T22:10:00`,
  },
  {
    executionItemId: 1007,
    userId: 1,
    planItemId: 201,
    routineId: null,
    parentExecutionItemId: null,
    title: '캡스톤 슬라이드 본문 작성',
    description: null,
    itemType: ExecutionItemType.TASK,
    placementType: PlacementType.TIME_FIXED,
    scheduledDate: IN_TWO_DAYS,
    startTime: '20:00',
    endTime: '21:30',
    estimatedMinutes: 90,
    targetAmount: '4장',
    targetScope: null,
    status: ExecutionStatus.PLANNED,
    isFixed: false,
    priority: ExecutionPriority.MUST,
    displayOrder: 1,
    originType: ExecutionOriginType.AI_GENERATED,
    modifiedAfterCreation: false,
    version: 0,
    createdAt: `${shiftDate(TODAY, -3)}T18:30:00`,
    updatedAt: `${shiftDate(TODAY, -3)}T18:30:00`,
  },
  {
    executionItemId: 1008,
    userId: 1,
    planItemId: 102,
    routineId: null,
    parentExecutionItemId: null,
    title: '그래프 기출 나머지',
    description: null,
    itemType: ExecutionItemType.TASK,
    placementType: PlacementType.UNSCHEDULED,
    scheduledDate: null,
    startTime: null,
    endTime: null,
    estimatedMinutes: 120,
    targetAmount: '15문제',
    targetScope: null,
    status: ExecutionStatus.PLANNED,
    isFixed: false,
    priority: ExecutionPriority.OPTIONAL,
    displayOrder: 99,
    originType: ExecutionOriginType.MANUAL,
    modifiedAfterCreation: false,
    version: 0,
    createdAt: `${shiftDate(TODAY, -2)}T20:05:00`,
    updatedAt: `${shiftDate(TODAY, -2)}T20:05:00`,
  },

  // --- 어제: 기록과 이벤트가 붙어 있다 ---
  {
    executionItemId: 1009,
    userId: 1,
    planItemId: 101,
    routineId: null,
    parentExecutionItemId: null,
    title: '트리 순회 복습 - 전위 순회',
    description: null,
    itemType: ExecutionItemType.TASK,
    placementType: PlacementType.DATE_ONLY,
    scheduledDate: YESTERDAY,
    startTime: null,
    endTime: null,
    estimatedMinutes: 60,
    targetAmount: '2장',
    targetScope: null,
    status: ExecutionStatus.DONE,
    isFixed: false,
    priority: ExecutionPriority.SHOULD,
    displayOrder: 1,
    originType: ExecutionOriginType.MANUAL,
    modifiedAfterCreation: false,
    version: 2,
    createdAt: `${shiftDate(TODAY, -2)}T21:00:00`,
    updatedAt: `${YESTERDAY}T23:30:00`,
  },
];

/* ===================== 실제 결과 ===================== */

/** @type {import('../types/execution.js').ExecutionRecordDto[]} */
export const MOCK_EXECUTION_RECORDS = [
  {
    executionRecordId: 5001,
    userId: 1,
    executionItemId: 1009,
    title: '트리 순회 복습 - 전위 순회',
    recordDate: YESTERDAY,
    // 60분 계획했지만 25분만 했다. 남은 35분을 그대로 옮기면 안 된다는 것을
    // 보여주는 예시. 계획과 실제가 분리되어 있어야 이 구분이 가능하다.
    resultType: ExecutionResultType.PARTIAL,
    actualMinutes: 25,
    actualAmount: '1장',
    actualStartAt: `${YESTERDAY}T21:05:00`,
    actualEndAt: `${YESTERDAY}T21:30:00`,
    memo: '생각보다 개념이 헷갈려서 진도가 안 나감',
    aiExtracted: true,
    sourceProposalId: 7,
    createdAt: `${YESTERDAY}T23:30:00`,
    updatedAt: `${YESTERDAY}T23:30:00`,
  },
  {
    executionRecordId: 5002,
    userId: 1,
    executionItemId: 1004,
    title: '아침 스트레칭',
    recordDate: TODAY,
    resultType: ExecutionResultType.COMPLETED,
    actualMinutes: 10,
    actualAmount: null,
    actualStartAt: `${TODAY}T07:30:00`,
    actualEndAt: `${TODAY}T07:40:00`,
    memo: null,
    aiExtracted: false,
    sourceProposalId: null,
    createdAt: `${TODAY}T07:40:00`,
    updatedAt: `${TODAY}T07:40:00`,
  },
  {
    executionRecordId: 5003,
    userId: 1,
    // 계획에 없던 일. executionItemId 가 null 이고 title 이 내용을 담는다.
    executionItemId: null,
    title: '팀원과 발표 역할 정리 통화',
    recordDate: YESTERDAY,
    resultType: ExecutionResultType.OBSERVED,
    actualMinutes: 35,
    actualAmount: null,
    actualStartAt: `${YESTERDAY}T19:00:00`,
    actualEndAt: `${YESTERDAY}T19:35:00`,
    memo: '내 파트가 시스템 구조로 확정됨',
    aiExtracted: true,
    sourceProposalId: 7,
    createdAt: `${YESTERDAY}T23:32:00`,
    updatedAt: `${YESTERDAY}T23:32:00`,
  },
];

/* ===================== 조정 사건 ===================== */

/** @type {import('../types/execution.js').ExecutionItemEventDto[]} */
export const MOCK_EXECUTION_EVENTS = [
  {
    executionItemEventId: 9001,
    userId: 1,
    executionItemId: 1005,
    eventType: ExecutionEventType.HOLD,
    eventDate: YESTERDAY,
    beforeJson: { status: 'PLANNED' },
    afterJson: { status: 'HOLD' },
    resultExecutionItemId: null,
    memo: '시험 범위 확인 후 다시 판단',
    sourceProposalId: null,
    createdAt: `${YESTERDAY}T23:10:00`,
  },
  {
    executionItemEventId: 9002,
    userId: 1,
    executionItemId: 1003,
    eventType: ExecutionEventType.MOVED,
    eventDate: YESTERDAY,
    beforeJson: { scheduledDate: YESTERDAY, startTime: '20:00' },
    afterJson: { scheduledDate: TODAY, startTime: '19:00' },
    resultExecutionItemId: null,
    memo: null,
    sourceProposalId: 7,
    createdAt: `${YESTERDAY}T09:15:00`,
  },
  {
    executionItemEventId: 9003,
    userId: 1,
    executionItemId: 1008,
    eventType: ExecutionEventType.SPLIT,
    eventDate: shiftDate(TODAY, -2),
    beforeJson: { targetAmount: '20문제', estimatedMinutes: 165 },
    afterJson: { targetAmount: '15문제', estimatedMinutes: 120 },
    resultExecutionItemId: 1005,
    memo: '오늘 할 5문제를 따로 뗌',
    sourceProposalId: null,
    createdAt: `${shiftDate(TODAY, -2)}T20:05:00`,
  },
];

/* ===================== 투영 선택자 ===================== */

/**
 * 오늘 탭 투영.
 *
 * 오늘은 별도 데이터를 소유하지 않는다. 같은 원본에서 당일 항목만 골라낸다.
 * DONE 도 포함한다. 오늘 한 일을 확인할 수 있어야 하기 때문이다.
 */
export function selectTodayItems(items, today = getTodayString()) {
  return items.filter(
    (it) =>
      it.scheduledDate === today &&
      it.status !== ExecutionStatus.CANCELLED,
  );
}

const PRIORITY_RANK = { MUST: 0, SHOULD: 1, OPTIONAL: 2 };

/**
 * 우선 조각 정렬(v6.1 §5).
 *
 * priority -> displayOrder -> executionItemId 순.
 * 불투명한 AI 점수로 자동 결정하지 않는다.
 * 마감 임박이나 충돌은 경고로 표시할 수 있지만 priority 를 자동으로 바꾸지 않는다.
 */
export function sortByPriority(items) {
  return [...items].sort((a, b) => {
    const pa = PRIORITY_RANK[a.priority] ?? 1;
    const pb = PRIORITY_RANK[b.priority] ?? 1;
    if (pa !== pb) return pa - pb;
    if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
    return a.executionItemId - b.executionItemId;
  });
}

/**
 * 우선 조각. 시각이 고정된 항목은 제외한다.
 * 고정 일정은 '다음 일정' 영역에서 따로 보여준다(v6.1 §5).
 */
export function selectPriorityItems(items, today = getTodayString()) {
  const todays = selectTodayItems(items, today).filter(
    (it) => !it.isFixed && it.status === ExecutionStatus.PLANNED,
  );
  return sortByPriority(todays);
}

/** 다음 일정. 시각이 있는 항목만 시간순으로. */
export function selectUpcomingItems(items, today = getTodayString()) {
  return selectTodayItems(items, today)
    .filter((it) => it.placementType === PlacementType.TIME_FIXED && it.startTime)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

/**
 * 실행 탭 투영.
 *
 * 활성 계획에 속한 전체 항목. 날짜 범위 무관.
 * 여기서는 결과를 기록하지 않는다. 조회와 운영 조정만 한다.
 */
export function selectActiveExecutionItems(items) {
  return items.filter((it) => it.status !== ExecutionStatus.CANCELLED);
}

/** 계획별 묶음. 실행 탭의 진행 목록용. */
export function groupByPlan(items, planItems, plans) {
  const planItemToPlan = new Map(planItems.map((pi) => [pi.planItemId, pi.planId]));
  const planById = new Map(plans.map((p) => [p.planId, p]));

  const groups = new Map();
  for (const it of items) {
    const planId = it.planItemId ? planItemToPlan.get(it.planItemId) ?? null : null;
    if (!groups.has(planId)) {
      groups.set(planId, { plan: planId ? planById.get(planId) ?? null : null, items: [] });
    }
    groups.get(planId).items.push(it);
  }
  return [...groups.values()];
}

/** 기록 탭 투영. 승인된 실제 결과를 최신순으로. */
export function selectRecords(records) {
  return [...records].sort((a, b) => b.recordDate.localeCompare(a.recordDate));
}
