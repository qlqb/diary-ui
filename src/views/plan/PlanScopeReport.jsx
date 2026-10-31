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

/** 확인된 쓸 수 있는 시간을 한 줄로. 예: "~16:00", "20:00~24:00", "하루 60분". */
export function studyTimeLabel(time) {
  if (!time) return null;
  const parts = [];
  if (time.minutes != null) parts.push(`${time.perDay ? '하루 ' : '전체 '}${time.minutes}분`);
  if (time.from || time.until) parts.push(`${time.from ?? ''}~${time.until ?? ''}`);
  return parts.join(' · ');
}

const hhmm = (t) => (t ? String(t).slice(0, 5) : '');

/** 해석한 구간 하나. 자정을 넘으면 그렇게 말한다("22:00~다음 날 01:00", "~24:00"). */
export function rangeLabel(range) {
  if (!range) return '';
  const end = range.end == null ? '24:00'
    : range.endsNextDay ? (hhmm(range.end) === '00:00' ? '24:00' : `다음 날 ${hhmm(range.end)}`) : hhmm(range.end);
  return `${hhmm(range.start)}~${end}`;
}

const ISSUE_TEXT = {
  NOT_FOUND: '말한 문장에서 이 구절을 찾지 못했어요',
  VALUE_MISMATCH: '정리한 시각이 말한 문장과 달라요',
  UNREADABLE: '시간대를 읽지 못했어요',
  AMBIGUOUS_UNIT: '하루 몫인지 전체 몫인지 확인이 필요해요',
  LATER_TIME_UNUSED: '나중에 말한 시간 표현은 반영하지 않았어요',
};

/**
 * 이번 초안이 쓴 말한 시간(범위·제외·분량)과 그 계산. 확인하지 못한 시간도 숨기지 않는다 — 말한 시간이 아무 설명 없이 기본 시간으로
 * 바뀌는 일이 없게. 범위(가능한 시간)와 실제 공부량을 따로 보인다.
 */
export function StudyTimeCondition({ condition, budget }) {
  if (!condition) return null;
  const adopted = condition.status === 'ADOPTED';
  const ambiguous = condition.status === 'AMBIGUOUS';
  const windows = condition.windows ?? [];
  const exclusions = condition.exclusions ?? [];
  return (
    <div className="plan-scope-time" aria-label="말한 시간">
      <p>
        <span className="chip-status">{adopted ? '말한 시간' : ambiguous ? '말한 시간 · 확인 필요' : '말한 시간 · 확인 못 함'}</span>
        {' '}
        {windows.length > 0 && <strong>{windows.map(rangeLabel).join(', ')}</strong>}
        {exclusions.length > 0 && (
          <span> · 제외 {exclusions.map((x) => `${x.label ? `${x.label} ` : ''}${rangeLabel(x)}`).join(', ')}</span>
        )}
        {condition.minutes != null && <span> · {condition.per === 'PLAN' ? '총' : '하루'} {condition.minutes}분</span>}
      </p>
      {!adopted && !ambiguous && (
        <p className="hint plan-scope-issue-line">말한 시간을 확인하지 못해 기본 시간으로 계산했어요. 다시 말해 주시면 그 시간으로 만들게요.</p>
      )}
      {budget && (adopted || ambiguous) && (
        <p className="view-dim">
          {budget.requestedMinutes != null && `요청 ${budget.requestedMinutes}분 · `}
          들어갈 수 있는 시간 {budget.capacityMinutes}분 · 이번 목표 {budget.targetMinutes}분
          {budget.breakReserveMinutes > 0 && ` · 휴식 여유 ${budget.breakReserveMinutes}분을 남겼어요`}
          {budget.placedMinutes != null && ` · 실제 배치 ${budget.placedMinutes}분`}
        </p>
      )}
      {budget?.shortfallMinutes > 0 && (
        <p className="hint plan-scope-issue-line">요청한 시간 중 {budget.shortfallMinutes}분은 들어갈 자리가 없어요.</p>
      )}
      {(budget?.conflicts ?? []).length > 0 && (
        <p className="hint">말한 시간과 겹친 일정: {budget.conflicts.join(', ')}</p>
      )}
      {(condition.notes ?? []).map((note) => <p key={note} className="view-dim">{note}</p>)}
      {(condition.issues ?? []).map((issue) => (
        <p key={`${issue.code}-${issue.quote}`} className="hint">
          {ISSUE_TEXT[issue.code] ?? issue.detail}
          {issue.quote && <span className="view-dim"> · &ldquo;{issue.quote}&rdquo;</span>}
        </p>
      ))}
    </div>
  );
}

function roleLabel(scope) {
  if (!scope.verified) return '확인 필요';
  return scope.role === 'OPTIONAL' ? '가능하면' : '꼭';
}

export default function PlanScopeReport({ report }) {
  // 범위도 시간도 말하지 않았으면 그리지 않는다. 범위를 판정하지 못했으면(추출 실패 등) 서버 문장만이라도 보인다.
  const scopes = report?.scopes ?? [];
  if (!report || (!scopes.length && !report.notice && !report.studyTime && !report.timeCondition)) return null;
  const states = new Map((report.parts ?? []).map((p) => [p.partId, p]));
  const failedCheck = (report.issues ?? []).length > 0;

  return (
    <section className="plan-scope-report" aria-label="말한 범위">
      <p className="plan-scope-head">
        <span className="plan-strategy-label">말한 범위</span>
        {failedCheck && <span className="chip-status plan-scope-issue">검증 미통과</span>}
      </p>
      {report.notice && <p className="plan-scope-notice">{report.notice}</p>}
      <StudyTimeCondition condition={report.timeCondition} budget={report.timeBudget} />
      {!report.timeCondition && report.studyTime && (
        <p className="plan-scope-time">
          <span className="chip-status">말한 시간</span>
          {' '}
          <strong>{studyTimeLabel(report.studyTime)}</strong>
          {report.studyTime.quote && <span className="view-dim"> · &ldquo;{report.studyTime.quote}&rdquo;</span>}
        </p>
      )}
      {failedCheck && (
        <p className="hint plan-scope-issue-line">
          꼭 하기로 한 범위가 남았는데 &apos;가능하면&apos; 범위가 들어갔고, 계획이 그 이유를 남기지 않았어요.
        </p>
      )}
      <ul className="plan-scope-list">
        {scopes.map((scope) => (
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
