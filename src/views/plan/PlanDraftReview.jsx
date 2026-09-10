/**
 * 기간 계획 초안 검토 — 어느 진입점(계획 탭, 오늘/일정/프로젝트의 AI 패널)에서 만들었든
 * 같은 화면이다. 받는 것은 서버의 PlanDraftResponse 하나이고, 확정은 항상
 * /api/plans/proposals/{id}/confirm(PlanVersion 확정)이다. 일반 제안의 "변경 N개 적용"
 * 바는 여기서 쓰지 않는다.
 *
 * 사용자가 조정하는 대상은 개수가 아니라 부하다. 요약 줄에 추정 남는 시간·학습 목표·선택
 * 합계·여유/휴식을 함께 보여주고, 체크를 풀면 합계와 여유가 바로 바뀐다. 목표보다 적게
 * 골라도 경고하지 않는다.
 *
 * 정확한 시각은 확정 전에 기존 배치 미리보기(SchedulePreview, OpenAI 호출 없음)로 첫 7일만
 * 계산해 보여준다. 8일 이상 계획의 나머지는 미배치로 남고 "해당 주가 가까워지면 배치"라고
 * 말한다. 미리보기에서 배치된 시각은 확정 요청의 editedItems로 그대로 실린다.
 *
 * 호출부는 초안이 바뀔 때 key(proposalId)를 바꿔 이 컴포넌트를 새로 만든다 — 검토 상태
 * (제외·접힘·제목)는 초안마다 처음부터 시작한다.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Clock3 } from 'lucide-react';
import { planAPI, schedulePreviewAPI, topicAPI } from '../../api/api.js';
import { PLAN_INTENSITY_LABEL } from '../../types/execution.js';
import { formatDateKo, formatMinutes } from '../../lib/planTime.js';
import { groupItems, initialCollapsed, placementsToEditedItems } from '../../lib/planDraft.js';
import {
  ACTION_TYPE_LABEL, PRIORITY_LABEL, TREATMENT_LABEL, formatDeadline, formatEstimate,
} from '../../lib/planLabels.js';
import PlanStrategyPanel from './PlanStrategyPanel.jsx';
import PlanProvenancePanel, { ItemEvidence } from './PlanProvenance.jsx';

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

export default function PlanDraftReview({
  draft, projectTitles = {}, todayIso, onConfirmed, onDiscard, discardLabel = '다시 만들기', onOpenSchedule,
  onOpenSource,
}) {
  const [excluded, setExcluded] = useState(() => new Set());
  const [collapsed, setCollapsed] = useState(() => initialCollapsed(draft, projectTitles, todayIso));
  const [title, setTitle] = useState(() => draft?.suggestedTitle || '');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewNote, setPreviewNote] = useState(null);
  /*
   * 재생성은 새 제안을 만들고 원본을 폐기하므로 proposalId가 바뀐다. 호출부의 초안을
   * 갈아끼우는 대신 여기서 들고 있는다 — 부모가 다시 그리면 key가 바뀌어 검토 상태
   * (제외·접힘·제목)가 통째로 초기화되고, 사용자는 방금 푼 체크가 되돌아온 것을 본다.
   */
  const [regenerated, setRegenerated] = useState(null);
  const [regenerating, setRegenerating] = useState(false);
  const [toast, setToast] = useState(null);
  /*
   * 생성 시 참고한 정보. 회차마다 하나뿐이라 초안당 한 번만 부르고 항목들이 나눠 쓴다 —
   * 항목마다 부르면 같은 스냅샷을 조각 수만큼 받아 온다.
   */
  const [provenance, setProvenance] = useState(null);
  const [provenanceLoading, setProvenanceLoading] = useState(false);
  const [provenanceError, setProvenanceError] = useState(null);

  const current = regenerated ?? draft;
  const strategy = current?.strategy ?? null;
  const proposalId = current?.proposalId ?? null;
  const noAvailableTime = Boolean(current?.noAvailableTime);

  /*
   * 배치 미리보기. 저장된 것이 있으면 그대로, 없으면 한 번 계산한다. OpenAI를 부르지 않는다.
   * 못 구해도 검토는 계속된다 — 그때 확정하면 롤링 배치가 나중에 시각을 정한다.
   */
  useEffect(() => {
    if (!proposalId || noAvailableTime) return undefined;
    let cancelled = false;
    (async () => {
      try {
        if (!schedulePreviewAPI?.get) return;
        const stored = await schedulePreviewAPI.get(proposalId);
        const result = stored ?? (await schedulePreviewAPI.recompute(proposalId, {}));
        if (!cancelled) setPreview(result ?? null);
      } catch {
        if (!cancelled) setPreviewNote('정확한 시각 미리보기를 불러오지 못했어요. 확정하면 배치 때 시각이 정해져요.');
      }
    })();
    return () => { cancelled = true; };
  }, [proposalId, noAvailableTime]);

  /*
   * 재생성하면 proposalId가 바뀌고 회차도 바뀐다. 옛 스냅샷을 들고 있으면 새 항목의
   * refId가 어디에도 안 맞아 "근거 없음"으로 보인다.
   */
  useEffect(() => {
    // 이웃한 미리보기 호출과 같은 방어다 — planAPI를 부분만 모킹한 테스트에서
    // 이 화면 전체가 죽지 않게 한다.
    if (!proposalId || !planAPI?.draftProvenance) return undefined;
    let cancelled = false;
    setProvenance(null);
    setProvenanceError(null);
    setProvenanceLoading(true);
    planAPI.draftProvenance(proposalId)
      .then((loaded) => { if (!cancelled) setProvenance(loaded); })
      .catch((err) => { if (!cancelled) setProvenanceError(err.message || '참고한 정보를 불러오지 못했어요.'); })
      .finally(() => { if (!cancelled) setProvenanceLoading(false); });
    return () => { cancelled = true; };
  }, [proposalId]);

  const items = useMemo(() => current?.proposal?.items ?? [], [current]);

  /** 항목 하나의 근거. 서버가 제안 항목 id로 내려주므로 화면이 제목으로 짝짓지 않는다. */
  const evidenceByItem = useMemo(() => {
    const map = new Map();
    (provenance?.items ?? []).forEach((one) => map.set(one.proposalItemId, one));
    return map;
  }, [provenance]);

  /** 조각의 취급은 판단에 있다. 복사하지 않고 topicId로 이어 붙인다. */
  const treatmentByTopic = useMemo(() => {
    const map = new Map();
    (strategy?.topics ?? []).forEach((topic) => map.set(topic.topicId, topic.treatment));
    return map;
  }, [strategy]);

  /*
   * 같은 과목 조각들이 공유하는 마감 시각. 그 시각이 수업 시작이면 "화요일 수업 전"으로
   * 읽어 준다 — 조각마다 마감이 같은 것은 그것이 수업 시각이기 때문이다.
   */
  const classAtByCourse = useMemo(() => {
    const map = new Map();
    items.forEach((item) => {
      if (item.courseId != null && item.deadlineAt) map.set(item.courseId, item.deadlineAt);
    });
    return map;
  }, [items]);

  const placedById = useMemo(
    () => new Map((preview?.placedItems ?? []).map((p) => [p.proposalItemId, p])),
    [preview],
  );
  const unplacedById = useMemo(
    () => new Map((preview?.unplacedItems ?? []).map((p) => [p.proposalItemId, p])),
    [preview],
  );

  const groups = useMemo(() => groupItems(items, projectTitles), [items, projectTitles]);

  const selectedItems = useMemo(
    () => items.filter((item) => !excluded.has(item.proposalItemId)),
    [items, excluded],
  );
  const selectedMinutes = selectedItems.reduce((sum, item) => sum + (item.expectedMinutes || 0), 0);
  const available = current?.estimatedAvailableMinutes ?? null;
  const target = current?.targetMinutes ?? 0;
  const buffer = available != null ? Math.max(0, available - selectedMinutes) : null;
  const allExcluded = items.length > 0 && excluded.size >= items.length;
  const longPlan = (current?.days ?? 0) > 7;

  const toggleItem = useCallback((proposalItemId) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(proposalItemId)) next.delete(proposalItemId);
      else next.add(proposalItemId);
      return next;
    });
  }, []);

  /**
   * 조각만 다시 만든다. 판단은 서버가 그대로 두고, 표식이 가리키는 항목만 뺀다.
   *
   * 전략 영역은 로딩으로 덮지 않는다 — 판단이 안 바뀐다는 것을 화면이 보여주는 편이,
   * 안 바뀐다고 글로 적는 것보다 낫다.
   */
  const regenerate = useCallback(async (note) => {
    if (!proposalId || regenerating) return;
    setRegenerating(true);
    setError(null);
    try {
      const next = await planAPI.regenerateItems(proposalId);
      setRegenerated(next);
      // 제외 체크는 이번 조각 목록에만 의미가 있다. 새 조각에 옛 id를 들고 있으면
      // 엉뚱한 항목이 빠진 채 확정된다.
      setExcluded(new Set());
      setPreview(null);
      if (note) setToast(note);
    } catch (err) {
      setError(err.message || '실행 방법을 다시 만들지 못했습니다.');
    } finally {
      setRegenerating(false);
    }
  }, [proposalId, regenerating]);

  /**
   * 「이미 알아요」. 표식을 저장하고 조각을 다시 만든다.
   *
   * 확인 다이얼로그를 두지 않는다 — 되돌리기가 한 번에 되는 동작에 확인을 붙이면 그 확인이
   * 오히려 "되돌릴 수 없는 일"이라는 신호가 된다. 되돌리기는 토스트에 둔다.
   */
  const markKnown = useCallback(async (topicId) => {
    if (topicId == null || regenerating) return;
    try {
      await topicAPI.updateUserMark(topicId, 'KNOWN');
    } catch (err) {
      setError(err.message || '표시를 저장하지 못했습니다.');
      return;
    }
    await regenerate({
      message: '다음 계획부터도 이 내용은 건너뛸게요',
      undo: async () => {
        await topicAPI.updateUserMark(topicId, null);
        await regenerate(null);
      },
    });
  }, [regenerate, regenerating]);

  const handleConfirm = async () => {
    if (!draft || confirming || allExcluded) return;
    setConfirming(true);
    setError(null);
    try {
      // 미리보기에서 승인한 시각을 그대로 싣는다. 배치되지 않은 항목은 원본(미배치) 그대로다.
      const editedItems = placementsToEditedItems(selectedItems, placedById);
      const plan = await planAPI.confirm(proposalId, {
        excludedItemIds: [...excluded],
        editedItems: editedItems.length > 0 ? editedItems : null,
        title: title.trim() || current.suggestedTitle,
        goalSummary: current.goalSummary,
      });
      onConfirmed?.(plan);
    } catch (err) {
      setError(err.message || '확정하지 못했습니다.');
      setConfirming(false);
    }
  };

  if (!draft) return null;

  if (noAvailableTime) {
    return (
      <div className="plan-draft plan-draft-empty">
        <p className="plan-summary-line">
          {PLAN_INTENSITY_LABEL[current.intensity] ?? ''} 계획 · 기간 {formatDateKo(current.startDate)} ~ {formatDateKo(current.endDate)}
        </p>
        <p>현재 추정으로는 이 기간에 배치할 수 있는 시간이 없어요. 항목을 억지로 만들지 않았어요.</p>
        {current.availabilityConfidenceSummary && <p className="hint">{current.availabilityConfidenceSummary}</p>}
        <p className="hint">남는 시간을 고치거나 기간·강도를 다시 고르면 다시 만들 수 있어요.</p>
        <div className="plan-draft-actions">
          {onDiscard && <button type="button" className="btn-ghost" onClick={onDiscard}>기간·강도 다시 고르기</button>}
          {onOpenSchedule && (
            <button type="button" className="btn-primary" onClick={onOpenSchedule}>일정에서 남는 시간 확인</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="plan-draft">
      <div className="plan-draft-head">
        <p className="plan-summary-line">
          <strong>{PLAN_INTENSITY_LABEL[current.intensity] ?? ''} 계획</strong>
          {' · '}기간 {formatDateKo(current.startDate)} ~ {formatDateKo(current.endDate)}
        </p>
        <PlanSummary
          available={available}
          target={target}
          selectedCount={selectedItems.length}
          selectedMinutes={selectedMinutes}
          buffer={buffer}
          confidence={current.availabilityConfidenceSummary}
          cappedByItemLimit={current.targetCappedByItemLimit}
          uncoveredMinutes={current.uncoveredMinutes}
        />
        <TimeGauge selectedMinutes={selectedMinutes} targetMinutes={target} intensity={current.intensity} />
        {/* 예전 서버가 이유를 보내면 그대로 보여준다. 새 서버는 예산을 직접 계산하므로 비어 있다. */}
        {current.targetMinutesReason && <p className="plan-draft-reason">{current.targetMinutesReason}</p>}
      </div>

      {/* 판단은 조각보다 먼저 온다. 무엇을 하는지보다 왜 그렇게 보는지가 먼저 읽혀야 한다. */}
      <PlanStrategyPanel strategy={strategy} projectTitles={projectTitles} />

      {/*
        판단 다음에 온다. "이렇게 봤어요"가 결론이고 이쪽은 그 결론 이전에 무엇을 봤는지다.
        둘을 한 패널로 합치지 않는다 — 준 정보와 내린 판단은 같은 것이 아니다.
      */}
      <PlanProvenancePanel
        provenance={provenance}
        loading={provenanceLoading}
        error={provenanceError}
        onOpenSource={onOpenSource}
      />

      {toast && (
        <p className="plan-toast" role="status">
          {toast.message}
          {toast.undo && (
            <button type="button" className="btn-ghost btn-sm"
              onClick={() => { const undo = toast.undo; setToast(null); undo(); }}>
              되돌리기
            </button>
          )}
        </p>
      )}

      <label className="plan-title-field">
        <span>계획 이름</span>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>

      {previewNote && <p className="hint">{previewNote}</p>}
      {preview && longPlan && (
        <p className="hint">
          정확한 시각은 처음 7일({formatDateKo(preview.horizonStart)} ~ {formatDateKo(preview.horizonEnd)})만 미리 계산했어요.
          이번 주 이후 항목은 해당 주가 가까워지면 배치됩니다.
        </p>
      )}

      {groups.map((group) => (
        <PlanDraftGroup
          key={group.key}
          group={group}
          excluded={excluded}
          collapsed={collapsed.has(group.key)}
          placedById={placedById}
          unplacedById={unplacedById}
          previewLoaded={preview != null}
          treatmentByTopic={treatmentByTopic}
          classAtByCourse={classAtByCourse}
          onMarkKnown={markKnown}
          busy={regenerating}
          provenance={provenance}
          evidenceByItem={evidenceByItem}
          onOpenSource={onOpenSource}
          onToggleCollapse={() => setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(group.key)) next.delete(group.key);
            else next.add(group.key);
            return next;
          })}
          onToggleItem={toggleItem}
          onToggleGroup={() => setExcluded((prev) => {
            const next = new Set(prev);
            const ids = group.items.map((i) => i.proposalItemId);
            const allOn = ids.every((id) => !next.has(id));
            ids.forEach((id) => { if (allOn) next.add(id); else next.delete(id); });
            return next;
          })}
        />
      ))}

      {error && <p className="error-text">{error}</p>}

      <div className="plan-draft-actions">
        {onDiscard && (
          <button type="button" className="btn-ghost" onClick={onDiscard}>{discardLabel}</button>
        )}
        {strategy && (
          <button type="button" className="btn-ghost" disabled={regenerating}
            onClick={() => regenerate({ message: '판단은 그대로 두고 실행 방법만 다시 만들었어요' })}>
            {regenerating ? '다시 만드는 중…' : '실행 방법 다시 제안'}
          </button>
        )}
        <button type="button" className="btn-primary" disabled={confirming || allExcluded} onClick={handleConfirm}>
          {confirming ? '확정하는 중…' : '계획 확정'}
        </button>
      </div>
      {allExcluded && <p className="hint">항목을 하나도 안 고르면 확정할 게 없어요.</p>}
    </div>
  );
}

/**
 * 시간 요약. 값이 없는(예전 서버) 필드는 그 조각만 뺀다 — 0으로 보여주지 않는다.
 * 목표보다 선택 합계가 적어도 경고하지 않는다.
 */
function PlanSummary({
  available, target, selectedCount, selectedMinutes, buffer, confidence, cappedByItemLimit, uncoveredMinutes,
}) {
  const lowConfidence = confidence != null && confidence.includes('기본 시간대');
  return (
    <div className="plan-summary">
      <p className="plan-summary-line">
        {available != null && <>추정 남는 시간 {formatMinutes(available)} · </>}
        학습 목표 {formatMinutes(target)}
      </p>
      {/*
        한 번에 담을 수 있는 최대(항목 30개 × 120분)를 넘어 목표가 깎인 경우. 실패가 아니라
        "이 기간을 한 계획에 다 담지는 못한다"는 사실이라 그대로 말한다.
      */}
      {cappedByItemLimit && (
        <p className="plan-summary-line plan-summary-capped">
          이 기간의 남는 시간을 한 계획에 다 담지는 못했어요
          {uncoveredMinutes ? <> · 약 {formatMinutes(uncoveredMinutes)}이 남아요</> : null}.
          주 단위로 나눠 만들면 더 담을 수 있어요.
        </p>
      )}
      <p className="plan-summary-line">
        선택한 항목 {selectedCount}개 · 합계 {formatMinutes(selectedMinutes)}
        {buffer != null && <> · 여유/휴식 약 {formatMinutes(buffer)}</>}
      </p>
      {confidence && (
        <p className={`hint${lowConfidence ? ' plan-summary-low' : ''}`}>
          {lowConfidence ? '남는 시간은 ' : ''}{confidence}
          {lowConfidence ? '이에요. 확정 사실이 아니라 추정이라 미리보기에서 고칠 수 있어요.' : ''}
        </p>
      )}
    </div>
  );
}

/**
 * 시간 예산 게이지.
 *
 * 목표를 넘어도 경고하지 않는다 — 색만 바꾸고 문구는 두지 않는다. "초과했습니다"는
 * 실패 프레이밍이고, 넘겨서 잡는 것도 사용자의 선택이다.
 */
function TimeGauge({ selectedMinutes, targetMinutes, intensity }) {
  const target = targetMinutes || 0;
  const ratio = target > 0 ? Math.min(selectedMinutes / target, 1) : 0;
  const over = target > 0 && selectedMinutes > target;

  return (
    <div className="plan-gauge">
      <span className="plan-gauge-label">
        {intensity ? `${PLAN_INTENSITY_LABEL[intensity]} · ` : ''}목표 {formatMinutes(target)}
      </span>
      <span className={`plan-gauge-bar${over ? ' is-over' : ''}`}>
        <span className="plan-gauge-fill" style={{ width: `${ratio * 100}%` }} />
      </span>
      <span className="plan-gauge-value">
        {formatMinutes(selectedMinutes)} / {formatMinutes(target)}
      </span>
    </div>
  );
}

function PlanDraftGroup({
  group, excluded, collapsed, placedById, unplacedById, previewLoaded, onToggleCollapse, onToggleItem, onToggleGroup,
  treatmentByTopic, classAtByCourse, onMarkKnown, busy, provenance, evidenceByItem, onOpenSource,
}) {
  const groupMinutes = group.items
    .filter((item) => !excluded.has(item.proposalItemId))
    .reduce((sum, item) => sum + (item.expectedMinutes || 0), 0);
  const allOn = group.items.every((item) => !excluded.has(item.proposalItemId));

  return (
    <div className="plan-group">
      <div className="plan-group-head">
        <button type="button" className="plan-group-toggle" onClick={onToggleCollapse}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          <span className="plan-group-title">{group.title}</span>
        </button>
        <span className="plan-group-meta">
          {formatMinutes(groupMinutes)} · {group.items.length}개
        </span>
        <input type="checkbox" checked={allOn} onChange={onToggleGroup}
          aria-label={`${group.title} 전체 선택`} />
      </div>

      {!collapsed && (
        <ul className="plan-group-items">
          {group.items.map((item) => (
            <li key={item.proposalItemId} className="plan-item">
              <label>
                <input
                  type="checkbox"
                  checked={!excluded.has(item.proposalItemId)}
                  onChange={() => onToggleItem(item.proposalItemId)}
                />
                <span className="plan-item-title">{item.title}</span>
                <span className="plan-item-meta">
                  {/*
                    취급과 우선순위는 다른 축이다 — "꼭 하기 · 핵심만 보기"가 성립한다.
                    한쪽으로 합치면 "중요한데 짧게 본다"를 말할 수 없다.
                  */}
                  {[
                    PRIORITY_LABEL[item.priority],
                    treatmentByTopic?.get(item.topicId) != null
                      ? TREATMENT_LABEL[treatmentByTopic.get(item.topicId)]
                      : null,
                    ACTION_TYPE_LABEL[item.actionType],
                    formatEstimate(item.expectedMinutes),
                    formatDeadline(item.deadlineAt, classAtByCourse?.get(item.courseId)),
                    /*
                      targetDate가 아니라 placementType으로 판단한다. 제안의 targetDate는 서버가
                      요청 기간의 시작일로 강제하는 값이라 미배치 항목에도 값이 들어 있다.
                    */
                    item.placementType === 'UNSCHEDULED' || !item.targetDate
                      ? null
                      : formatDateKo(item.targetDate),
                  ].filter(Boolean).join(' · ')}
                </span>
              </label>

              {item.sourceLocator && <p className="plan-item-source">{item.sourceLocator}</p>}

              {item.doneCriteria && (
                <p className="plan-item-done">
                  <span className="plan-item-done-label">완료 기준</span>
                  {item.doneCriteria}
                  {/*
                    서버가 채운 문장은 항목 제목에서 기계적으로 뽑은 것이라 덜 구체적이다.
                    그 사실을 숨기면 사용자는 왜 어떤 조각만 밋밋한지 알 수 없다.
                  */}
                  {item.doneCriteriaSource === 'DEFAULT' && <span className="plan-item-tag">기본</span>}
                </p>
              )}

              {item.reason && <p className="plan-item-reason">{item.reason}</p>}
              {!item.doneCriteria && item.description && (
                <p className="plan-item-reason">{item.description}</p>
              )}

              {item.topicId != null && onMarkKnown && (
                <button
                  type="button"
                  className="btn-ghost btn-sm plan-item-known"
                  disabled={busy}
                  onClick={() => onMarkKnown(item.topicId)}
                >
                  이미 알아요
                </button>
              )}

              <PlacementLine
                item={item}
                placed={placedById.get(item.proposalItemId)}
                unplaced={unplacedById.get(item.proposalItemId)}
                previewLoaded={previewLoaded}
              />

              {/*
                근거는 접어 둔다. 조각 목록은 훑어보는 화면이고, 근거는 하나가 의심스러울
                때 그 하나만 여는 것이다. 펼쳐 두면 목록을 훑을 수 없게 된다.
              */}
              {evidenceByItem?.has(item.proposalItemId) && (
                <ItemEvidence
                  provenance={provenance}
                  item={evidenceByItem.get(item.proposalItemId)}
                  onOpenSource={onOpenSource}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * 미리보기가 정한 정확한 시각. 배치 실패는 실패라고 말하고, 미리보기 범위(첫 7일) 밖은
 * 임시 날짜를 진짜처럼 보여주지 않는다.
 */
function PlacementLine({ item, placed, unplaced, previewLoaded }) {
  if (placed) {
    return (
      <p className="plan-item-time">
        <Clock3 size={12} /> {formatSpan(placed.scheduledStartAt, placed.scheduledEndAt)}
      </p>
    );
  }
  if (unplaced) {
    return <p className="plan-item-time is-unplaced">배치 안 됨 · {unplaced.reason || '이 기간에 들어갈 시간이 없어요'}</p>;
  }
  if (previewLoaded && item.placementType === 'UNSCHEDULED') {
    return <p className="plan-item-time is-later">이번 주 이후 · 해당 주가 가까워지면 배치돼요</p>;
  }
  return null;
}

function formatSpan(startIso, endIso) {
  if (!startIso) return '';
  const start = new Date(startIso);
  const end = endIso ? new Date(endIso) : null;
  const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const day = `${start.getMonth() + 1}/${start.getDate()} ${WEEKDAY_KO[start.getDay()]}`;
  return end ? `${day} ${hhmm(start)}~${hhmm(end)}` : `${day} ${hhmm(start)}`;
}
