/**
 * 학습(Material/Learning/Planning Agent) 데이터 계약. 백엔드 course/material/learning/
 * planning 패키지와 1:1 대응한다. execution.js/proposal.js와 같은 규칙을 따른다 —
 * 여기 나열된 enum 값은 실제 DB 체크 제약과 1:1이며, 화면은 임의로 다른 값을 쓰지 않는다.
 */

/**
 * 프로젝트 안에서 이 자료가 맡는 역할.
 * 실제 material_links.material_type CHECK 제약과 1:1 대응한다.
 * 동일한 Material도 프로젝트마다 다른 값을 가질 수 있다.
 */
export const MaterialType = Object.freeze({
  SYLLABUS: 'SYLLABUS',
  TEXTBOOK_TOC: 'TEXTBOOK_TOC',
  PROFESSOR_SLIDE: 'PROFESSOR_SLIDE',
  OTHER: 'OTHER',
});

export const MATERIAL_TYPE_LABEL = Object.freeze({
  [MaterialType.SYLLABUS]: '강의계획서',
  [MaterialType.TEXTBOOK_TOC]: '교재 목차',
  [MaterialType.PROFESSOR_SLIDE]: '교수 자료(PPT 등)',
  [MaterialType.OTHER]: '기타',
});

/**
 * 역할을 고르는 UI 옆에 항상 함께 붙이는 한 줄.
 *
 * 라벨만 보면 "이 파일이 무엇인가"로 읽히는데 실제 의미는 "이 프로젝트가 이걸 무엇으로
 * 쓰는가"다. 같은 PDF가 프로젝트마다 다른 값을 갖는 게 사용자에게도 말이 되려면 이 문장이
 * 선택 UI 근처에 있어야 한다.
 */
export const MATERIAL_TYPE_HINT = '이 프로젝트에서 이 자료를 어떻게 사용할지 정합니다.';

/** 텍스트 추출 결과. 스캔 이미지 등 텍스트 레이어가 없으면 FAILED_NO_TEXT로 명확히 구분한다. */
export const ExtractionStatus = Object.freeze({
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  FAILED_NO_TEXT: 'FAILED_NO_TEXT',
  FAILED: 'FAILED',
});

export const EXTRACTION_STATUS_LABEL = Object.freeze({
  [ExtractionStatus.PENDING]: '추출 중',
  [ExtractionStatus.SUCCESS]: '추출 완료',
  [ExtractionStatus.FAILED_NO_TEXT]: '텍스트를 찾지 못함',
  [ExtractionStatus.FAILED]: '추출 실패',
});

/** Material Agent 분석 결과의 확정 여부. APPLIED 전에는 course_topics에 전혀 반영되지 않는다. */
export const MaterialAnalysisStatus = Object.freeze({
  DRAFT: 'DRAFT',
  APPLIED: 'APPLIED',
  DISMISSED: 'DISMISSED',
  FAILED: 'FAILED',
});

/**
 * 학습 topic이 아닌 과목 사실 정보의 성격. course_notes.category와 1:1 대응한다.
 * LearningMap을 오염시키지 않기 위해 Material Agent 분석 단계에서부터 topics와 분리한다.
 */
export const CourseNoteCategory = Object.freeze({
  COURSE_INFO: 'COURSE_INFO',
  ASSESSMENT: 'ASSESSMENT',
});

export const COURSE_NOTE_CATEGORY_LABEL = Object.freeze({
  [CourseNoteCategory.COURSE_INFO]: '과목 정보',
  [CourseNoteCategory.ASSESSMENT]: '평가/일정',
});

/** topic 항목이 원문에 실제 있었는지(SOURCE), AI가 학습 편의를 위해 세분화했는지(AI_DERIVED). */
export const TopicSourceType = Object.freeze({
  SOURCE: 'SOURCE',
  AI_DERIVED: 'AI_DERIVED',
});

export const TOPIC_SOURCE_TYPE_LABEL = Object.freeze({
  [TopicSourceType.SOURCE]: '원문 근거',
  [TopicSourceType.AI_DERIVED]: 'AI 세분화',
});

/**
 * topic별 학습 진행 상태. 완료 체크를 "완전히 이해했다"로 해석하지 않는다 — LEARNED도
 * "한 번은 마쳤다"는 뜻이지 이해 확정이 아니다.
 */
export const TopicProgressStatus = Object.freeze({
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  LEARNED: 'LEARNED',
});

export const TOPIC_PROGRESS_STATUS_LABEL = Object.freeze({
  [TopicProgressStatus.NOT_STARTED]: '아직 안 함',
  [TopicProgressStatus.IN_PROGRESS]: '학습 중',
  [TopicProgressStatus.LEARNED]: '학습 완료',
});

/** Learning Agent가 추천하는 활동 성격. SKIP은 진행 상태가 아니라 "이번엔 안 해도 된다"는 판단이다. */
export const ActivityType = Object.freeze({
  NEW_LEARNING: 'NEW_LEARNING',
  REVIEW: 'REVIEW',
  CONTINUE: 'CONTINUE',
  SKIP: 'SKIP',
});

export const ACTIVITY_TYPE_LABEL = Object.freeze({
  [ActivityType.NEW_LEARNING]: '새로 학습',
  [ActivityType.REVIEW]: '복습',
  [ActivityType.CONTINUE]: '이어서 학습',
  [ActivityType.SKIP]: '건너뛰기 추천',
});

/** study_recommendations.priority 체크 제약과 1:1. execution의 ExecutionPriority와 같은 값 집합. */
export const RecommendationPriority = Object.freeze({
  MUST: 'MUST',
  SHOULD: 'SHOULD',
  OPTIONAL: 'OPTIONAL',
});

/** 학습 추천의 처리 상태. */
export const RecommendationStatus = Object.freeze({
  SUGGESTED: 'SUGGESTED',
  SENT_TO_PLANNING: 'SENT_TO_PLANNING',
  PLANNED: 'PLANNED',
  DISMISSED: 'DISMISSED',
});

/**
 * @typedef {Object} CourseDto
 * @property {number} courseId
 * @property {string} title
 * @property {string|null} groupLabel
 * @property {string|null} textbookTitle
 * @property {string|null} textbookAuthor
 * @property {string|null} textbookPublisher
 * @property {string|null} textbookIsbn
 * @property {'ACTIVE'|'ARCHIVED'} status ARCHIVED는 보관(숨김)이지 삭제가 아니다 — topic/연결/분석은 그대로 남는다
 * @property {number} topicCount
 * @property {number} learnedTopicCount
 * @property {string|null} currentTopicTitle
 */

/**
 * @typedef {Object} MaterialDto 프로젝트 화면이 읽는 "이 프로젝트가 참고하는 자료" 한 줄
 *
 * Material 본체와 그 프로젝트로의 MaterialLink를 한 줄로 합쳐 놓은 화면용 형태다.
 * courseId/materialType은 Material의 속성이 아니라 링크에서 온 값이므로, 같은 materialId를
 * 다른 프로젝트에서 읽으면 이 두 값만 다르게 나온다. 전역 자료함은 이 형태를 쓰지 않는다 —
 * 거기서는 MaterialStoreItemDto처럼 연결이 배열로 붙는다.
 *
 * @property {number} materialId
 * @property {number} courseId 이 응답을 만든 프로젝트 (링크 쪽 값)
 * @property {string} materialType 그 프로젝트에서 맡는 역할 (링크 쪽 값)
 * @property {string} originalFilename
 * @property {string} extractionStatus
 * @property {string|null} extractionError
 */

/**
 * @typedef {Object} MaterialLinkDto 자료 ↔ 프로젝트 연결 한 줄
 * @property {number} courseId
 * @property {string} courseTitle
 * @property {string} materialType 이 프로젝트에서 맡는 역할. 같은 자료의 다른 연결과 값이 달라도 정상이다
 * @property {string} linkedAt
 */

/**
 * @typedef {Object} MaterialStoreItemDto 전역 자료함이 읽는 자료 한 건
 *
 * 자료는 프로젝트가 아니라 사용자가 소유한다 — 그래서 여기에는 courseId도 materialType도
 * 없고, 대신 연결이 links 배열로 붙는다. 어느 프로젝트에도 연결되지 않아 links가 비어 있는
 * 것은 정상 상태이지 결함이 아니다. 보관된 프로젝트로의 연결은 행이 남아 있어도 links에
 * 나타나지 않는다(복원하면 다시 보인다).
 *
 * @property {number} materialId
 * @property {string} originalFilename
 * @property {string|null} contentType
 * @property {string} extractionStatus
 * @property {MaterialLinkDto[]} links
 * @property {string} createdAt
 */

/**
 * @typedef {Object} TopicNodeDraft topic 트리 후보 노드 (분석 draft 전용, 확정 전)
 * @property {string} title
 * @property {string} sourceType SOURCE|AI_DERIVED
 * @property {string|null} sourceLocator
 * @property {TopicNodeDraft[]} children
 */

/**
 * @typedef {Object} CourseNoteDraft 과목 정보/평가 정보 후보 한 줄 (분석 draft 전용, 확정 전)
 * @property {string} category COURSE_INFO|ASSESSMENT
 * @property {string} label
 * @property {string} detail
 */

/**
 * @typedef {Object} MaterialAnalysisPayload
 * @property {string} summary
 * @property {{textbookTitle: string|null, textbookAuthor: string|null, textbookPublisher: string|null, textbookIsbn: string|null}} courseFields
 * @property {CourseNoteDraft[]} courseNotes 학습 topic이 아닌 과목 정보/평가 정보. topics와 분리되어 course_notes로 확정된다.
 * @property {{title: string, date: string|null, description: string}[]} keyDates
 * @property {TopicNodeDraft[]} topics 실제 학습 내용만. 담당교수/평가 비율 등은 여기 들어가지 않는다.
 */

/**
 * @typedef {Object} CourseNoteDto 확정된 과목 정보/평가 정보 한 줄
 * @property {number} noteId
 * @property {string} category COURSE_INFO|ASSESSMENT
 * @property {string} label
 * @property {string} detail
 * @property {string} createdAt
 */

/**
 * @typedef {Object} MaterialAnalysisDto
 *
 * 분석은 Material 하나가 아니라 (Material, Project) 쌍에 대해 만들어진다 — 같은 자료를 A와
 * B에서 각각 해석할 수 있고 그 결과는 서로 섞이지 않는다. 그래서 프로젝트 화면의 이력은
 * 그 프로젝트 맥락만 오고, 전역 자료 상세는 전체가 오되 각 행에 courseTitle이 붙는다.
 *
 * @property {number} analysisId
 * @property {number} courseId 이 해석이 만들어진 프로젝트 맥락
 * @property {string|null} courseTitle 전역 자료 상세에서 채워진다. DB에 중복 저장하지 않고 응답 조립 시 붙는 값
 * @property {number} materialId
 * @property {string} status DRAFT|APPLIED|DISMISSED|FAILED
 * @property {MaterialAnalysisPayload|null} payload
 * @property {string|null} failureReason
 * @property {number|null} createdTopicCount
 * @property {string} createdAt
 * @property {string|null} appliedAt
 */

/**
 * @typedef {Object} TopicDto 확정된 topic (진행 상태 포함, children 재귀 포함)
 * @property {number} topicId
 * @property {number|null} parentTopicId
 * @property {string} title
 * @property {string} sourceType SOURCE|AI_DERIVED
 * @property {string|null} sourceLocator
 * @property {number|null} sourceMaterialId
 * @property {string|null} sourceMaterialFilename 원본을 삭제해도 남는다 — 확정된 학습 내용의 출처 표시용
 * @property {boolean} sourceMaterialDeleted true면 "원본 삭제됨 · 파일명"으로 적는다
 * @property {string} progressStatus NOT_STARTED|IN_PROGRESS|LEARNED
 * @property {string|null} lastStudiedAt
 * @property {string|null} lastReviewedAt
 * @property {number} reviewCount
 * @property {TopicDto[]} children
 */

/**
 * @typedef {Object} StudyRecommendationDto
 * @property {number} recommendationId
 * @property {number} courseId
 * @property {number} topicId
 * @property {string} topicTitle
 * @property {string} activityType NEW_LEARNING|REVIEW|CONTINUE|SKIP
 * @property {number|null} recommendedMinutesMin
 * @property {number|null} recommendedMinutesIdeal
 * @property {string} priority MUST|SHOULD|OPTIONAL
 * @property {string} reason
 * @property {string} status SUGGESTED|SENT_TO_PLANNING|PLANNED|DISMISSED
 */

/**
 * @typedef {Object} PlanningDraftDto
 * @property {number} recommendationId
 * @property {number} proposalId
 * @property {number} courseId
 * @property {number} topicId
 * @property {string} topicTitle
 * @property {string} horizonStart
 * @property {string} horizonEnd
 * @property {Object} proposal AiProposalDto와 동일 (proposal.js 참고)
 * @property {Object} preview SchedulePreviewResponse (placedItems/unplacedItems 등)
 */
