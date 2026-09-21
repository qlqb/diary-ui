/**
 * 정리안 화면의 문구와 선택 연동.
 *
 * 특히 고정하는 것: 부분 정리를 <숨기지 않는다>. 한도 때문에 일부만 보고 만든 정리안을
 * 전체를 반영한 것처럼 보여주면 사용자는 없는 근거를 믿는다.
 */
import { describe, it, expect } from 'vitest';
import {
  applyButtonLabel, collectDependents, dependentsOf, describeJob, describeReadiness,
  describeScope, partialNote, saveStateText,
} from './tidyLabels.js';

describe('범위 안내', () => {
  it('무엇을 보고 무엇을 뺐는지 말한다', () => {
    expect(describeScope({ reviewed: [1, 2, 3], excluded: [4] })).toBe('자료 3개 검토 · 1개 제외');
    expect(describeScope({ reviewed: [1], excluded: [] })).toBe('자료 1개 검토');
  });

  it('한도로 일부만 봤으면 몇 개를 못 봤는지까지 말한다', () => {
    expect(partialNote({ truncated: true, sectionsTotal: 40, sectionsReviewed: 10 }))
      .toContain('40개 중 10개만');
  });

  it('전부 봤으면 부분 정리라고 말하지 않는다', () => {
    expect(partialNote({ truncated: false, sectionsTotal: 10, sectionsReviewed: 10 })).toBeNull();
  });

  it('요청 전에는 무엇으로 정리하고 무엇이 빠지는지 말한다', () => {
    expect(describeReadiness({ readyMaterialCount: 5, analyzingMaterialCount: 2 }))
      .toBe('분석 완료 5개로 정리 · 분석 중 2개 제외');
    expect(describeReadiness({ readyMaterialCount: 0, analyzingMaterialCount: 2 }))
      .toContain('끝나면 정리할 수 있어요');
    expect(describeReadiness({ readyMaterialCount: 0, analyzingMaterialCount: 0 }))
      .toBe('이 프로젝트에 분석이 끝난 자료가 없어요');
  });
});

describe('작업 상태', () => {
  it('만드는 중과 실패를 다르게 말한다', () => {
    expect(describeJob({ status: 'RUNNING' }).tone).toBe('busy');
    expect(describeJob({ status: 'QUEUED' }).tone).toBe('busy');
    expect(describeJob({ status: 'FAILED' }).tone).toBe('problem');
    expect(describeJob({ status: 'DONE' })).toBeNull();
    expect(describeJob(null)).toBeNull();
  });
});

describe('선택 연동', () => {
  const dependsOn = { child: ['parent'], grandchild: ['child'] };

  it('서버의 "필요한 것"을 화면의 "함께 빠질 것"으로 뒤집는다', () => {
    expect(dependentsOf(dependsOn)).toEqual({ parent: ['child'], child: ['grandchild'] });
  });

  it('부모를 빼면 손자까지 함께 빠진다', () => {
    const dependents = dependentsOf(dependsOn);
    expect([...collectDependents('parent', dependents)]).toEqual(['child', 'grandchild']);
  });

  it('순환이 있어도 멈추지 않는다', () => {
    const dependents = { a: ['b'], b: ['a'] };
    expect([...collectDependents('a', dependents)].sort()).toEqual(['a', 'b']);
  });
});

describe('버튼과 저장 상태', () => {
  it('일부만 골랐으면 몇 개인지 말한다', () => {
    expect(applyButtonLabel(3, 3)).toBe('선택한 변경 적용');
    expect(applyButtonLabel(1, 3)).toBe('선택한 1개 적용');
    expect(applyButtonLabel(0, 3)).toBe('적용할 변경을 골라주세요');
  });

  it('저장 실패를 조용히 넘기지 않는다', () => {
    expect(saveStateText('saving')).toBe('저장 중…');
    expect(saveStateText('saved')).toBe('저장됨');
    expect(saveStateText('error')).toContain('저장하지 못했어요');
    expect(saveStateText('stale')).toContain('다른 곳에서 먼저 고쳤어요');
    expect(saveStateText(null)).toBeNull();
  });
});
