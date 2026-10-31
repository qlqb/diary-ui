/**
 * 초안의 첫 화면 요약. 계획 탭의 검토 화면과 상담 작업 공간이 같은 것을 본다(PlanDraftReview 맨 위).
 *
 * 스크롤하지 않아도 알아야 하는 것만 둔다:
 *   · 실제 제안량 — 항목 수와 예상 시간 합. 예산(상한)은 보조 정보다. 예산은 채워야 하는 양이 아니라서
 *     "얼마나 못 채웠는가"는 어디에도 적지 않는다.
 *   · 어느 프로젝트가 들어갔고 어느 것이 빠졌는가, 빠졌다면 왜인가. "검토하지 못함"과 "이번에는 뺌"은
 *     다른 사실이다 — 못 본 것을 덜 중요하게 본 것처럼 말하지 않는다.
 *   · 배치가 임시인가(가능한 시간을 가정했는가). 일정을 못 읽은 것은 또 다른 사실이라 따로 말한다.
 *   · 아직 열려 있는 핵심 질문 하나와 [답하기].
 *   · 이 초안이 최신 답변을 반영하기 전 버전인가, 다시 만들었다면 무엇이 달라졌는가.
 *
 * 상태는 색만으로 말하지 않는다. 모든 표시는 글자 라벨을 가진다.
 */

import { formatMinutes } from '../../lib/planTime.js';
import {
  AVAILABILITY_BASIS_NOTE, MATERIAL_STATE_LABEL, NEXT_ACTION_HINT, PROJECT_DISPOSITION_LABEL,
} from '../../lib/planLabels.js';

/** 다시 만든 초안으로 옮겨 온 편집 필드의 이름. 개발 용어를 그대로 보이지 않는다. */
const FIELD_LABEL = {
  title: '제목',
  expectedMinutes: '예상 시간',
  scheduledDate: '날짜',
  scheduledStartAt: '시작 시각',
  scheduledEndAt: '끝 시각',
  priority: '중요도',
  description: '설명',
  excluded: '뺀 항목',
};
const fieldLabel = (field) => FIELD_LABEL[field] ?? '직접 고친 값';

export default function PlanDraftOverview({
  draft, selectedCount, selectedMinutes, projectTitles = {},
  stale = false, staleReasons = [], regenerating = false, stageLabel = null, onRemake = null,
  outcome = null, conflictChoice = {}, onChooseConflict = null,
  scheduleLookupFailed = false, onRetrySchedule = null,
  onAnswerQuestion = null, onReview = null, onApply = null, applyDisabled = false, applyLabel = '적용',
  onContinueConsult = null,
}) {
  if (!draft) return null;

  const projects = draft.strategy?.projects ?? [];
  const included = projects.filter((p) => p.disposition === 'INCLUDED');
  const missing = projects.filter((p) => p.disposition !== 'INCLUDED');
  const titleOf = (p) => p.courseTitle ?? projectTitles[p.courseId] ?? '프로젝트';
  const basisNote = AVAILABILITY_BASIS_NOTE[draft.availabilityBasis] ?? null;
  const openQuestion = (draft.strategy?.openQuestions ?? [])[0] ?? null;
  const budget = draft.targetMinutes;
  const available = draft.estimatedAvailableMinutes;
  const changes = outcome?.changes ?? [];
  const carried = outcome?.carriedEdits ?? [];
  const conflicts = outcome?.editConflicts ?? [];

  return (
    <section className="plan-overview" aria-label="초안 요약">
      {(stale || regenerating) && (
        <div className="plan-overview-stale" role="status">
          <span className="plan-overview-badge">이전 버전 · 최신 답변 반영 전</span>
          <span>
            {regenerating
              ? `새 초안을 만드는 중이에요${stageLabel ? ` — ${stageLabel}` : ''}. 아래는 이전 버전이에요.`
              : '이 초안은 최신 답변을 반영하기 전 버전이에요.'}
          </span>
          {staleReasons.length > 0 && !regenerating && (
            <span className="plan-overview-dim">달라진 것: {staleReasons.join(', ')}</span>
          )}
          {onRemake && !regenerating && (
            <button type="button" className="btn-primary btn-sm" onClick={onRemake}>다시 만들기</button>
          )}
        </div>
      )}

      {/* 실제 제안량이 먼저다. 예산은 상한일 뿐이라 작은 글씨로 뒤에 둔다. */}
      <p className="plan-overview-lead">
        <strong>고른 항목 {selectedCount}개 · 합계 {formatMinutes(selectedMinutes)}</strong>
      </p>
      {(budget != null && budget > 0) || available != null ? (
        <p className="plan-overview-dim">
          {budget != null && budget > 0 && <>예산(상한) {formatMinutes(budget)} — 채워야 하는 양이 아니에요</>}
          {budget != null && budget > 0 && available != null && ' · '}
          {available != null && (
            <>
              남는 시간 추정 {formatMinutes(available)}
              {' · 여유/휴식 약 '}{formatMinutes(Math.max(0, available - selectedMinutes))}
            </>
          )}
        </p>
      ) : null}

      {projects.length > 0 && (
        <div className="plan-overview-projects">
          <p className="plan-overview-line">
            <span className="plan-overview-label">포함한 프로젝트 {included.length}개</span>
            {included.length > 0
              ? included.map((p) => `${titleOf(p)}${p.itemCount ? ` (${p.itemCount}개 · ${formatMinutes(p.itemMinutes ?? 0)})` : ''}`).join(', ')
              : '없음'}
          </p>
          {missing.length > 0 && (
            <ul className="plan-overview-missing" aria-label="이번 초안에 들어가지 않은 프로젝트">
              {missing.map((p) => (
                <li key={p.courseId}>
                  <span className="plan-overview-project">{titleOf(p)}</span>
                  <span className="plan-overview-badge">{PROJECT_DISPOSITION_LABEL[p.disposition] ?? '상태 미확인'}</span>
                  {p.reason && <span className="plan-overview-reason">{p.reason}</span>}
                  {MATERIAL_STATE_LABEL[p.materialState] && (
                    <span className="plan-overview-dim">자료: {MATERIAL_STATE_LABEL[p.materialState]}</span>
                  )}
                  {NEXT_ACTION_HINT[p.nextAction] && (
                    <span className="plan-overview-dim">→ {NEXT_ACTION_HINT[p.nextAction]}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/*
        일정을 못 읽은 것과 일정이 없는 것은 다르다. 못 읽었으면 "일정이 없어서 가정했다"고 말하지 않는다 —
        그건 모르는 것을 없는 것으로 바꿔 말하는 것이다.
      */}
      {scheduleLookupFailed ? (
        <p className="plan-overview-warn" role="alert">
          일정을 불러오지 못했어요
          {onRetrySchedule && (
            <>
              {' — '}
              <button type="button" className="btn-ghost btn-sm" onClick={onRetrySchedule}>다시 시도</button>
            </>
          )}
        </p>
      ) : basisNote && (
        <p className="plan-overview-warn"><span className="plan-overview-badge">배치 임시</span> {basisNote}</p>
      )}

      {openQuestion && (
        <p className="plan-overview-question">
          <span className="plan-overview-label">아직 열려 있는 질문</span>
          {openQuestion}
          {onAnswerQuestion && (
            <button type="button" className="btn-ghost btn-sm" onClick={() => onAnswerQuestion(openQuestion)}>답하기</button>
          )}
        </p>
      )}

      {outcome && (changes.length > 0 || carried.length > 0 || conflicts.length > 0) && (
        <div className="plan-overview-outcome" role="status">
          {changes.length > 0 && (
            <>
              <p className="plan-overview-label">무엇이 바뀌었나</p>
              <ul>
                {changes.map((c, i) => (
                  <li key={`ch-${i}`}>{c.what}{c.why ? ` — ${c.why}` : ''}</li>
                ))}
              </ul>
            </>
          )}
          {carried.length > 0 && (
            <p className="plan-overview-dim">
              직접 고친 값은 새 초안에 그대로 옮겼어요:
              {' '}
              {carried.map((c) => `${c.title} (${(c.fields ?? []).map(fieldLabel).join(', ')})`).join(', ')}
            </p>
          )}
          {conflicts.length > 0 && (
            <ul className="plan-overview-conflicts" aria-label="새 제안과 다른 내 편집">
              {conflicts.map((c, i) => {
                const key = `${c.title}|${c.field}`;
                const choice = conflictChoice[key] ?? 'yours';
                // 이 화면에서 실제로 바꿀 수 있는 값만 고르게 한다. 나머지는 내 값을 지켰다는 사실과 비교만 보여 준다.
                const choosable = Boolean(onChooseConflict) && (c.field === 'expectedMinutes' || c.field === 'minutes');
                return (
                  <li key={`cf-${i}`}>
                    <span>{c.title} · {fieldLabel(c.field)}</span>
                    {choosable ? (
                      <>
                        <label>
                          <input type="radio" name={`conflict-${i}`} checked={choice === 'yours'}
                            onChange={() => onChooseConflict(c, 'yours')} />
                          내 값 유지: {String(c.yours)}
                        </label>
                        <label>
                          <input type="radio" name={`conflict-${i}`} checked={choice === 'suggested'}
                            onChange={() => onChooseConflict(c, 'suggested')} />
                          새 제안으로: {String(c.suggested)}
                        </label>
                      </>
                    ) : (
                      <span className="plan-overview-dim">
                        내 값을 그대로 뒀어요: {String(c.yours)} (새 제안: {String(c.suggested)})
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <div className="plan-overview-actions">
        {onReview && <button type="button" className="btn-ghost btn-sm" onClick={onReview}>검토·수정</button>}
        {onApply && (
          <button type="button" className="btn-primary btn-sm" disabled={applyDisabled} onClick={onApply}>{applyLabel}</button>
        )}
        {onContinueConsult && (
          <button type="button" className="btn-ghost btn-sm" onClick={onContinueConsult}>계속 상담</button>
        )}
      </div>
    </section>
  );
}
