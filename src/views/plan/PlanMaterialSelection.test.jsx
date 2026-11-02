import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import PlanMaterialSelection from './PlanMaterialSelection';

const base = {
  status: 'SELECTED', mode: 'FOLDED_GROUPS', selectionCalls: 2, expanded: true, candidateTotal: 828, candidateShown: 171,
  sections: [{ sectionId: 1, materialId: 3, title: '동작 원리 개념 설명', locator: 'p.13', filename: '자료구조_강의자료.pdf',
    reason: '진행 중인 항목', outcome: 'FULL', retrievedRange: 'p.13 원문 전체(257자)' }],
  topics: [], insufficientEvidence: false, note: null, unknownIds: 0, requestedMaterials: [], ambiguities: [],
};

describe('PlanMaterialSelection 검토하지 않은 범위', () => {
  it('여러 프로젝트의 같은 주차 묶음은 프로젝트 이름으로 구분하고, 요약만 본 범위라고 말한다', async () => {
    render(<PlanMaterialSelection selection={{
      ...base,
      unreviewed: [
        { courseTitle: '자료구조', title: '3주차 핵심 알고리즘', topics: 6, sections: 10, summarized: true },
        { courseTitle: '네트워크프로그래밍', title: '3주차 핵심 알고리즘', topics: 6, sections: 10, summarized: true },
      ],
    }} />);
    await userEvent.click(screen.getByRole('button', { name: /AI가 이번 계획을 위해 고른 자료/ }));

    const hint = screen.getByText(/묶음 요약만 보고 안의 항목은 하나씩 보지 않은 범위/);
    expect(hint).toHaveTextContent('자료구조 · 3주차 핵심 알고리즘(구간 10)');
    expect(hint).toHaveTextContent('네트워크프로그래밍 · 3주차 핵심 알고리즘(구간 10)');
    expect(hint).toHaveTextContent('하나씩 검토하지 않았어요');
    expect(screen.getByText(/후보 828개 중 171개를 목록으로 보고 골랐어요/)).toBeInTheDocument();
  });

  it('한 프로젝트면 이름을 붙이지 않고, 과목 요약만 봤으면 목록으로도 보지 못했다고 말한다', async () => {
    render(<PlanMaterialSelection selection={{
      ...base, mode: 'FOLDED_COURSES',
      unreviewed: [{ courseTitle: '자료구조', title: '5주차 성능 분석', topics: 6, sections: 10, summarized: false }],
    }} />);
    await userEvent.click(screen.getByRole('button', { name: /AI가 이번 계획을 위해 고른 자료/ }));

    const hint = screen.getByText(/이번에 목록으로도 보지 못한 범위/);
    expect(hint).toHaveTextContent('5주차 성능 분석(구간 10)');
    expect(hint).not.toHaveTextContent('자료구조 ·');
  });
});
