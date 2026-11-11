import { describe, it, expect } from 'vitest';
import {
  analysisStateLabel, describeChangeOp, describeDueEstimate, dueWithin, formatAssignmentDue, isOverdue,
  summarizeChangeProposal, isStructuralOp,
} from './analysisLabels.js';

describe('과제 마감 문구', () => {
  it('날짜 마감은 원래 날짜로 보여준다 — 다음날 00:00 경계로 바꾸지 않는다', () => {
    expect(formatAssignmentDue({ dueKind: 'DATE', dueDate: '2026-09-18' }, '2026-09-13')).toBe('9월 18일까지');
  });

  it('시각 마감은 시각까지, 연도가 다르면 연도를 붙인다', () => {
    const text = formatAssignmentDue({ dueKind: 'DATETIME', dueAt: '2027-01-05T23:59:00' }, '2026-09-13');
    expect(text).toContain('2027년 1월 5일');
    expect(text).toContain('23:59까지');
  });

  it('마감 없음과 마감 미확인은 다른 말이다', () => {
    expect(formatAssignmentDue({ dueKind: 'NONE' })).toBe('마감 없음');
    expect(formatAssignmentDue({ dueKind: 'UNKNOWN' })).toBe('마감 미확인');
  });

  it('지난 마감은 완료된 과제에서는 지난 것으로 보지 않는다', () => {
    expect(isOverdue({ dueKind: 'DATE', dueDate: '2026-09-01', completed: false }, '2026-09-13')).toBe(true);
    expect(isOverdue({ dueKind: 'DATE', dueDate: '2026-09-01', completed: true }, '2026-09-13')).toBe(false);
    expect(isOverdue({ dueKind: 'NONE', completed: false }, '2026-09-13')).toBe(false);
  });

  it('범위 안 마감만 고른다(오늘 화면의 7일 창)', () => {
    expect(dueWithin({ dueKind: 'DATE', dueDate: '2026-09-15' }, '2026-09-13', '2026-09-20')).toBe(true);
    expect(dueWithin({ dueKind: 'DATETIME', dueAt: '2026-09-25T10:00:00' }, '2026-09-13', '2026-09-20')).toBe(false);
    expect(dueWithin({ dueKind: 'UNKNOWN' }, '2026-09-13', '2026-09-20')).toBe(false);
  });

  it('추정 후보는 "추정"이라고 말하고 연도가 없으면 연도 미확인이라고 말한다', () => {
    expect(describeDueEstimate({ text: '다음 수업까지', isoDate: '2026-09-16', basis: '수업 일정' }))
      .toContain('추정');
    expect(describeDueEstimate({ text: '9월 18일까지', monthDay: '09-18' })).toContain('연도 미확인');
  });
});

describe('분석 상태 칩', () => {
  it('모르는 상태도 enum 원문이 아니라 문구로 나온다', () => {
    expect(analysisStateLabel('RUNNING').label).toBe('분석 중');
    expect(analysisStateLabel('PARTIAL').label).toBe('일부 완료');
    expect(analysisStateLabel('WHATEVER').label).toBe('상태 확인 중');
  });
});

describe('변경안 요약', () => {
  it('연결과 새 항목은 개수로, 이동·병합·분할은 요약에 드러난다', () => {
    expect(summarizeChangeProposal({ link: 3, add: 2, rename: 0, move: 0, merge: 0, split: 0 }))
      .toBe('기존 내용에 자료 3곳 연결 · 새 항목 2개 제안');
    expect(summarizeChangeProposal({ link: 0, add: 0, rename: 1, move: 1, merge: 1, split: 0 }))
      .toContain('병합 1건');
    expect(summarizeChangeProposal(null)).toBe('변경할 내용이 없어요');
  });

  it('작업 한 줄은 id가 아니라 제목으로 말한다', () => {
    const titles = { 1: '연결 리스트', 2: '스택' };
    const sections = { 10: { title: '연습문제 2', locator: 'p.12' } };
    expect(describeChangeOp({ op: 'LINK', topicId: 1, sectionIds: [10] }, titles, sections))
      .toBe('「연결 리스트」에 연습문제 2 (p.12) 연결');
    expect(describeChangeOp({ op: 'MERGE', survivingTopicId: 1, absorbedTopicIds: [2], reason: '중복' }, titles, sections))
      .toContain('「스택」을(를) 「연결 리스트」에 합침');
    expect(describeChangeOp({ op: 'MOVE', topicId: 2, parentTopicId: null }, titles, sections)).toContain('맨 위로 이동');
    expect(isStructuralOp({ op: 'MOVE' })).toBe(true);
    expect(isStructuralOp({ op: 'LINK' })).toBe(false);
  });
});
