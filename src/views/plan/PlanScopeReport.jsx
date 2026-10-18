/**
 * "말한 범위" — 사용자가 이번 요청에서 말한 범위가 초안에 어떻게 담겼는지 서버 판정 그대로 보인다(2026-10-18).
 *
 * 완료 표시는 모델의 목표 문장이 아니라 서버 판정(scopeReport.notice/completion)으로 정한다. 부분마다 두 가지를 따로 말한다:
 * 계획에 담겼는가(반영)와 원문을 읽었는가(확보). "앱에 자료 없음"과 "확인 필요"도 숨기지 않는다. 상태는 글자로 말하고
 * 색만으로 구분하지 않는다.
 */

import '../../styles/learning-flow.css';

const REFLECTION_LABEL = {
  ITEM: '계획에 담음',
  PRACTICE_WITH_USER_MATERIAL: '가진 자료로 연습',
  DEFERRED: '미룸',
  ALREADY_PREPARED: '이미 준비됨',
  UNHANDLED: '계획에 없음',
};

const ACQUISITION_LABEL = {
  DELIVERED_UNIT: '원문 읽음',
  EXCERPT_ONLY: '원문 일부만 읽음',
  SHOWN_NOT_SELECTED: '자료를 고르지 않음',
  AVAILABLE_NOT_ACQUIRED: '원문 못 읽음',
  NO_MATERIAL_IN_APP: '앱에 자료 없음',
};

const SATISFIED = new Set(['ITEM', 'PRACTICE_WITH_USER_MATERIAL', 'ALREADY_PREPARED']);

function roleLabel(scope) {
  if (!scope.verified) return '확인 필요';
  return scope.role === 'OPTIONAL' ? '가능하면' : '꼭';
}

export default function PlanScopeReport({ report }) {
  // 범위를 말하지 않았으면 그리지 않는다. 범위를 판정하지 못했으면(추출 실패 등) 서버 문장만이라도 보인다.
  if (!report || (!(report.scopes ?? []).length && !report.notice)) return null;
  const states = new Map((report.parts ?? []).map((p) => [p.partId, p]));
  const failedCheck = (report.issues ?? []).length > 0;

  return (
    <section className="plan-scope-report" aria-label="말한 범위">
      <p className="plan-scope-head">
        <span className="plan-strategy-label">말한 범위</span>
        {failedCheck && <span className="chip-status plan-scope-issue">검증 미통과</span>}
      </p>
      {report.notice && <p className="plan-scope-notice">{report.notice}</p>}
      {failedCheck && (
        <p className="hint plan-scope-issue-line">
          꼭 하기로 한 범위가 남았는데 &apos;가능하면&apos; 범위가 들어갔고, 계획이 그 이유를 남기지 않았어요.
        </p>
      )}
      <ul className="plan-scope-list">
        {report.scopes.map((scope) => (
          <li key={scope.scopeId} className="plan-scope-item">
            <p className="plan-scope-title">
              <span className="chip-status">{roleLabel(scope)}</span>
              {' '}
              <strong>{scope.courseTitle ?? '과목 미확정'}</strong>
              {scope.boundary ? ` · ${scope.boundary}` : ''}
            </p>
            {scope.goal && <p className="plan-scope-goal">목표: {scope.goal}</p>}
            {!scope.verified && (
              <p className="hint">원문에서 이 범위의 근거를 찾지 못했어요. 맞는 범위인지 확인해 주세요.</p>
            )}
            <ul className="plan-scope-parts">
              {(scope.parts ?? []).map((part) => {
                const state = states.get(part.partId);
                const reflection = state?.reflection ?? 'UNHANDLED';
                return (
                  <li key={part.partId} className={`plan-scope-part${SATISFIED.has(reflection) ? ' is-done' : ''}`}>
                    <span className="plan-scope-part-label">{part.label}</span>
                    {' — '}
                    <span>{REFLECTION_LABEL[reflection] ?? reflection}</span>
                    {state?.acquisition && <span className="view-dim"> · {ACQUISITION_LABEL[state.acquisition] ?? state.acquisition}</span>}
                    {state?.note && <span className="view-dim"> · {state.note}</span>}
                    {state?.acquisitionNote && <span className="view-dim"> · {state.acquisitionNote}</span>}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
