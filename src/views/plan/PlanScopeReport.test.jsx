import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import PlanScopeReport from './PlanScopeReport.jsx';

/** 서버가 판정한 "말한 범위"를 글자로 보인다. 완료 표시는 서버 문장(notice)이 정한다. */
const REPORT = {
  status: 'EXTRACTED',
  completion: 'NOT_COMPLETE',
  requiredUnmet: true,
  notice: '꼭 하기로 한 범위 중 1곳이 아직 계획에 없어요: 빅데이터분석 판다스 실습(계획에 없음 · 자료를 고르지 않음).',
  issues: ['OPTIONAL_OVER_REQUIRED_WITHOUT_REASON'],
  needsConfirm: ['S3'],
  remaining: ['S1.P1'],
  scopes: [
    {
      scopeId: 'S1', courseTitle: '빅데이터분석', role: 'REQUIRED', verified: true, boundary: '붓꽃·타이타닉까지',
      goal: '시험 범위 학습',
      parts: [{ partId: 'S1.P1', label: '판다스 실습' }, { partId: 'S1.P2', label: '붓꽃·타이타닉' }],
    },
    {
      scopeId: 'S2', courseTitle: '스마트앱프로젝트', role: 'OPTIONAL', verified: true,
      parts: [{ partId: 'S2.P1', label: 'SQLite' }],
    },
    { scopeId: 'S3', courseTitle: '영어회화', role: 'REQUIRED', verified: false, parts: [{ partId: 'S3.P1', label: 'Unit 6까지' }] },
  ],
  parts: [
    { partId: 'S1.P1', scopeId: 'S1', reflection: 'UNHANDLED', acquisition: 'SHOWN_NOT_SELECTED' },
    { partId: 'S1.P2', scopeId: 'S1', reflection: 'ITEM', acquisition: 'DELIVERED_UNIT' },
    { partId: 'S2.P1', scopeId: 'S2', reflection: 'PRACTICE_WITH_USER_MATERIAL', acquisition: 'NO_MATERIAL_IN_APP',
      acquisitionNote: '사용자가 가진 자료로 한다고 했다(앱 자료와 연결하지 않음)' },
    { partId: 'S3.P1', scopeId: 'S3', reflection: 'UNHANDLED', acquisition: 'NO_MATERIAL_IN_APP' },
  ],
};

describe('PlanScopeReport', () => {
  it('서버 문장과 검증 미통과, 부분마다 반영·확보 상태를 글자로 보인다', () => {
    render(<PlanScopeReport report={REPORT} />);
    const panel = screen.getByRole('region', { name: '말한 범위' });
    expect(within(panel).getByText(REPORT.notice)).toBeInTheDocument();
    expect(within(panel).getByText('검증 미통과')).toBeInTheDocument();
    expect(within(panel).getByText('판다스 실습').closest('li')).toHaveTextContent('계획에 없음 · 자료를 고르지 않음');
    expect(within(panel).getByText('붓꽃·타이타닉').closest('li')).toHaveTextContent('계획에 담음 · 원문 읽음');
    expect(within(panel).getByText('SQLite').closest('li')).toHaveTextContent('가진 자료로 연습 · 앱에 자료 없음');
    // 근거를 확인하지 못한 범위는 "확인 필요"로, 숨기지 않는다.
    expect(within(panel).getByText('확인 필요')).toBeInTheDocument();
    expect(within(panel).getByText(/근거를 찾지 못했어요/)).toBeInTheDocument();
  });

  it('범위를 판정하지 못했으면 서버 문장만이라도 보인다', () => {
    render(<PlanScopeReport report={{ status: 'FAILED', scopes: [], parts: [],
      notice: '말한 범위를 읽지 못해 계획이 범위를 다 담았는지 판단하지 못했어요.' }} />);
    expect(screen.getByRole('region', { name: '말한 범위' })).toHaveTextContent('판단하지 못했어요');
  });

  it('범위가 없으면 아무것도 그리지 않는다', () => {
    const { container } = render(<PlanScopeReport report={{ status: 'NONE', scopes: [], parts: [] }} />);
    expect(container).toBeEmptyDOMElement();
    const { container: none } = render(<PlanScopeReport report={null} />);
    expect(none).toBeEmptyDOMElement();
  });
});
