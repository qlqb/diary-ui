/**
 * 계획 만들기 — 기간을 고르고, 초안을 받고, 확정한다.
 *
 * 강도는 초안 생성 **전에** 정해진다. 초안이 나온 뒤 강도를 바꾸는 것은 결국 다시 생성하는
 * 것과 같으므로 초안 화면에는 강도 변경을 두지 않는다. 그리고 기본값이 직전 계획에서
 * 이어지므로 매번 고르게 하지도 않는다 — 평소에는 한 줄로 접혀 있다.
 *
 * 초안 검토에서 사용자가 조정하는 대상은 개수가 아니라 부하다. 그래서 "6개"가 아니라
 * "12h 30m / 15h" 게이지를 보여주고, 체크를 풀면 게이지가 줄어든다.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarRange, ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { planAPI } from '../../api/api.js';
import { PLAN_INTENSITY_HINT, PLAN_INTENSITY_LABEL, PlanIntensity } from '../../types/execution.js';
import {
  addDays, daysBetween, formatDateKo, formatMinutes, periodPresets, toIsoDate,
} from '../../lib/planTime.js';

const MAX_PLAN_DAYS = 31;
const UNGROUPED_KEY = '__other__';

export default function PlanCreateView({
  projectTitles = {}, scopeCourseId = null, onClearScope, onConfirmed, onCancel,
}) {
  const todayIso = useMemo(() => toIsoDate(new Date()), []);
  const presets = useMemo(() => periodPresets(todayIso), [todayIso]);

  const [startDate, setStartDate] = useState(todayIso);
  const [endDate, setEndDate] = useState(addDays(todayIso, 6));
  const [intensity, setIntensity] = useState(null);
  const [intensityOpen, setIntensityOpen] = useState(false);
  const [instruction, setInstruction] = useState('');

  const [draft, setDraft] = useState(null);
  const [excluded, setExcluded] = useState(() => new Set());
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(null);
  /** 확정 이력이 없으면(=첫 계획) 강도를 펼친 상태로 시작한다. */
  const [hasHistory, setHasHistory] = useState(true);

  useEffect(() => {
    let cancelled = false;
    planAPI.findCoveringDate(todayIso)
      .then((plans) => {
        if (cancelled) return;
        // 오늘을 덮는 계획이 없다고 이력이 없는 것은 아니지만, 첫 계획을 만드는 사람에게
        // 강도를 펼쳐 보여주는 것이 목적이라 이 근사로 충분하다.
        const first = plans.length === 0;
        setHasHistory(!first);
        if (first) setIntensityOpen(true);
      })
      .catch(() => { /* 강도 펼침 여부일 뿐이라 실패해도 화면은 그대로 쓴다. */ });
    return () => { cancelled = true; };
  }, [todayIso]);

  const days = daysBetween(startDate, endDate);
  const periodValid = days >= 1 && days <= MAX_PLAN_DAYS;

  const applyPreset = (preset) => {
    setStartDate(preset.startDate);
    setEndDate(preset.endDate);
    setDraft(null);
  };

  const handleDraft = async () => {
    if (!periodValid || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await planAPI.createDraft({
        startDate, endDate, intensity,
        instruction: instruction.trim() || null,
        // 프로젝트 화면에서 들어왔으면 그 프로젝트만 대상으로 한다. 안 넘기면 서버가
        // 전체 ACTIVE 프로젝트를 대상으로 잡아, 누른 버튼과 결과가 어긋난다.
        courseIds: scopeCourseId != null ? [scopeCourseId] : null,
      });
      setDraft(result);
      setTitle(result.suggestedTitle || '');
      setExcluded(new Set());
      // 8일 이상이면 지금 판단할 것만 보여준다 — 30개를 한 화면에 펼치면 압도된다.
      setCollapsed(initialCollapsed(result, projectTitles, todayIso));
    } catch (err) {
      setError(err.message || '초안을 만들지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!draft || confirming) return;
    setConfirming(true);
    setError(null);
    try {
      const plan = await planAPI.confirm(draft.proposalId, {
        excludedItemIds: [...excluded],
        title: title.trim() || draft.suggestedTitle,
        goalSummary: draft.goalSummary,
      });
      onConfirmed?.(plan);
    } catch (err) {
      setError(err.message || '확정하지 못했습니다.');
      setConfirming(false);
    }
  };

  const toggleItem = useCallback((proposalItemId) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(proposalItemId)) next.delete(proposalItemId);
      else next.add(proposalItemId);
      return next;
    });
  }, []);

  const groups = useMemo(
    () => (draft ? groupItems(draft.proposal?.items ?? [], projectTitles) : []),
    [draft, projectTitles],
  );

  const selectedMinutes = useMemo(() => {
    if (!draft) return 0;
    return (draft.proposal?.items ?? [])
      .filter((item) => !excluded.has(item.proposalItemId))
      .reduce((sum, item) => sum + (item.expectedMinutes || 0), 0);
  }, [draft, excluded]);

  const allExcluded = draft && excluded.size >= (draft.proposal?.items?.length ?? 0);

  return (
    <section className="plan-create">
      <header className="view-head">
        <h1>
          <CalendarRange size={20} />
          {scopeCourseId != null && projectTitles[scopeCourseId]
            ? `${projectTitles[scopeCourseId]} 계획 만들기`
            : ' 계획 만들기'}
        </h1>
        {onCancel && (
          <button type="button" className="btn-ghost btn-sm" onClick={onCancel}>그만두기</button>
        )}
      </header>

      {/*
        범위가 좁혀져 있으면 그 사실과 해제 수단을 함께 보여준다. 범위를 조용히 적용하면
        "왜 다른 프로젝트 항목이 안 나오지"를 사용자가 알 방법이 없다.
      */}
      {scopeCourseId != null && (
        <p className="plan-scope">
          {projectTitles[scopeCourseId] ?? '이 프로젝트'} 항목만 제안받아요.
          {onClearScope && (
            <button type="button" className="btn-ghost btn-sm"
              onClick={() => { onClearScope(); setDraft(null); }}>
              전체 프로젝트로
            </button>
          )}
        </p>
      )}

      <div className="plan-period">
        <span className="plan-period-label">기간</span>
        <div className="plan-period-presets">
          {presets.map((preset) => (
            <button
              key={preset.key}
              type="button"
              className={`chip${startDate === preset.startDate && endDate === preset.endDate ? ' is-active' : ''}`}
              onClick={() => applyPreset(preset)}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="plan-period-range">
          <input type="date" value={startDate} max={endDate}
            onChange={(e) => { setStartDate(e.target.value); setDraft(null); }} />
          <span>~</span>
          <input type="date" value={endDate} min={startDate}
            onChange={(e) => { setEndDate(e.target.value); setDraft(null); }} />
          <span className="plan-period-days">{periodValid ? `${days}일` : '기간을 다시 골라주세요'}</span>
        </div>
        {!periodValid && days > MAX_PLAN_DAYS && (
          <p className="hint">한 번에 세울 수 있는 계획은 31일까지예요. 그보다 길면 계획이라기보다 목표에 가까워요.</p>
        )}
      </div>

      <IntensityPicker
        intensity={intensity}
        draftIntensity={draft?.intensity}
        draftMinutes={draft?.targetMinutes}
        open={intensityOpen}
        onToggle={() => setIntensityOpen((v) => !v)}
        onSelect={(value) => { setIntensity(value); setDraft(null); }}
        firstPlan={!hasHistory}
      />

      <label className="plan-instruction">
        <span>덧붙일 말 (선택)</span>
        <input
          type="text"
          value={instruction}
          placeholder="예: 시험 전까지 자료구조 위주로"
          onChange={(e) => setInstruction(e.target.value)}
        />
      </label>

      {!draft && (
        <button type="button" className="btn-primary" disabled={!periodValid || loading} onClick={handleDraft}>
          <Sparkles size={16} /> {loading ? '초안을 만들고 있어요…' : '초안 만들기'}
        </button>
      )}

      {error && <p className="error-text">{error}</p>}

      {draft && (
        <div className="plan-draft">
          <div className="plan-draft-head">
            <span className="plan-draft-period">
              {formatDateKo(draft.startDate)} ~ {formatDateKo(draft.endDate)}
            </span>
            <TimeGauge
              selectedMinutes={selectedMinutes}
              targetMinutes={draft.targetMinutes}
              intensity={draft.intensity}
            />
            {/* AI가 기준선을 조정했을 때만 이유를 보여준다. 조정이 없으면 이 줄은 없다. */}
            {draft.targetMinutesReason && (
              <p className="plan-draft-reason">{draft.targetMinutesReason}</p>
            )}
          </div>

          <label className="plan-title-field">
            <span>계획 이름</span>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>

          {groups.map((group) => (
            <PlanDraftGroup
              key={group.key}
              group={group}
              excluded={excluded}
              collapsed={collapsed.has(group.key)}
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

          <div className="plan-draft-actions">
            <button type="button" className="btn-ghost" onClick={() => setDraft(null)}>
              다시 만들기
            </button>
            <button type="button" className="btn-primary" disabled={confirming || allExcluded}
              onClick={handleConfirm}>
              {confirming ? '확정하는 중…' : '계획 확정'}
            </button>
          </div>
          {allExcluded && <p className="hint">항목을 하나도 안 고르면 확정할 게 없어요.</p>}
        </div>
      )}
    </section>
  );
}

/**
 * 강도 선택. 평소에는 한 줄로 접혀 있고 [강도 바꾸기]를 눌러야 펼쳐진다.
 *
 * 한 줄에 강도와 **그 기간에 해당하는 계산된 시간**을 함께 보여준다. "집중"만 표시하면
 * 이번 기간이 몇 시간인지 알 수 없다 — 한 달이면 60시간, 하루면 4시간이다.
 */
function IntensityPicker({ intensity, draftIntensity, draftMinutes, open, onToggle, onSelect, firstPlan }) {
  const shown = intensity ?? draftIntensity;

  /*
   * 첫 계획이면 "직전 계획과 같은 강도"라고 말하지 않는다 — 직전 계획이 없기 때문이다.
   * 빈 상태에서 존재하지 않는 것을 근거로 대면 사용자가 "내가 뭘 놓쳤나" 하고 찾게 된다.
   * 서버가 이력이 없을 때 NORMAL로 떨어뜨리므로 그 값을 그대로 말한다.
   */
  const summary = shown
    ? PLAN_INTENSITY_LABEL[shown]
    : firstPlan
      ? PLAN_INTENSITY_LABEL[PlanIntensity.NORMAL]
      : '직전 계획과 같은 강도';

  return (
    <div className="plan-intensity">
      <div className="plan-intensity-summary">
        <span>
          {summary}
          {draftMinutes != null && <> · 약 {formatMinutes(draftMinutes)}</>}
        </span>
        <button type="button" className="btn-ghost btn-sm" onClick={onToggle}>
          {open ? '접기' : '강도 바꾸기'}
        </button>
      </div>

      {open && (
        <div className="plan-intensity-options">
          {Object.values(PlanIntensity).map((value) => (
            <label key={value} className="plan-intensity-option">
              <input
                type="radio"
                name="plan-intensity"
                checked={shown ? shown === value
                  : firstPlan && value === PlanIntensity.NORMAL}
                onChange={() => onSelect(value)}
              />
              <span className="plan-intensity-name">{PLAN_INTENSITY_LABEL[value]}</span>
              <span className="plan-intensity-hint">{PLAN_INTENSITY_HINT[value]}</span>
            </label>
          ))}
          <p className="hint">이번 기간에 어느 정도 시간을 쓸지 정합니다. 나중에 조정할 수 있어요.</p>
          {firstPlan && <p className="hint">처음이라면 보통으로 그냥 넘어가도 괜찮아요.</p>}
        </div>
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

function PlanDraftGroup({ group, excluded, collapsed, onToggleCollapse, onToggleItem, onToggleGroup }) {
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
                    요청 기간의 시작일로 강제하는 값이라(AiProposalService.validateAndNormalize)
                    미배치 항목에도 값이 들어 있다 — 그걸 그대로 보여주면 "날짜 미정"인 항목이
                    전부 계획 첫날로 잡힌 것처럼 보인다.
                  */}
                  {item.expectedMinutes}분 ·{' '}
                  {item.placementType === 'UNSCHEDULED' || !item.targetDate
                    ? '날짜 미정'
                    : formatDateKo(item.targetDate)}
                </span>
              </label>
              {item.description && <p className="plan-item-reason">{item.description}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** courseId가 없는 항목은 "기타"로 묶는다. "미분류"라고 쓰지 않는다. */
function groupItems(items, projectTitles) {
  const map = new Map();
  for (const item of items) {
    const key = item.courseId != null ? String(item.courseId) : UNGROUPED_KEY;
    if (!map.has(key)) {
      map.set(key, {
        key,
        title: item.courseId != null ? (projectTitles[item.courseId] || '프로젝트') : '기타',
        items: [],
      });
    }
    map.get(key).items.push(item);
  }
  return [...map.values()].sort((a, b) => {
    if (a.key === UNGROUPED_KEY) return 1;
    if (b.key === UNGROUPED_KEY) return -1;
    return a.title.localeCompare(b.title, 'ko');
  });
}

/**
 * 8일 이상 계획은 오늘부터 7일 안에 걸치는 항목이 있는 그룹만 펼치고 나머지는 접는다.
 * "이번 주 8개 + 나머지 22개 접힘"이면 지금 판단할 것만 보인다.
 */
function initialCollapsed(draft, projectTitles, todayIso) {
  if (!draft || (draft.days ?? 0) <= 7) return new Set();
  const soonEnd = addDays(todayIso, 6);
  const collapsed = new Set();
  for (const group of groupItems(draft.proposal?.items ?? [], projectTitles)) {
    const hasSoon = group.items.some(
      (item) => item.placementType === 'UNSCHEDULED' || !item.targetDate
        || (item.targetDate >= todayIso && item.targetDate <= soonEnd),
    );
    if (!hasSoon) collapsed.add(group.key);
  }
  return collapsed;
}
