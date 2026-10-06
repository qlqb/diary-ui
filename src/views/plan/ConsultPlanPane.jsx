/**
 * 상담 작업 공간의 오른쪽 칸 — 내 답이 계획을 어떻게 바꿨는가.
 *
 * 다섯 상태를 글자로 구분한다(색만으로 말하지 않는다):
 *   계획 방향  아직 자료 원문을 읽기 전. 방향만 있다
 *   만드는 중  서버가 실제로 밟고 있는 단계만 보인다. 가짜 진행률은 없다
 *   초안       고치고 적용할 수 있는 초안
 *   갱신 필요  초안은 있지만 최신 답변을 반영하기 전 버전이다
 *   적용됨     계획으로 확정됐다
 *
 * ★ "이번 답변으로 바뀐 방향"이 맨 위다. 서버가 준 문장을 그대로 그린다 — 아직 확인하지 않은 파일이나
 *   문제 조건을 화면이 지어내 덧붙이지 않는다.
 * ★ 초안 검토는 계획 탭과 같은 화면(PlanDraftReview)이다. 두 번째 검토 화면을 만들지 않는다.
 * ★ 다시 만드는 동안에도 이전 초안을 "이전 버전"으로 계속 보여 준다. 빈 화면으로 기다리게 하지 않는다.
 */

import { useMemo, useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { PLAN_PANE_STATE_LABEL } from '../../ai/consultLabels.js';
import { toIsoDate } from '../../lib/planTime.js';
import PlanDraftReview from './PlanDraftReview.jsx';

export default function ConsultPlanPane({
  consultState = null, consultDraft, projectTitles = {},
  onOpenSource, onOpenSchedule, onOpenPlan, onConfirmed, onAsk, onFocusChat,
}) {
  const todayIso = useMemo(() => toIsoDate(new Date()), []);
  const [notice, setNotice] = useState(null);

  const {
    draft, stale, staleReasons, regenerating, stageLabel, error, outcome, applied, regenerate, discard, markApplied,
  } = consultDraft;
  const direction = consultState?.direction ?? null;
  // 대화 쪽에서 새 초안을 만들고 있는 중(SSE가 알려 준 실제 단계)도 "만드는 중"이다.
  const chatStage = consultState?.stage ?? null;
  const generating = regenerating || Boolean(chatStage);

  let state = 'DIRECTION';
  if (generating) state = 'GENERATING';
  else if (draft && stale) state = 'STALE';
  else if (draft) state = 'DRAFT';
  else if (applied) state = 'APPLIED';

  const redraftable = Boolean(draft?.requestContext?.redraftable) && draft?.proposalId != null;
  const excludedTopics = draft?.requestContext?.excludedTopics ?? [];

  const excludeThisTime = async (topicId, title) => {
    if (topicId == null) return;
    const ids = excludedTopics.map((e) => e.topicId);
    const ok = await regenerate({ excludeTopicIds: ids.includes(topicId) ? ids : [...ids, topicId] });
    if (ok) setNotice({ message: `「${title}」은(는) 이번 계획에서만 뺐어요. 다음 계획에는 다시 후보로 돌아와요.` });
  };

  return (
    <div className="consult-plan">
      <h2 className="consult-pane-title">
        계획 미리보기
        <span className={`consult-state consult-state-${state.toLowerCase()}`} role="status">
          {PLAN_PANE_STATE_LABEL[state]}
        </span>
      </h2>

      {direction && (
        <section className="consult-direction" aria-label={direction.fresh ? '이번 답변으로 바뀐 방향' : '지금 계획 방향'}>
          <p className="consult-pane-label">{direction.fresh ? '이번 답변으로 바뀐 방향' : '지금 계획 방향'}</p>
          {direction.fresh && direction.before && (
            <p className="consult-direction-before">
              <span className="consult-direction-tag">이전</span> {direction.before}
            </p>
          )}
          <p className="consult-direction-after">
            {direction.fresh && direction.before && <ArrowRight size={13} aria-hidden="true" />}
            <span className="consult-direction-tag">{direction.fresh && direction.before ? '지금' : '방향'}</span>
            {' '}{direction.after}
          </p>
          {direction.reason && <p className="consult-direction-reason">바뀐 이유: {direction.reason}</p>}
        </section>
      )}

      {state === 'DIRECTION' && !direction && (
        <p className="hint">
          아직 방향을 정하기 전이에요. 대화에서 상황을 이야기하면 계획 방향이 여기에 먼저 보이고,
          자료 원문은 초안을 만들 때 읽어요.
        </p>
      )}
      {state === 'DIRECTION' && direction && (
        <p className="hint">아직 방향만 정한 상태예요. 자료 원문을 읽고 항목을 만드는 것은 초안을 만들 때예요.</p>
      )}

      {generating && (
        <p className="consult-progress" role="status">
          <Loader2 size={14} className="spin" aria-hidden="true" />
          {' '}만드는 중{(chatStage ?? stageLabel) ? ` — ${chatStage ?? stageLabel}` : ''}
          {draft ? ' · 아래는 이전 버전이에요' : ''}
        </p>
      )}

      {error && <p className="error-text" role="alert">{error}</p>}
      {notice && <p className="plan-toast" role="status">{notice.message}</p>}

      {applied && !draft && (
        <section className="consult-applied" aria-label="적용된 계획">
          <p>{applied.title ? `「${applied.title}」` : '계획'}을 적용했어요. 실제 일정에 반영됐어요.</p>
          <div className="plan-draft-actions">
            {onOpenPlan && applied.plan?.planVersionId != null && (
              <button type="button" className="btn-primary btn-sm" onClick={() => onOpenPlan(applied.plan.planVersionId)}>
                계획 보기
              </button>
            )}
            {onOpenSchedule && (
              <button type="button" className="btn-ghost btn-sm" onClick={onOpenSchedule}>일정에서 보기</button>
            )}
          </div>
        </section>
      )}

      {draft && !draft.ask && (
        <PlanDraftReview
          key={draft.proposalId ?? 'no-time'}
          draft={draft}
          projectTitles={projectTitles}
          todayIso={todayIso}
          onConfirmed={(plan) => { markApplied(plan); onConfirmed?.(plan); }}
          /* 버리기는 서버에도 남는다(DISMISSED) — 화면에서만 지우면 대화를 다시 열 때 되살아난다. */
          onDiscard={discard}
          discardLabel="이 초안 버리기"
          onOpenSchedule={onOpenSchedule}
          onOpenSource={onOpenSource}
          onExcludeThisTime={redraftable ? excludeThisTime : null}
          onRedraft={redraftable ? () => regenerate({}) : null}
          onNotify={setNotice}
          busy={regenerating}
          confirmBlockedReason={regenerating ? '초안을 다시 만드는 중이에요' : null}
          stale={stale}
          staleReasons={staleReasons}
          remaking={regenerating}
          remakeStageLabel={stageLabel}
          onRemake={draft.proposalId != null ? () => regenerate({}) : null}
          outcome={outcome && outcome.fromProposalId !== draft.proposalId ? outcome : null}
          onAnswerQuestion={onAsk ? (question) => onAsk(`「${question}」에 답할게요: `) : null}
          onContinueConsult={onFocusChat ?? null}
        />
      )}
    </div>
  );
}
