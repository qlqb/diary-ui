/**
 * 자료 분석·과제·변경안 화면의 표시 문구와 순수 계산을 한 곳에 모은다.
 *
 * ★ enum 원문(QUEUED, CANDIDATE, LINK …)을 화면에 내보내지 않는다. 서버가 값을 구분하려고 쓰는
 *   이름이지 사용자에게 할 말이 아니다. 여기를 지나지 않은 값이 화면에 보이면 번역을 빠뜨린 것이다.
 * ★ "실패"라는 말 대신 무엇이 안 됐고 무엇을 할 수 있는지를 쓴다(plan/copy.test.js와 같은 규칙).
 */

/** 자료 하나의 분석 상태 → 칩 문구와 톤. state는 서버 MaterialAnalysisStatusResponse.state. */
export const ANALYSIS_STATE_LABEL = Object.freeze({
  NONE: { label: '분석 대기', tone: 'status' },
  QUEUED: { label: '분석 대기', tone: 'status' },
  PAUSED: { label: '일시중지', tone: 'status' },
  RUNNING: { label: '분석 중', tone: 'accent' },
  PARTIAL: { label: '일부 완료', tone: 'warn' },
  DONE: { label: '분석 완료', tone: 'ok' },
  FAILED: { label: '다시 시도 필요', tone: 'warn' },
  UNAVAILABLE: { label: '지금은 사용 불가', tone: 'warn' },
  CANCELLED: { label: '취소됨', tone: 'status' },
  NO_TEXT: { label: '텍스트를 읽지 못함', tone: 'warn' },
});

export function analysisStateLabel(state) {
  return ANALYSIS_STATE_LABEL[state] ?? { label: '상태 확인 중', tone: 'status' };
}

/** 분석이 아직 돌고 있어 폴링을 계속할 상태. */
export function isAnalysisInProgress(state) {
  return state === 'QUEUED' || state === 'RUNNING' || state === 'NONE';
}

/** 자료 구간의 역할. 서버 SectionRole 이름 → 문구. 모르는 값은 "기타". */
export const SECTION_ROLE_LABEL = Object.freeze({
  CONCEPT: '설명',
  EXAMPLE: '예제',
  EXERCISE: '문제',
  ASSIGNMENT: '제출 요구',
  SCHEDULE: '일정',
  ADMIN: '운영 안내',
  SUMMARY: '정리',
  REFERENCE: '참고',
  OTHER: '기타',
  SOURCE: '출처',
});

export function sectionRoleLabel(role) {
  return SECTION_ROLE_LABEL[role] ?? '기타';
}

/** 과제 여부의 답. */
export const ASSIGNMENT_STATUS_LABEL = Object.freeze({
  CANDIDATE: '확인 전',
  CONFIRMED: '과제',
  NOT_ASSIGNMENT: '연습용',
  LATER: '나중에',
  DUPLICATE: '이미 있는 과제와 같음',
});

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

function parseIsoDate(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) };
}

/** "9월 18일" — 연도는 올해가 아닐 때만 붙인다. 화면의 마감은 원래 마감 날짜로 보여준다(다음날 00:00 경계로 바꾸지 않는다). */
export function formatDueDay(iso, todayIso = null) {
  const p = parseIsoDate(iso);
  if (!p) return null;
  const today = parseIsoDate(todayIso);
  const yearPart = today && today.y !== p.y ? `${p.y}년 ` : '';
  return `${yearPart}${p.mo}월 ${p.d}일`;
}

/**
 * 과제 한 줄의 마감 문구.
 *   DATE      → "9월 18일까지"
 *   DATETIME  → "9월 18일 23:59까지"
 *   NONE      → "마감 없음"
 *   UNKNOWN   → "마감 미확인"  (없음과 다르다)
 */
export function formatAssignmentDue(assignment, todayIso = null) {
  if (!assignment) return '';
  switch (assignment.dueKind) {
    case 'DATE':
      return `${formatDueDay(assignment.dueDate, todayIso)}까지`;
    case 'DATETIME': {
      const at = assignment.dueAt ? new Date(assignment.dueAt) : null;
      if (!at || Number.isNaN(at.getTime())) return '마감 미확인';
      const hh = String(at.getHours()).padStart(2, '0');
      const mm = String(at.getMinutes()).padStart(2, '0');
      return `${formatDueDay(assignment.dueAt, todayIso)} ${hh}:${mm}까지`;
    }
    case 'NONE':
      return '마감 없음';
    default:
      return '마감 미확인';
  }
}

/** 마감이 지났는가(서버 overdue를 우선하고, 없으면 오늘과 비교). 완료된 과제는 지난 것으로 보지 않는다. */
export function isOverdue(assignment, todayIso) {
  if (!assignment || assignment.completed) return false;
  if (typeof assignment.overdue === 'boolean') return assignment.overdue;
  const day = assignment.dueKind === 'DATE' ? assignment.dueDate
    : assignment.dueKind === 'DATETIME' ? (assignment.dueAt ?? '').slice(0, 10) : null;
  return Boolean(day && todayIso && day < todayIso);
}

/** 마감이 이 날짜 범위(포함) 안에 드는가. 오늘 화면이 "이번 주 안" 과제를 고를 때. */
export function dueWithin(assignment, fromIso, toIso) {
  const day = assignment?.dueKind === 'DATE' ? assignment.dueDate
    : assignment?.dueKind === 'DATETIME' ? (assignment.dueAt ?? '').slice(0, 10) : null;
  return Boolean(day && day >= fromIso && day <= toIso);
}

/** 추정 후보 한 줄 문구. isoDate가 있으면 "[이 날짜 맞아요]"의 대상이 된다. */
export function describeDueEstimate(estimate) {
  if (!estimate) return '';
  const text = estimate.text ? `"${estimate.text}"` : '';
  if (estimate.isoDate) {
    const basis = estimate.basis ? ` · ${estimate.basis}` : '';
    return `${text} → ${formatDueDay(estimate.isoDate)}(추정${basis})`;
  }
  if (estimate.monthDay) {
    const [mo, d] = estimate.monthDay.split('-').map(Number);
    return `${text} → ${mo}월 ${d}일 (연도 미확인)`;
  }
  return `${text} (날짜를 정하지 못했어요)`;
}

/** 요일 붙인 짧은 날짜. 오늘 화면용. */
export function formatDueWithWeekday(iso) {
  const p = parseIsoDate(iso);
  if (!p) return '';
  const date = new Date(p.y, p.mo - 1, p.d);
  return `${p.mo}/${p.d} ${WEEKDAY_KO[date.getDay()]}`;
}

/** 변경안 작업 종류 → 문구. */
export const CHANGE_OP_LABEL = Object.freeze({
  LINK: '자료 연결',
  ADD: '새 항목',
  RENAME: '이름 보완',
  MOVE: '위치 이동',
  MERGE: '병합',
  SPLIT: '분할',
});

/**
 * 변경안 한 줄 요약. "기존 내용에 자료 3곳 연결 · 새 항목 2개 제안". 이동·병합·분할은 기본 요약에서도
 * 드러낸다 — 작은 연결과 큰 재구성을 같은 무게로 숨기지 않는다.
 */
export function summarizeChangeProposal(summary) {
  if (!summary) return '변경할 내용이 없어요';
  const parts = [];
  if (summary.link) parts.push(`기존 내용에 자료 ${summary.link}곳 연결`);
  if (summary.add) parts.push(`새 항목 ${summary.add}개 제안`);
  if (summary.rename) parts.push(`이름 보완 ${summary.rename}개`);
  if (summary.move) parts.push(`위치 이동 ${summary.move}개`);
  if (summary.merge) parts.push(`병합 ${summary.merge}건`);
  if (summary.split) parts.push(`분할 ${summary.split}건`);
  return parts.length > 0 ? parts.join(' · ') : '변경할 내용이 없어요';
}

/**
 * 작업 하나를 사람이 읽는 한 줄로. topicTitles는 id → 제목, sectionsById는 id → SectionBrief.
 * 서버 enum과 id를 그대로 보여주지 않는다.
 */
export function describeChangeOp(op, topicTitles = {}, sectionsById = {}) {
  const title = (id) => topicTitles[id] ?? `항목 #${id}`;
  const sections = (ids) => (ids ?? []).map((id) => {
    const s = sectionsById[id];
    return s ? `${s.title}${s.locator ? ` (${s.locator})` : ''}` : `구간 #${id}`;
  });
  switch (op?.op) {
    case 'LINK':
      return `「${title(op.topicId)}」에 ${sections(op.sectionIds).join(', ')} 연결`;
    case 'ADD': {
      const parent = op.parentTopicId != null ? `「${title(op.parentTopicId)}」 아래에 ` : op.parentTempId ? '새 항목 아래에 ' : '';
      const sec = sections(op.sectionIds);
      return `${parent}새 항목 「${op.title}」${sec.length ? ` — ${sec.join(', ')}` : ''}`;
    }
    case 'RENAME':
      return `「${title(op.topicId)}」 → 「${op.title}」${op.reason ? ` · ${op.reason}` : ''}`;
    case 'MOVE':
      return `「${title(op.topicId)}」을(를) ${op.parentTopicId != null ? `「${title(op.parentTopicId)}」 아래로` : '맨 위로'} 이동${op.reason ? ` · ${op.reason}` : ''}`;
    case 'MERGE':
      return `「${(op.absorbedTopicIds ?? []).map(title).join('」, 「')}」을(를) 「${title(op.survivingTopicId)}」에 합침${op.reason ? ` · ${op.reason}` : ''}`;
    case 'SPLIT':
      return `「${title(op.topicId)}」을(를) ${(op.children ?? []).map((c) => `「${c.title}」`).join(', ')}로 나눔${op.reason ? ` · ${op.reason}` : ''}`;
    default:
      return '알 수 없는 변경';
  }
}

/** 큰 변경(이동·병합·분할)인가. 기본 요약에서 접지 않는다. */
export function isStructuralOp(op) {
  return op?.op === 'MOVE' || op?.op === 'MERGE' || op?.op === 'SPLIT';
}
