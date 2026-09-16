/**
 * 계획 만들기 — 기간을 고르고, 초안을 받고, 확정한다.
 *
 * 강도는 초안 생성 **전에** 정해진다. 초안이 나온 뒤 강도를 바꾸는 것은 결국 다시 생성하는
 * 것과 같으므로 초안 화면에는 강도 변경을 두지 않는다. 그리고 기본값이 직전 계획에서
 * 이어지므로 매번 고르게 하지도 않는다 — 평소에는 한 줄로 접혀 있다.
 *
 * 초안 검토(PlanDraftReview)는 AI 패널에서 만든 기간 계획과 같은 컴포넌트다. 어느 탭에서
 * 시작했든 검토·확정 화면과 API는 같다 — initialDraft로 그 초안을 받아 바로 검토로 시작한다.
 *
 * 「이번만 빼기」·되돌리기·「이미 알아요」 뒤 재생성은 계획 화면이든 상담 초안이든 서버의
 * [같은 조건으로 다시 만들기](planAPI.redraft)를 쓴다. 기간·강도·범위·지시·지정 자료는 초안을 만든 요청을
 * 서버가 들고 있고, 화면은 바뀐 제외 목록만 보낸다 — 상담 초안을 이 화면의 기본 날짜와 빈 지시로 다시
 * 조립하지 않기 위해서다. 제외 목록도 화면이 따로 들지 않고 초안 응답(requestContext)에서 읽는다.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarRange, Sparkles, X } from 'lucide-react';
import { planAPI } from '../../api/api.js';
import PlanAskCard from './PlanAskCard.jsx';
import { PLAN_INTENSITY_HINT, PLAN_INTENSITY_LABEL, PlanIntensity } from '../../types/execution.js';
import { addDays, daysBetween, formatMinutes, periodPresets, toIsoDate } from '../../lib/planTime.js';
import PlanDraftReview from './PlanDraftReview.jsx';

const MAX_PLAN_DAYS = 31;

function newRequestKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `plan-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** 같은 작성 흐름인가를 가르는 열쇠. 기간·범위·지정 자료가 같으면 같은 흐름이다. */
function flowKeyOf(startDate, endDate, scopeCourseId, requestedIds) {
  return [startDate, endDate, scopeCourseId ?? 'all', [...requestedIds].sort((a, b) => a - b).join(',')].join('|');
}

/** 세션에 남기는 "열린 초안" id의 키. 탭마다 따로다. */
const RECOVER_KEY = 'plan.create.openProposalId';

export default function PlanCreateView({
  projectTitles = {}, scopeCourseId = null, onClearScope, onConfirmed, onCancel,
  initialDraft = null, onInitialDraftCleared, onOpenSchedule, onOpenSource,
  requestedMaterials = [], onClearRequestedMaterial,
}) {
  const todayIso = useMemo(() => toIsoDate(new Date()), []);
  const presets = useMemo(() => periodPresets(todayIso), [todayIso]);

  const [startDate, setStartDate] = useState(todayIso);
  const [endDate, setEndDate] = useState(addDays(todayIso, 6));
  const [intensity, setIntensity] = useState(null);
  const [intensityOpen, setIntensityOpen] = useState(false);
  const [instruction, setInstruction] = useState('');

  const [draft, setDraft] = useState(initialDraft);
  /**
   * 새로고침·탭 이동 뒤 복구. 열린 초안의 id만 세션에 남기고, 돌아오면 저장된 초안을 서버에서 다시 읽는다(모델 호출
   * 없음). 초안을 버리거나 확정하면 지운다. 브라우저가 들고 있던 초안 내용은 믿지 않는다 — 저장된 것이 원본이다.
   */
  const rememberDraft = (next) => {
    try {
      if (next?.proposalId != null) sessionStorage.setItem(RECOVER_KEY, String(next.proposalId));
      else sessionStorage.removeItem(RECOVER_KEY);
    } catch { /* 세션 저장은 보조 수단이다 */ }
  };
  /**
   * 지금 보고 있는 초안. 되돌리기처럼 예전 렌더에서 만든 콜백도 "지금 초안"을 기준으로 다시 만들어야 한다 —
   * 옛 초안 id로 보내면 서버가 이미 폐기한 초안이라며 거절한다.
   */
  const draftRef = useRef(initialDraft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  /**
   * 초안 위에 띄우는 한 줄 안내와 되돌리기. 검토 컴포넌트는 초안이 바뀔 때마다 새로 만들어지므로(key=proposalId)
   * 그 안에 두면 되돌리기가 초안이 도착하는 순간 사라진다 — 여기서 들고 있어야 되돌릴 수 있다.
   */
  const [notice, setNotice] = useState(null);
  /**
   * 「이미 알아요」 표시는 저장했는데 초안을 다시 만들지 못한 상태. 이때 옛 초안을 그대로 확정하면 방금 표시한 내용이
   * 계획에 남는다 — 확정을 막고 다시 만들기·표시 되돌리기를 준다.
   */
  const [blocked, setBlocked] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  /**
   * 서버가 실제로 밟은 생성 단계("자료 확인 중", "계획 정리 중"). 요청 키로 진행 상태를 물어 본다 — 모델이 완료를
   * 선언하는 문구가 아니라 서버가 옮긴 단계다. 조회가 안 되면 기본 문구만 보인다.
   */
  const [stageLabel, setStageLabel] = useState(null);
  const activeKey = useRef(null);
  useEffect(() => {
    if (!loading || !activeKey.current || !planAPI?.draftProgress) return undefined;
    const key = activeKey.current;
    let cancelled = false;
    const poll = async () => {
      try {
        const state = await planAPI.draftProgress(key);
        if (!cancelled && state?.known && state.label && activeKey.current === key) setStageLabel(state.label);
      } catch { /* 진행 상태는 보조 정보다 — 못 읽어도 생성은 계속된다 */ }
    };
    poll();
    const timer = setInterval(poll, 1500);
    return () => { cancelled = true; clearInterval(timer); };
  }, [loading]);
  /** 확정 이력이 없으면(=첫 계획) 강도를 펼친 상태로 시작한다. */
  const [hasHistory, setHasHistory] = useState(true);
  /**
   * 요청 순번. 기간을 바꾸거나 새 요청을 보내면 올린다 — 이전 요청의 늦은 응답이 지금 화면을 덮지 않게 한다.
   * 진행 중 여부(inFlight)도 ref로 둔다: 되돌리기처럼 예전 렌더에서 만든 콜백이 중복 요청을 보내지 않게.
   */
  const ticket = useRef(0);
  const inFlight = useRef(false);
  /** [다시 만들기]로 초안을 비웠을 때, 같은 흐름이면 이어 받을 제외 목록. */
  const carry = useRef(null);

  const requestedIds = useMemo(() => requestedMaterials.map((m) => m.materialId), [requestedMaterials]);
  const flowKey = flowKeyOf(startDate, endDate, scopeCourseId, requestedIds);
  const flowRef = useRef(flowKey);
  useEffect(() => {
    if (flowRef.current !== flowKey) {
      flowRef.current = flowKey;
      ticket.current += 1; // 흐름이 바뀌면 진행 중이던 요청의 응답은 버린다.
      carry.current = null;
      inFlight.current = false;
    }
  }, [flowKey]);

  // AI 패널에서 만든 기간 계획이 넘어오면 그 초안으로 검토를 시작한다. 같은 초안이 다시 오면 무시한다.
  useEffect(() => {
    if (initialDraft) {
      ticket.current += 1;
      setDraft(initialDraft);
      setNotice(null);
      setBlocked(null);
    }
  }, [initialDraft]);

  useEffect(() => {
    if (initialDraft || !planAPI?.loadDraft) return undefined;
    let saved = null;
    try { saved = sessionStorage.getItem(RECOVER_KEY); } catch { saved = null; }
    if (!saved) return undefined;
    let cancelled = false;
    const mine = ticket.current + 1;
    ticket.current = mine;
    Promise.resolve(planAPI.loadDraft(saved))
      .then((stored) => {
        if (cancelled || ticket.current !== mine) return;
        const status = stored?.proposal?.status;
        if (stored?.proposalId != null && (!status || status === 'PROPOSED')) {
          setDraft(stored);
          setNotice({ message: '새로고침 전에 만들던 초안을 다시 불러왔어요.' });
        } else {
          rememberDraft(null);
        }
      })
      .catch(() => { if (!cancelled) rememberDraft(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  /** 상담에서 만든 초안인가. 객체 동일성이 아니라 서버가 남긴 요청의 출처로 본다 — 다시 만든 뒤에도 같다. */
  const fromConversation = draft?.requestContext?.source === 'CONVERSATION'
    || (draft != null && initialDraft != null && draft === initialDraft && !draft.requestContext);
  const excludedTopics = draft?.requestContext?.excludedTopics ?? [];
  const redraftable = !!draft?.requestContext?.redraftable && draft?.proposalId != null;

  const clearDraft = ({ keepFlow = false } = {}) => {
    if (keepFlow && draft?.requestContext && !fromConversation) {
      carry.current = { key: flowKey, excludedTopics: draft.requestContext.excludedTopics ?? [] };
    } else {
      carry.current = null;
    }
    ticket.current += 1; // 진행 중이던 요청의 응답은 버린다.
    inFlight.current = false;
    setLoading(false);
    setDraft(null);
    rememberDraft(null);
    setNotice(null);
    setBlocked(null);
    if (initialDraft) onInitialDraftCleared?.();
  };

  const applyPreset = (preset) => {
    setStartDate(preset.startDate);
    setEndDate(preset.endDate);
    clearDraft();
  };

  /**
   * 새 초안 요청. 되묻기에 답한 뒤의 재요청도 같은 경로를 지난다 — 답만 함께 실어 보낸다.
   * 제외 목록은 [다시 만들기]로 비운 같은 흐름에서만 이어 받는다 — 기간·범위·지정 자료가 바뀌었으면 새 계획이다.
   */
  const handleDraft = async (answer = null) => {
    if (!periodValid || inFlight.current) return false;
    const mine = ticket.current + 1;
    ticket.current = mine;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    const carried = carry.current && carry.current.key === flowKey ? carry.current.excludedTopics : [];
    const requestKey = newRequestKey();
    activeKey.current = requestKey;
    setStageLabel(null);
    try {
      const result = await planAPI.createDraft({
        requestKey,
        startDate, endDate, intensity,
        instruction: instruction.trim() || null,
        // 프로젝트 화면에서 들어왔으면 그 프로젝트만 대상으로 한다. 안 넘기면 서버가
        // 전체 ACTIVE 프로젝트를 대상으로 잡아, 누른 버튼과 결과가 어긋난다.
        courseIds: scopeCourseId != null ? [scopeCourseId] : null,
        familiarityAnswer: answer?.familiarityAnswer ?? null,
        familiarityTopicIds: answer?.familiarityTopicIds ?? null,
        excludeTopicIds: carried.length > 0 ? carried.map((e) => e.topicId) : null,
        requestedMaterialIds: requestedIds.length > 0 ? requestedIds : null,
      });
      if (ticket.current !== mine) return false;
      carry.current = null;
      setDraft(result);
      rememberDraft(result);
      return true;
    } catch (err) {
      if (ticket.current === mine) setError(err.message || '초안을 만들지 못했습니다.');
      return false;
    } finally {
      if (ticket.current === mine) {
        inFlight.current = false;
        setLoading(false);
        setStageLabel(null);
      }
    }
  };

  /**
   * 같은 조건으로 다시 만들기. 실패하면 지금 초안과 그 제외 목록을 그대로 둔다(서버도 옛 초안을 폐기하지 않는다).
   * 늦게 온 응답은 지금 보고 있는 초안이 그 요청의 원본일 때만 반영한다.
   *
   * @param changes { excludeTopicIds?, requestedMaterialIds? } — 없는 필드는 서버에 남은 값을 유지
   */
  const redraft = async (changes = {}) => {
    const source = draftRef.current;
    if (!source?.proposalId || inFlight.current) return false;
    const mine = ticket.current + 1;
    ticket.current = mine;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    const requestKey = newRequestKey();
    activeKey.current = requestKey;
    setStageLabel(null);
    try {
      const result = await planAPI.redraft(source.proposalId, { ...changes, requestKey });
      if (ticket.current !== mine) return false;
      setDraft(result);
      rememberDraft(result);
      return true;
    } catch (err) {
      if (ticket.current === mine) setError(err.message || '초안을 다시 만들지 못했어요. 지금 초안은 그대로예요.');
      return false;
    } finally {
      if (ticket.current === mine) {
        inFlight.current = false;
        setLoading(false);
        setStageLabel(null);
      }
    }
  };

  /**
   * 「이번만 빼기」: 그 항목을 이번 요청에서만 빼고 초안을 다시 만든다. 표식은 남지 않는다.
   * 되돌리기는 그 항목 하나를 목록에서 빼고 다시 만든다 — 목록만 지우면 화면의 초안에는 여전히 그 항목이 없어서
   * "되돌렸다"는 말이 거짓이 된다. 되돌리기는 후보 자격을 돌려주는 것이지 모델이 다시 고른다는 보장은 아니다.
   */
  const excludeThisTime = async (topicId, title) => {
    if (topicId == null) return;
    const ids = excludedTopics.map((e) => e.topicId);
    const next = ids.includes(topicId) ? ids : [...ids, topicId];
    setNotice(null);
    if (!(await redraft({ excludeTopicIds: next }))) return;
    setNotice({
      message: `「${title}」은(는) 이번 계획에서만 뺐어요. 다음 계획에는 다시 후보로 돌아와요.`,
      undo: () => restoreExcluded(topicId),
    });
  };

  /** 「이번만 빼기」 되돌리기. topicId가 null이면 전부. 목록은 지금 초안의 것을 기준으로 고친다. */
  const restoreExcluded = async (topicId = null) => {
    setNotice(null);
    const currentIds = (draftRef.current?.requestContext?.excludedTopics ?? []).map((e) => e.topicId);
    const next = topicId == null ? [] : currentIds.filter((id) => id !== topicId);
    const ok = await redraft({ excludeTopicIds: next });
    if (ok && topicId != null) {
      setNotice({ message: '다시 후보로 돌려놓았어요. 계획에 들어갈지는 AI가 다시 판단해요.' });
    }
  };

  /** 「이미 알아요」 뒤 다시 만들기(검토 화면이 부른다). 실패하면 확정을 막는다. */
  const redraftAfterMark = async (mark) => {
    const ok = await redraft({});
    if (!ok && mark) {
      setBlocked({
        message: '「이미 알아요」 표시는 저장했지만 초안에 아직 반영하지 못했어요. 이 초안을 그대로 확정하면 표시한 내용이 남아요.',
        retry: async () => { if (await redraft({})) setBlocked(null); },
        undo: mark.undo,
      });
    } else if (ok) {
      setBlocked(null);
    }
    return ok;
  };

  /** 이름이 같은 자료가 여럿이라 지정하지 못했을 때 사용자가 고른 자료로 다시 만든다. */
  const chooseRequestedMaterial = async (materialId) => {
    const explicit = (draft?.requestContext?.requestedMaterials ?? [])
      .filter((m) => m.source === 'EXPLICIT').map((m) => m.materialId);
    await redraft({ requestedMaterialIds: [...new Set([...explicit, materialId])] });
  };

  // 상담 초안은 대화에서 정한 범위가 기준이다 — 이 화면에 남아 있던 이전 범위를 제목에 쓰지 않는다.
  const conversationCourseIds = draft?.requestContext?.courseIds ?? [];
  const headerCourseId = fromConversation
    ? (conversationCourseIds.length === 1 ? conversationCourseIds[0] : null)
    : scopeCourseId;

  return (
    <section className="plan-create">
      <header className="view-head">
        <h1>
          <CalendarRange size={20} />
          {headerCourseId != null && projectTitles[headerCourseId]
            ? `${projectTitles[headerCourseId]} 계획 만들기`
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
      {scopeCourseId != null && !fromConversation && (
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

      {!fromConversation && requestedMaterials.length > 0 && (
        <p className="plan-scope plan-requested-materials">
          이번 계획은 이 자료 중심으로 봐요:
          {requestedMaterials.map((m) => (
            <span key={m.materialId} className="chip">
              {m.filename}
              {onClearRequestedMaterial && (
                <button type="button" className="icon-btn" aria-label={`${m.filename} 지정 해제`}
                  onClick={() => { onClearRequestedMaterial(m.materialId); clearDraft(); }}>
                  <X size={12} />
                </button>
              )}
            </span>
          ))}
        </p>
      )}

      {fromConversation && (
        <p className="plan-scope">AI 대화에서 만든 기간 계획이에요. 여기서 검토하고 확정해요.</p>
      )}

      {!fromConversation && (
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
              placeholder="예: 시험 전까지 자료구조 위주로, 개념부터"
              onChange={(e) => setInstruction(e.target.value)}
            />
          </label>

          {!draft && (
            <button type="button" className="btn-primary" disabled={!periodValid || loading}
              onClick={() => handleDraft()}>
              <Sparkles size={16} /> {loading ? `${stageLabel ?? '자료를 고르고 초안을 만들고 있어요'}…` : '초안 만들기'}
            </button>
          )}
        </>
      )}

      {error && <p className="error-text" role="alert">{error}</p>}

      {/*
        되묻는 중이면 초안이 없다. 만들어 놓고 묻지 않는 이유는, 만들어진 계획이 그 자체로
        화면의 기준점이 되어 사용자가 답을 고르기 전에 이미 대답을 유도하기 때문이다.
      */}
      {draft?.ask && (
        <PlanAskCard ask={draft.ask} answering={loading} onAnswer={(answer) => handleDraft(answer)} />
      )}

      {notice && (
        <p className="plan-toast" role="status">
          {notice.message}
          {notice.undo && (
            <button type="button" className="btn-ghost btn-sm" disabled={loading}
              onClick={() => { const undo = notice.undo; setNotice(null); undo(); }}>
              되돌리기
            </button>
          )}
        </p>
      )}
      {blocked && (
        <p className="plan-toast plan-toast-warn" role="alert">
          {blocked.message}
          <button type="button" className="btn-ghost btn-sm" disabled={loading} onClick={blocked.retry}>초안 다시 만들기</button>
          {blocked.undo && (
            <button type="button" className="btn-ghost btn-sm" disabled={loading}
              onClick={async () => { const undo = blocked.undo; setBlocked(null); await undo(); }}>
              표시 되돌리기
            </button>
          )}
        </p>
      )}
      {excludedTopics.length > 0 && (
        <p className="hint">
          이번 계획에서만 뺀 항목: {excludedTopics.map((e) => e.title ?? `항목 ${e.topicId}`).join(', ')}
          {' — 다음 계획에는 다시 후보로 돌아와요.'}
          {redraftable && (
            <button type="button" className="btn-ghost btn-sm" disabled={loading}
              onClick={() => restoreExcluded(null)}>
              모두 되돌리기
            </button>
          )}
        </p>
      )}
      {loading && draft && (
        <p className="hint" role="status">
          같은 조건으로 초안을 다시 만들고 있어요{stageLabel ? ` — ${stageLabel}` : ''}…
        </p>
      )}

      {draft && !draft.ask && (
        <PlanDraftReview
          key={draft.proposalId ?? 'no-time'}
          draft={draft}
          projectTitles={projectTitles}
          todayIso={todayIso}
          onConfirmed={(plan) => { rememberDraft(null); if (initialDraft) onInitialDraftCleared?.(); onConfirmed?.(plan); }}
          onDiscard={() => clearDraft({ keepFlow: true })}
          discardLabel={fromConversation ? '이 초안 버리기' : '다시 만들기'}
          onOpenSchedule={onOpenSchedule}
          onOpenSource={onOpenSource}
          onExcludeThisTime={redraftable ? excludeThisTime : null}
          onRedraft={redraftable ? redraftAfterMark : null}
          onNotify={setNotice}
          busy={loading}
          confirmBlockedReason={blocked ? '방금 표시한 내용이 초안에 반영될 때까지 확정할 수 없어요'
            : (loading ? '초안을 다시 만드는 중이에요' : null)}
          onChooseRequestedMaterial={redraftable ? chooseRequestedMaterial : null}
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
