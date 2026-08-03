/**
 * 계획 탭.
 *
 * 책임: 새 계획 초안과 활성 계획의 구조 변경안을 만들고 검토한다.
 * 핵심 질문: 무엇을 새로 만들고 기존 계획 구조를 어떻게 바꿀까?
 *
 * 계획 상세는 현재 적용된 구조를 보여주되,
 * 목표·기간·단계·범위를 바꾸는 행동은 별도 변경안 초안으로 열어 검토한다.
 * 적용 전까지는 실행 탭에 나타나지 않는다.
 */

import { useState } from 'react';
import { ViewHeader, SubTabs, EmptyState } from './shared.jsx';
import { MOCK_PLANS } from '../mock/executionMock.js';
import { PlanStatus, PLAN_STATUS_LABEL } from '../types/plan.js';

const SUB_TABS = [
  { key: 'plans', label: '계획 목록' },
  { key: 'subjects', label: '자료·과목' },
];

export default function PlanView({ onOpenPlan }) {
  const [sub, setSub] = useState('plans');

  const drafts = MOCK_PLANS.filter((p) => p.status === PlanStatus.DRAFT);
  const actives = MOCK_PLANS.filter((p) => p.status === PlanStatus.ACTIVE);

  return (
    <div className="v6-view">
      <ViewHeader
        title="계획"
        question="무엇을 새로 만들고, 기존 계획 구조를 어떻게 바꿀까?"
      />
      <SubTabs tabs={SUB_TABS} active={sub} onChange={setSub} />

      {sub === 'plans' && (
        <>
          <section className="v6-section">
            <h2 className="v6-section-title">검토 중인 초안</h2>
            {drafts.length === 0 ? (
              <EmptyState
                title="검토 중인 초안이 없어요"
                desc="AI 패널에 상황을 설명하면 변경안 초안이 여기에 쌓여요."
              />
            ) : (
              <div className="v6-item-list">
                {drafts.map((p) => (
                  <PlanCard key={p.planId} plan={p} onOpen={onOpenPlan} />
                ))}
              </div>
            )}
          </section>

          <section className="v6-section">
            <h2 className="v6-section-title">진행 중인 계획</h2>
            <p className="v6-section-desc">
              구조를 바꾸려면 변경안으로 열어 적용 전후를 비교해요.
            </p>
            <div className="v6-item-list">
              {actives.map((p) => (
                <PlanCard key={p.planId} plan={p} onOpen={onOpenPlan} />
              ))}
            </div>
          </section>
        </>
      )}

      {sub === 'subjects' && (
        <EmptyState
          title="자료·과목은 다음 단계에서 연결해요"
          desc="과목과 강의계획서가 계획의 근거로 붙는 자리예요."
        />
      )}
    </div>
  );
}

function PlanCard({ plan, onOpen }) {
  return (
    <article className="v6-item-card">
      <div className="v6-item-main">
        <button
          type="button"
          className="v6-item-title-button"
          onClick={() => onOpen?.(plan)}
        >
          {plan.title}
        </button>
        <div className="v6-item-meta">
          <span className="v6-item-status">{PLAN_STATUS_LABEL[plan.status]}</span>
          {plan.startDate && (
            <span className="v6-item-placement">
              {plan.startDate} ~ {plan.endDate ?? ''}
            </span>
          )}
          {plan.purpose && <span className="v6-item-tag">{plan.purpose}</span>}
        </div>
      </div>
    </article>
  );
}
