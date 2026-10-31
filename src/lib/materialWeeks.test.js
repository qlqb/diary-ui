import { describe, it, expect } from 'vitest';
import {
  CardState, bulkItems, buildBoard, cardStatusText, currentSlotKey, materialWeekChip, moveRequest, slotRequest,
} from './materialWeeks.js';

const suggestion = (placement, week, confidence, extra = {}) => ({
  placement, week, confidence, bulkApplicable: confidence === 'HIGH' || confidence === 'MEDIUM',
  options: placement ? [{ placement, week }] : [], evidence: [], ...extra,
});

const item = (materialId, filename, { assignment = null, s = null, differs = false } = {}) => ({
  materialId, filename, materialType: 'PROFESSOR_SLIDE', analysisState: 'DONE',
  assignment, suggestion: s, suggestionDiffers: differs,
});

/** 네트워크프로그래밍 모양: 확인 전 추천 넷 + 약한 추천(스크립트) + 충돌 하나. */
const review = {
  courseId: 7, weekCount: 15, needsReview: 6,
  items: [
    item(1, '01.수업소개_네트워크프로그래밍.pdf', { s: suggestion('WEEK', 1, 'MEDIUM') }),
    item(2, '2.리눅스_개요와_실습환경_구축.pdf', { s: suggestion('WEEK', 2, 'MEDIUM') }),
    item(3, '3.AWS_구성하기_SSH실습.pdf', { s: suggestion('WEEK', 3, 'HIGH') }),
    item(4, '네트워크프로그래밍.pdf', { s: suggestion('COURSE_WIDE', null, 'HIGH') }),
    item(5, 'MySQL실습스크립트.sh', { s: suggestion('WEEK', 3, 'LOW') }),
    item(6, '2주차_AWS.pdf', {
      s: { placement: null, week: null, confidence: 'CONFLICT', bulkApplicable: false,
        options: [{ placement: 'WEEK', week: 2 }, { placement: 'WEEK', week: 3 }], evidence: [] },
    }),
  ],
};

const group = (board, key) => board.find((g) => g.key === key);
const names = (g) => g.cards.map((c) => c.item.filename);

describe('보드 배치', () => {
  it('확인 전 HIGH·MEDIUM 추천은 그 주차 칸에 "AI 추천"으로, 약한 추천·충돌은 미분류에 둔다', () => {
    const board = buildBoard(review);

    expect(board[0].key).toBe('none');
    expect(board.at(-1).key).toBe('course');
    expect(board.filter((g) => g.week != null)).toHaveLength(15);
    expect(names(group(board, 'w1'))).toEqual(['01.수업소개_네트워크프로그래밍.pdf']);
    expect(names(group(board, 'w3'))).toEqual(['3.AWS_구성하기_SSH실습.pdf']);
    expect(names(group(board, 'course'))).toEqual(['네트워크프로그래밍.pdf']);
    expect(names(group(board, 'none'))).toEqual(['MySQL실습스크립트.sh', '2주차_AWS.pdf']);
    expect(group(board, 'w3').cards[0].state).toBe(CardState.SUGGESTED);
  });

  it('상태 문구는 추천·확인됨·직접 지정·확인 필요를 글자로 가른다', () => {
    const board = buildBoard({
      ...review,
      items: [
        ...review.items,
        item(7, 'a.pdf', { assignment: { placement: 'WEEK', weeks: [3], source: 'SUGGESTION' } }),
        item(8, 'b.pdf', { assignment: { placement: 'WEEK', weeks: [2], source: 'USER' } }),
        item(9, 'c.pdf', { assignment: { placement: 'UNASSIGNED', weeks: [], source: 'USER' } }),
      ],
    });
    const text = (id) => cardStatusText(board.flatMap((g) => g.cards).find((c) => c.item.materialId === id));

    expect(text(3)).toBe('3주차 · AI 추천');
    expect(text(7)).toBe('3주차 · 확인됨');
    expect(text(8)).toBe('2주차 · 직접 지정');
    expect(text(9)).toBe('주차 없음 · 확인됨');
    expect(text(5)).toBe('약한 추천: 3주차');
    expect(text(6)).toBe('확인 필요: 2주차 또는 3주차');
    expect(text(4)).toBe('전체 참고자료 · AI 추천');
  });

  it('여러 주차에 놓인 자료는 각 주차 칸에 카드가 하나씩 있다', () => {
    const board = buildBoard({ weekCount: 15, items: [item(1, '총정리.pdf', {
      assignment: { placement: 'WEEK', weeks: [1, 2, 3, 4], source: 'USER' } })] });

    expect(['w1', 'w2', 'w3', 'w4'].map((k) => names(group(board, k)))).toEqual([['총정리.pdf'], ['총정리.pdf'],
      ['총정리.pdf'], ['총정리.pdf']]);
  });

  it('보드보다 뒤 주차가 와도 숨기지 않고 칸을 만든다', () => {
    const board = buildBoard({ weekCount: 15, items: [item(1, 'x.pdf', {
      assignment: { placement: 'WEEK', weeks: [18], source: 'USER' } })] });

    expect(names(group(board, 'w18'))).toEqual(['x.pdf']);
  });
});

describe('추천대로 적용', () => {
  it('확인 전이고 HIGH·MEDIUM인 것만, 화면에 보인 추천 그대로 싣는다', () => {
    expect(bulkItems(review)).toEqual([
      { materialId: 1, placement: 'WEEK', week: 1 },
      { materialId: 2, placement: 'WEEK', week: 2 },
      { materialId: 3, placement: 'WEEK', week: 3 },
      { materialId: 4, placement: 'COURSE_WIDE', week: null },
    ]);
  });

  it('이미 확인한 자료는 다시 싣지 않는다', () => {
    const done = { items: [item(3, 'a.pdf', { assignment: { placement: 'WEEK', weeks: [3], source: 'USER' },
      s: suggestion('WEEK', 4, 'HIGH') })] };
    expect(bulkItems(done)).toEqual([]);
  });
});

describe('옮기기', () => {
  const cardOf = (board, id) => board.flatMap((g) => g.cards).find((c) => c.item.materialId === id);

  it('추천 카드를 제자리에서 확인하면 추천 확인이다', () => {
    const board = buildBoard(review);
    expect(moveRequest(cardOf(board, 3), 'w3')).toEqual({ placement: 'WEEK', weeks: [3], source: 'SUGGESTION' });
  });

  it('추천 카드를 다른 주차로 옮기면 직접 지정이다', () => {
    const board = buildBoard(review);
    expect(moveRequest(cardOf(board, 3), 'w2')).toEqual({ placement: 'WEEK', weeks: [2], source: 'USER' });
  });

  it('미분류의 약한 추천을 그 추천 주차에 놓으면 추천 확인, 충돌은 후보 중 하나에 놓을 때 추천 확인이다', () => {
    const board = buildBoard(review);
    expect(moveRequest(cardOf(board, 5), 'w3').source).toBe('SUGGESTION');
    expect(moveRequest(cardOf(board, 6), 'w3').source).toBe('SUGGESTION');
    expect(moveRequest(cardOf(board, 6), 'w5').source).toBe('USER');
  });

  it('확정된 카드를 제자리에 놓으면 바뀌는 것이 없다', () => {
    const board = buildBoard({ weekCount: 15, items: [item(1, 'a.pdf', {
      assignment: { placement: 'WEEK', weeks: [3], source: 'USER' } })] });
    expect(moveRequest(cardOf(board, 1), 'w3')).toBeNull();
  });

  it('여러 주차 자료의 카드 하나를 옮기면 그 주차만 바뀐다', () => {
    const board = buildBoard({ weekCount: 15, items: [item(1, '총정리.pdf', {
      assignment: { placement: 'WEEK', weeks: [1, 2, 3], source: 'USER' } })] });
    const second = group(board, 'w2').cards[0];

    expect(moveRequest(second, 'w5')).toEqual({ placement: 'WEEK', weeks: [1, 3, 5], source: 'USER' });
  });

  it('전체 참고자료·미분류로 옮길 수 있다', () => {
    const board = buildBoard(review);
    expect(moveRequest(cardOf(board, 3), 'course')).toEqual({ placement: 'COURSE_WIDE', weeks: [], source: 'USER' });
    expect(moveRequest(cardOf(board, 3), 'none')).toEqual({ placement: 'UNASSIGNED', weeks: [], source: 'USER' });
  });
});

describe('자료 목록 한 줄', () => {
  it('확인 전에는 선택 상자가 비어 있고 추천은 칩에만 적힌다', () => {
    const pending = review.items[2];
    expect(currentSlotKey(pending)).toBe('');
    expect(materialWeekChip(pending)).toEqual({ text: '3주차 · AI 추천', tone: 'suggested' });
    expect(materialWeekChip(review.items[4])).toEqual({ text: '주차 확인 필요', tone: 'warn' });
  });

  it('확정 자리는 선택 상자와 칩 둘 다에 보인다', () => {
    const confirmed = item(1, 'a.pdf', { assignment: { placement: 'WEEK', weeks: [2, 3], source: 'SUGGESTION' } });
    expect(currentSlotKey(confirmed)).toBe('w2');
    expect(materialWeekChip(confirmed)).toEqual({ text: '2주차·3주차 · 확인됨', tone: 'ok' });
  });

  it('목록에서 추천 주차를 고르면 추천 확인, 다른 곳을 고르면 직접 지정이다', () => {
    expect(slotRequest(review.items[2], 'w3')).toEqual({ placement: 'WEEK', weeks: [3], source: 'SUGGESTION' });
    expect(slotRequest(review.items[2], 'w4')).toEqual({ placement: 'WEEK', weeks: [4], source: 'USER' });
    expect(slotRequest(review.items[3], 'course').source).toBe('SUGGESTION');
  });
});
