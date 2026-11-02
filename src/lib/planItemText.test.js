import { describe, expect, it } from 'vitest';
import { actionOf, doneCriteriaOf, startSourceLine } from './planItemText.js';

describe('planItemText', () => {
  it('합쳐 저장된 설명에서 행동만 떼어 낸다', () => {
    expect(actionOf('예제 3-2를 따라 치고 조건만 바꿔 실행 · 완료: 출력이 교재와 같다', '출력이 교재와 같다'))
      .toBe('예제 3-2를 따라 치고 조건만 바꿔 실행');
  });
  it('설명이 완료 기준뿐이면 행동이 없다', () => {
    expect(actionOf('출력이 교재와 같다', '출력이 교재와 같다')).toBeNull();
    expect(actionOf(' · 완료: 출력이 같다', '출력이 같다')).toBeNull();
  });
  it('완료 꼬리가 없으면 설명 전체가 행동이다', () => {
    expect(actionOf('스택 push/pop을 손으로 추적', '표를 채운다')).toBe('스택 push/pop을 손으로 추적');
  });
  it('완료 기준이 따로 없으면 설명에서 읽는다', () => {
    expect(doneCriteriaOf('풀기 · 완료: 3문제 정답', null)).toBe('3문제 정답');
  });
  it('시작 자료는 파일이 바뀌었으면 그렇다고 말한다', () => {
    expect(startSourceLine({ filename: 'a.pdf', locator: 'p.3', state: 'AVAILABLE' })).toBe('a.pdf · p.3');
    expect(startSourceLine({ filename: 'a.pdf', locator: 'p.3', state: 'CHANGED' })).toMatch(/파일이 바뀌었어요/);
  });
});
