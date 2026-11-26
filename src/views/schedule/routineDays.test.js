/**
 * 요일 표기는 화면 여러 곳에서 쓰이고, 순서가 갈리면(목록은 월요일 시작, 폼은 일요일 시작)
 * 같은 루틴이 다르게 보인다. 정렬과 변환을 고정한다.
 */

import { describe, it, expect } from 'vitest';
import { formatDays, dayOfWeekOf, WEEKDAYS } from './routineDays.js';

describe('formatDays', () => {
  it('서버가 준 순서와 무관하게 월요일부터 정렬한다', () => {
    expect(formatDays(['THURSDAY', 'MONDAY'])).toBe('월·목');
    expect(formatDays(['SUNDAY', 'WEDNESDAY', 'MONDAY'])).toBe('월·수·일');
  });

  it('비어 있으면 빈 문자열이다', () => {
    expect(formatDays([])).toBe('');
    expect(formatDays(undefined)).toBe('');
  });
});

describe('dayOfWeekOf', () => {
  it('날짜를 서버 표기의 요일로 바꾼다', () => {
    // 2026-09-24는 목요일, 2026-09-27은 일요일.
    expect(dayOfWeekOf('2026-09-24')).toBe('THURSDAY');
    expect(dayOfWeekOf('2026-09-27')).toBe('SUNDAY');
  });

  /*
   * getDay()는 0=일요일인데 WEEKDAYS는 월요일부터다. 이 어긋남을 잘못 보정하면 일요일이
   * 토요일로 밀려도 대부분의 요일은 맞아서 눈에 띄지 않는다.
   */
  it('일요일이 배열 마지막에 맞는다', () => {
    expect(WEEKDAYS[6].value).toBe('SUNDAY');
    expect(dayOfWeekOf('2026-08-31')).toBe('MONDAY');
  });
});
