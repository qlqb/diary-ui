import { describe, it, expect } from 'vitest';
import { endAtOf } from './useProposalDraft.js';

/** 자정에 끝나는 칸(23:00~24:00)과 자정 이후 칸(다음 날 00:00~01:00)의 왕복: 끝 날짜를 잃지 않는다. */
describe('endAtOf', () => {
  it('24:00·00:00 끝은 다음 날 00:00이다', () => {
    expect(endAtOf('2026-10-25', '24:00')).toBe('2026-10-26T00:00:00');
    expect(endAtOf('2026-10-25', '00:00')).toBe('2026-10-26T00:00:00');
    expect(endAtOf('2026-12-31', '24:00')).toBe('2027-01-01T00:00:00');
  });

  it('그 밖의 끝은 같은 날이다', () => {
    expect(endAtOf('2026-10-26', '01:00')).toBe('2026-10-26T01:00:00');
    expect(endAtOf('2026-10-25', '20:00')).toBe('2026-10-25T20:00:00');
  });
});
