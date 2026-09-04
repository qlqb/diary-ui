/**
 * 계획 만들기 — 기간을 고르고, 초안을 받고, 확정한다.
 *
 * 강도는 초안 생성 **전에** 정해진다. 초안이 나온 뒤 강도를 바꾸는 것은 결국 다시 생성하는
 * 것과 같으므로 초안 화면에는 강도 변경을 두지 않는다. 그리고 기본값이 직전 계획에서
 * 이어지므로 매번 고르게 하지도 않는다 — 평소에는 한 줄로 접혀 있다.
 *
 * 초안 검토(PlanDraftReview)는 AI 패널에서 만든 기간 계획과 같은 컴포넌트다. 어느 탭에서
 * 시작했든 검토·확정 화면과 API는 같다 — initialDraft로 그 초안을 받아 바로 검토로 시작한다.
 */

import { useEffect, useMemo, useState } from 'react';
import { CalendarRange, Sparkles } from 'lucide-react';
import { planAPI } from '../../api/api.js';
import { PLAN_INTENSITY_HINT, PLAN_INTENSITY_LABEL, PlanIntensity } from '../../types/execution.js';
import { addDays, daysBetween, formatMinutes, periodPresets, toIsoDate } from '../../lib/planTime.js';
import PlanDraftReview from './PlanDraftReview.jsx';

const MAX_PLAN_DAYS = 31;

export default function PlanCreateView({
  projectTitles = {}, scopeCourseId = null, onClearScope, onConfirmed, onCancel,
  initialDraft = null, onInitialDraftCleared, onOpenSchedule,
}) {
  const todayIso = useMemo(() => toIsoDate(new Date()), []);
  const presets = useMemo(() => periodPresets(todayIso), [todayIso]);

  const [startDate, setStartDate] = useState(todayIso);
  const [endDate, setEndDate] = useState(addDays(todayIso, 6));
  const [intensity, setIntensity] = useState(null);
  const [intensityOpen, setIntensityOpen] = useState(false);
  const [instruction, setInstruction] = useState('');

  const [draft, setDraft] = useState(initialDraft);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  /** 확정 이력이 없으면(=첫 계획) 강도를 펼친 상태로 시작한다. */
  const [hasHistory, setHasHistory] = useState(true);

  // AI 패널에서 만든 기간 계획이 넘어오면 그 초안으로 검토를 시작한다. 같은 초안이 다시 오면 무시한다.
  useEffect(() => {
    if (initialDraft) setDraft(initialDraft);
  }, [initialDraft]);

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

  const clearDraft = () => {
    setDraft(null);
    if (initialDraft) onInitialDraftCleared?.();
  };

  const applyPreset = (preset) => {
    setStartDate(preset.startDate);
    setEndDate(preset.endDate);
    clearDraft();
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
    } catch (err) {
      setError(err.message || '초안을 만들지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const fromAi = draft != null && initialDraft != null && draft === initialDraft;

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
      {scopeCourseId != null && !fromAi && (
        <p className="plan-scope">
          {projectTitles[scopeCourseId] ?? '이 프로젝트'} 항목만 제안받아요.
          {onClearScope && (
            <button type="button" className="btn-ghost btn-sm"
              onClick={() => { onClearScope(); clearDraft(); }}>
              전체 프로젝트로
            </button>
          )}
        </p>
      )}

      {fromAi && (
        <p className="plan-scope">AI 대화에서 만든 기간 계획이에요. 여기서 검토하고 확정해요.</p>
      )}

      {!fromAi && (
        <>
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
                onChange={(e) => { setStartDate(e.target.value); clearDraft(); }} />
              <span>~</span>
              <input type="date" value={endDate} min={startDate}
                onChange={(e) => { setEndDate(e.target.value); clearDraft(); }} />
              <span className="plan-period-days">{periodValid ? `${days}일` : '기간을 다시 골라주세요'}</span>
            </div>
            {!periodValid && days > MAX_PLAN_DAYS && (
              <p className="hint">한 번에 세울 수 있는 계획은 31일까지예요. 그보다 길면 계획이라기보다 목표에 가까워요.</p>
            )}
          </div>

          <IntensityPicker
            intensity={intensity}
            draft={draft}
            open={intensityOpen}
            onToggle={() => setIntensityOpen((v) => !v)}
            onSelect={(value) => { setIntensity(value); clearDraft(); }}
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
        </>
      )}

      {error && <p className="error-text">{error}</p>}

      {draft && (
        <PlanDraftReview
          key={draft.proposalId ?? 'no-time'}
          draft={draft}
          projectTitles={projectTitles}
          todayIso={todayIso}
          onConfirmed={(plan) => { if (initialDraft) onInitialDraftCleared?.(); onConfirmed?.(plan); }}
          onDiscard={clearDraft}
          discardLabel={fromAi ? '이 초안 버리기' : '다시 만들기'}
          onOpenSchedule={onOpenSchedule}
        />
      )}
    </section>
  );
}

/**
 * 강도 선택. 평소에는 한 줄로 접혀 있고 [강도 바꾸기]를 눌러야 펼쳐진다.
 *
 * 강도는 "남는 시간의 몇 %를 공부로 채울지"다. 초안이 있으면 그 기간의 실제 숫자
 * (추정 남는 시간 중 학습 목표)를 함께 보여준다 — 라벨만으로는 `집중`이 얼마나 집중인지 모른다.
 */
function IntensityPicker({ intensity, draft, open, onToggle, onSelect, firstPlan }) {
  const shown = intensity ?? draft?.intensity;

  /*
   * 첫 계획이면 "직전 계획과 같은 강도"라고 말하지 않는다 — 직전 계획이 없기 때문이다.
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
          {draft?.targetMinutes != null && (
            <>
              {' · '}
              {draft.estimatedAvailableMinutes != null
                ? `남는 시간 약 ${formatMinutes(draft.estimatedAvailableMinutes)} 중 ${formatMinutes(draft.targetMinutes)}`
                : `약 ${formatMinutes(draft.targetMinutes)}`}
            </>
          )}
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
          <p className="hint">이번 기간의 남는 시간 중 어느 정도를 공부로 채울까요? 나중에 조정할 수 있어요.</p>
          {firstPlan && <p className="hint">처음이라면 보통으로 그냥 넘어가도 괜찮아요.</p>}
        </div>
      )}
    </div>
  );
}
