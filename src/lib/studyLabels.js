/**
 * 학습 기억(프로젝트 사실 카드)·계획 목표의 화면 문구. 서버 enum 원문을 화면에 내보내지 않는다.
 *
 * ★ 수업 진도(수업에서 나간 곳)와 막힘·해결(내 이해)은 다른 사실이다 — 묶음도 따로 둔다.
 * ★ 출처 문구는 서버가 붙인 sourceLabel을 그대로 쓴다(사용자가 말함·사용자가 고침·자기평가·AI 추정 — 확인 전).
 */

export const FACT_KIND_LABEL = Object.freeze({
  PROGRESS: '수업 진도',
  EXAM_SCOPE: '시험 범위',
  DIFFICULTY: '막힌 곳',
  RESOLVED: '해결한 것',
  GOAL: '목표',
  PREFERENCE: '선호',
  CONSTRAINT: '제약',
  OTHER: '그 밖',
});

/** 사실 카드의 묶음. 목표·선호·제약·그 밖은 "그 밖"으로 모은다. */
export const FACT_GROUPS = Object.freeze([
  { key: 'PROGRESS', title: '수업 진도', kinds: ['PROGRESS'], desc: '수업에서 어디까지 나갔는지예요. 내가 이해했다는 뜻은 아니에요.' },
  { key: 'EXAM_SCOPE', title: '시험 범위', kinds: ['EXAM_SCOPE'] },
  { key: 'DIFFICULTY', title: '막힌 곳', kinds: ['DIFFICULTY'] },
  { key: 'RESOLVED', title: '해결한 것', kinds: ['RESOLVED'], desc: '최근 30일 안에 풀었다고 말한 것이에요.' },
  { key: 'OTHER', title: '그 밖', kinds: ['GOAL', 'PREFERENCE', 'CONSTRAINT', 'OTHER'] },
]);

export const HELP_LEVEL_LABEL = Object.freeze({
  SOLO: '혼자 해결',
  GUIDED: '도움받아 해결',
});

/** 계획 항목의 학습 목표 근거(서버 판정). */
export const GOAL_BASIS_LABEL = Object.freeze({
  TOC_AI: '목차에서 추론',
  MATERIAL_AI: '자료 기반 AI 목표',
  USER: '내가 정한 목표',
});

export const GOAL_BASIS_TITLE = Object.freeze({
  TOC_AI: '단원 제목만 보고 추론했어요. 그 단원 사진·본문을 올리면 바로잡을 수 있어요.',
  MATERIAL_AI: '올린 자료를 읽고 AI가 정한 목표예요.',
  USER: '상담에서 내가 정한 목표를 그대로 옮겼어요.',
});

/** 단원 칩 글: "Unit 3 I have to …" (+ 목차 순번). 제목이 같은 단원을 순번으로 가른다. */
export function topicChipText(fact) {
  if (!fact?.topicId) return null;
  const title = fact.topicTitle ?? '학습 항목';
  return fact.topicTocSeq ? `${title} · 목차 ${fact.topicTocSeq}번째` : title;
}

/** 상담 사진의 단원 칩 글자("Unit 3 … · 목차 3번째"). 사진 응답의 topic({ topicId, title, sourceTocSeq })을 받는다. */
export function photoTopicText(topic) {
  if (!topic) return null;
  return topicChipText({ topicId: topic.topicId, topicTitle: topic.title, topicTocSeq: topic.sourceTocSeq });
}

/** "10월 5일" */
export function formatSaidDay(value) {
  if (!value) return null;
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[2])}월 ${Number(m[3])}일` : null;
}
