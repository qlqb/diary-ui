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

/**
 * 조각 하나에 붙일 취급 문구. 판단에 없는 항목이면 아무것도 붙이지 않는다.
 *
 * 컴포넌트 파일이 아니라 여기 있는 이유: 컴포넌트 파일이 함수를 함께 내보내면 Fast Refresh가
 * 그 파일 전체를 새로 그려 편집 상태를 잃고, lint(react-refresh/only-export-components)가
 * 그것을 막는다.
 */
export function treatmentLabelOf(strategy, topicId) {
  if (!strategy || topicId == null) return null;
  const found = (strategy.topics ?? []).find((t) => t.topicId === topicId);
  return found ? (TREATMENT_LABEL[found.treatment] ?? null) : null;
}

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
  MATERIAL_SECTION: '자료 구간',
  ASSIGNMENT: '과제',
  CONVERSATION_MESSAGE: 'AI 대화 원문',
  PLAN_BRIEF: '대화에서 합의한 것',
  EXECUTION_HISTORY: '실행 기록',
  NEXT_CLASS: '다음 수업',
};

/** 마감이 어디서 왔는가. 확인된 사실과 AI 제안을 구분해 말한다. */
export const DEADLINE_SOURCE_LABEL = {
  CLASS: '수업 전',
  ASSIGNMENT: '과제 마감',
  AI_PROPOSED: 'AI 제안 목표',
  USER: '직접 정함',
};

/** 이미 있던 항목을 어떻게 하기로 했는가. */
export const EXISTING_ACTION_LABEL = {
  KEEP: '그대로',
  REDUCE: '줄이기',
  MOVE: '옮기기',
  DROP: '이번 계획에서 빼기',
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
  MATERIAL_SELECTION: '자료 선택 결과',
  GENERATION_CALLS: '호출 횟수·토큰',
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
export function formatDeadline(deadlineAt, classAt = null, source = null) {
  if (!deadlineAt) return null;
  const at = new Date(deadlineAt);
  if (Number.isNaN(at.getTime())) return null;
  if (source === 'CLASS' || (classAt && new Date(classAt).getTime() === at.getTime())) {
    return `${WEEKDAY_KO[at.getDay()]}요일 수업 전`;
  }
  const hh = String(at.getHours()).padStart(2, '0');
  const mm = String(at.getMinutes()).padStart(2, '0');
  const when = `${at.getMonth() + 1}/${at.getDate()} ${hh}:${mm}까지`;
  if (source === 'AI_PROPOSED') return `${when} (AI 제안 목표)`;
  if (source === 'ASSIGNMENT') return `${when} (과제 마감)`;
  return when;
}

/**
 * 예상 시간. 범위로 적지 않는다 — 서버가 내는 것은 하나의 추정이고, 범위로 보이면
 * 실제로 없는 정밀도를 주장하게 된다.
 */
export function formatEstimate(minutes) {
  return minutes ? `약 ${minutes}분` : null;
}

/* ===== 상담 작업 공간: 초안 첫 화면 요약과 항목 카드 ===== */

/**
 * 대상 프로젝트가 이번 초안에서 어떻게 됐는가.
 *
 * ★ NOT_REVIEWED는 "뺐다"가 아니다. 검토 자체를 못 한 것이고, 중요하지 않다고 본 것이 아니다.
 *   그 둘을 같은 말로 부르면 사용자는 AI가 그 프로젝트를 덜 중요하게 봤다고 읽는다.
 */
export const PROJECT_DISPOSITION_LABEL = {
  INCLUDED: '이번 초안에 포함',
  EXCLUDED_BY_CHOICE: '이번에는 뺐어요',
  UNDECIDED: '아직 정하지 못했어요',
  NOT_REVIEWED: '검토하지 못했어요 — 중요도 판단이 아니에요',
};

/** 그 프로젝트의 자료를 어디까지 봤는가. */
export const MATERIAL_STATE_LABEL = {
  NO_MATERIAL: '올린 자료가 없어요',
  ANALYSIS_PENDING: '자료 분석을 기다리는 중이에요',
  NO_RELEVANT_CONTENT: '이번 요청과 맞는 내용을 찾지 못했어요',
  NOT_LISTED: '자료가 후보 목록에 오르지 못했어요',
  OUTLINE_ONLY: '목차만 확인했어요',
  RETRIEVAL_FAILED: '원문을 읽어 오지 못했어요',
  TEXT_DELIVERED: '원문을 읽었어요',
};

/** 빠졌거나 못 본 프로젝트를 다음에 어떻게 하면 되는가. 강요가 아니라 길 안내다. */
export const NEXT_ACTION_HINT = {
  ANSWER_QUESTION: '질문에 답하면 정할 수 있어요',
  UPLOAD_MATERIAL: '자료를 올리면 반영할 수 있어요',
  WAIT_ANALYSIS: '분석이 끝난 뒤 다시 만들면 반영돼요',
  RETRY_ANALYSIS: '자료 분석을 다시 시도해 주세요',
  NARROW_SCOPE: '범위를 좁혀서 다시 만들면 볼 수 있어요',
  REVIEW_LATER: '다음 계획에서 다시 볼게요',
};

/** 항목이 어디서 나왔는가. 자료에 있던 과제와 AI가 지어낸 연습을 같은 것으로 읽히게 두지 않는다. */
export const ITEM_ORIGIN_LABEL = {
  SOURCE_TASK: '자료에 있는 과제·실습',
  AI_PRACTICE: 'AI가 만든 추가 연습',
  USER_REQUEST: '내가 요청한 준비 작업',
};

/** 마감 옆에 따로 적는 출처. AI가 잡은 목표 시각을 실제 마감으로 읽으면 안 된다. */
export const DEADLINE_SOURCE_DETAIL = {
  CLASS: '수업 시각',
  ASSIGNMENT: '과제 마감',
  AI_PROPOSED: 'AI가 제안한 목표 시각 — 실제 마감 아님',
  USER: '직접 정함',
};

/**
 * 가능한 시간을 무엇으로 잡았는가. 등록된 일정이 없어서 가정한 것과 일정을 못 읽은 것은 다른 사실이다 —
 * 이 문구는 "일정이 없다"는 것을 서버가 확인했을 때만 쓴다. 조회가 안 된 경우의 문구는 화면이 따로 가진다.
 */
export const AVAILABILITY_BASIS_NOTE = {
  ALL_ASSUMED: '등록된 일정이 없어 가능한 시간은 가정이에요. 배치는 임시예요',
  PARTLY_ASSUMED: '일부 시간대는 등록된 일정 없이 가정했어요. 그 부분의 배치는 임시예요',
};

/** 마감을 시각과 출처로 나눠 돌려준다. 마감이 없으면 null — 화면은 "마감 미확인"이라고 말한다. */
export function describeDeadline(deadlineAt, classAt = null, source = null) {
  if (!deadlineAt) return null;
  const at = new Date(deadlineAt);
  if (Number.isNaN(at.getTime())) return null;
  const isClass = source === 'CLASS' || (!source && classAt && new Date(classAt).getTime() === at.getTime());
  const hh = String(at.getHours()).padStart(2, '0');
  const mm = String(at.getMinutes()).padStart(2, '0');
  const when = isClass
    ? `${WEEKDAY_KO[at.getDay()]}요일 수업 전 (${at.getMonth() + 1}/${at.getDate()} ${hh}:${mm})`
    : `${at.getMonth() + 1}/${at.getDate()} ${hh}:${mm}까지`;
  const sourceLabel = isClass ? DEADLINE_SOURCE_DETAIL.CLASS : (DEADLINE_SOURCE_DETAIL[source] ?? '출처 미확인');
  return { when, sourceLabel };
}

/** 빼지 않은 새 항목의 예상 시간 합. 서버 값(proposedMinutes)이 없을 때의 대체 계산이다. */
export function proposedMinutesOf(draft) {
  if (draft?.proposedMinutes != null) return draft.proposedMinutes;
  return (draft?.proposal?.items ?? [])
    .filter((item) => !item.operation || item.operation === 'CREATE')
    .reduce((sum, item) => sum + (item.expectedMinutes || 0), 0);
}

/**
 * 좁은 화면에서 입력창 위에 늘 보이는 한 줄. 시트를 열지 않아도 "무엇이 빠졌고 무엇이 가정인가"는 보인다.
 * 분 단위 포맷은 호출부가 넘긴다(planTime.formatMinutes) — 이 파일은 시간 포맷을 모른다.
 */
export function draftCoverageNotice(draft, formatMinutes = (m) => `${m}분`) {
  if (!draft?.proposalId) return null;
  const items = (draft.proposal?.items ?? []).filter((item) => !item.operation || item.operation === 'CREATE');
  const parts = [`초안 ${items.length}개 · ${formatMinutes(proposedMinutesOf(draft))}`];
  const projects = draft.strategy?.projects ?? [];
  const notReviewed = projects.filter((p) => p.disposition === 'NOT_REVIEWED').length;
  const undecided = projects.filter((p) => p.disposition === 'UNDECIDED').length;
  const excluded = projects.filter((p) => p.disposition === 'EXCLUDED_BY_CHOICE').length;
  if (notReviewed > 0) parts.push(`프로젝트 ${notReviewed}개는 검토하지 못했어요`);
  if (undecided > 0) parts.push(`${undecided}개는 아직 정하지 못했어요`);
  if (excluded > 0) parts.push(`${excluded}개는 이번에 뺐어요`);
  if (draft.availabilityBasis === 'ALL_ASSUMED' || draft.availabilityBasis === 'PARTLY_ASSUMED') {
    parts.push('가능한 시간은 가정 · 배치는 임시');
  }
  if (draft.freshness?.state === 'STALE') parts.push('최신 답변 반영 전');
  return parts.join(' · ');
}
