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
import { planAPI, schedulePreviewAPI } from '../../api/api.js';
import { PLAN_INTENSITY_LABEL } from '../../types/execution.js';
import { formatDateKo, formatMinutes } from '../../lib/planTime.js';
import { groupItems, initialCollapsed, placementsToEditedItems } from '../../lib/planDraft.js';

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

export default function PlanDraftReview({
  draft, projectTitles = {}, todayIso, onConfirmed, onDiscard, discardLabel = '다시 만들기', onOpenSchedule,
}) {
  const [excluded, setExcluded] = useState(() => new Set());
  const [collapsed, setCollapsed] = useState(() => initialCollapsed(draft, projectTitles, todayIso));
  const [title, setTitle] = useState(() => draft?.suggestedTitle || '');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewNote, setPreviewNote] = useState(null);

  const proposalId = draft?.proposalId ?? null;
  const noAvailableTime = Boolean(draft?.noAvailableTime);

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

  const items = useMemo(() => draft?.proposal?.items ?? [], [draft]);

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
  const available = draft?.estimatedAvailableMinutes ?? null;
  const target = draft?.targetMinutes ?? 0;
  const buffer = available != null ? Math.max(0, available - selectedMinutes) : null;
  const allExcluded = items.length > 0 && excluded.size >= items.length;
  const longPlan = (draft?.days ?? 0) > 7;

  const toggleItem = useCallback((proposalItemId) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(proposalItemId)) next.delete(proposalItemId);
      else next.add(proposalItemId);
      return next;
    });
  }, []);

  const handleConfirm = async () => {
    if (!draft || confirming || allExcluded) return;
    setConfirming(true);
    setError(null);
    try {
      // 미리보기에서 승인한 시각을 그대로 싣는다. 배치되지 않은 항목은 원본(미배치) 그대로다.
      const editedItems = placementsToEditedItems(selectedItems, placedById);
      const plan = await planAPI.confirm(draft.proposalId, {
        excludedItemIds: [...excluded],
        editedItems: editedItems.length > 0 ? editedItems : null,
        title: title.trim() || draft.suggestedTitle,
        goalSummary: draft.goalSummary,
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
          {PLAN_INTENSITY_LABEL[draft.intensity] ?? ''} 계획 · 기간 {formatDateKo(draft.startDate)} ~ {formatDateKo(draft.endDate)}
        </p>
        <p>현재 추정으로는 이 기간에 배치할 수 있는 시간이 없어요. 항목을 억지로 만들지 않았어요.</p>
        {draft.availabilityConfidenceSummary && <p className="hint">{draft.availabilityConfidenceSummary}</p>}
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
          <strong>{PLAN_INTENSITY_LABEL[draft.intensity] ?? ''} 계획</strong>
          {' · '}기간 {formatDateKo(draft.startDate)} ~ {formatDateKo(draft.endDate)}
        </p>
        <PlanSummary
          available={available}
          target={target}
          selectedCount={selectedItems.length}
          selectedMinutes={selectedMinutes}
          buffer={buffer}
          confidence={draft.availabilityConfidenceSummary}
          cappedByItemLimit={draft.targetCappedByItemLimit}
          uncoveredMinutes={draft.uncoveredMinutes}
        />
        <TimeGauge selectedMinutes={selectedMinutes} targetMinutes={target} intensity={draft.intensity} />
        {/* 예전 서버가 이유를 보내면 그대로 보여준다. 새 서버는 예산을 직접 계산하므로 비어 있다. */}
        {draft.targetMinutesReason && <p className="plan-draft-reason">{draft.targetMinutesReason}</p>}
      </div>

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
                    targetDate가 아니라 placementType으로 판단한다. 제안의 targetDate는 서버가
                    요청 기간의 시작일로 강제하는 값이라 미배치 항목에도 값이 들어 있다.
                  */}
                  {item.expectedMinutes}분 ·{' '}
                  {item.placementType === 'UNSCHEDULED' || !item.targetDate
                    ? '날짜 미정'
                    : formatDateKo(item.targetDate)}
                </span>
              </label>
              {item.description && <p className="plan-item-reason">{item.description}</p>}
              <PlacementLine
                item={item}
                placed={placedById.get(item.proposalItemId)}
                unplaced={unplacedById.get(item.proposalItemId)}
                previewLoaded={previewLoaded}
              />
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
