/**
 * 일주일 계획을 만들었는데 오늘 탭에 머무는 문제를 고정한다.
 *
 * UNSCHEDULED 후보의 targetDate는 서버가 넣어 둔 임시값(요청 기간 시작일)이고 적용 시점에
 * 지워진다. 그걸 진짜 날짜로 읽으면 "오늘만 있는 계획"으로 판정된다.
 */

import { describe, it, expect } from 'vitest';
import { tabForProposal } from './proposalTab.js';

const TODAY = '2026-09-02';

const item = (placementType, targetDate) => ({ placementType, targetDate });

describe('tabForProposal', () => {
  it('UNSCHEDULED의 임시 targetDate가 오늘이어도 일정 탭으로 간다', () => {
    // 실제로 있었던 값이다 — 5건 전부 UNSCHEDULED인데 targetDate가 오늘이었다.
    const items = Array.from({ length: 5 }, () => item('UNSCHEDULED', TODAY));

    expect(tabForProposal(items, TODAY)).toBe('schedule');
  });

  it('오늘 하루짜리 계획은 오늘 탭에 남는다', () => {
    expect(tabForProposal([item('DATE_ONLY', TODAY), item('TIME_FIXED', TODAY)], TODAY))
      .toBe('today');
  });

  it('날짜가 여럿이면 일정 탭으로 간다', () => {
    expect(tabForProposal([item('DATE_ONLY', TODAY), item('DATE_ONLY', '2026-09-04')], TODAY))
      .toBe('schedule');
  });

  it('오늘이 아닌 하루짜리 계획도 일정 탭으로 간다', () => {
    expect(tabForProposal([item('DATE_ONLY', '2026-09-04')], TODAY)).toBe('schedule');
  });

  it('UNSCHEDULED가 섞여 있으면 나머지가 오늘이어도 일정 탭이다', () => {
    expect(tabForProposal([item('DATE_ONLY', TODAY), item('UNSCHEDULED', TODAY)], TODAY))
      .toBe('schedule');
  });

  it('항목이 없으면 일정 탭으로 둔다', () => {
    expect(tabForProposal([], TODAY)).toBe('schedule');
    expect(tabForProposal(null, TODAY)).toBe('schedule');
  });
});
