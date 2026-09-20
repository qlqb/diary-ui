/**
 * 기간 계획 초안 검토 — 어느 진입점(계획 탭, 오늘/일정/프로젝트의 AI 패널)에서 만들었든
 * 같은 화면이다. 받는 것은 서버의 PlanDraftResponse 하나이고, 확정은 항상
 * /api/plans/proposals/{id}/confirm(PlanVersion 확정)이다. 일반 제안의 "변경 N개 적용"
 * 바는 여기서 쓰지 않는다.
 *
 * 사용자가 조정하는 대상은 개수가 아니라 부하다. 맨 위 요약(PlanDraftOverview)은 실제로 고른 양(항목 수·합계)을
 * 먼저 말하고, 예산은 "상한"이라고 작게 덧붙인다 — 예산은 채워야 하는 양이 아니라서 얼마나 덜 채웠는지는
 * 어디에도 적지 않는다. 체크를 풀거나 시간을 고치면 합계와 여유가 바로 바뀐다.
 *
 * 정확한 시각은 확정 전에 기존 배치 미리보기(SchedulePreview, OpenAI 호출 없음)로 첫 7일만
 * 계산해 보여준다. 8일 이상 계획의 나머지는 미배치로 남고 "해당 주가 가까워지면 배치"라고
 * 말한다. 미리보기에서 배치된 시각은 확정 요청의 editedItems로 그대로 실린다.
 *
 * 호출부는 초안이 바뀔 때 key(proposalId)를 바꿔 이 컴포넌트를 새로 만든다 — 검토 상태
 * (제외·접힘·제목)는 초안마다 처음부터 시작한다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Clock3 } from 'lucide-react';
import { planAPI, schedulePreviewAPI, topicAPI } from '../../api/api.js';
import { PLAN_INTENSITY_LABEL } from '../../types/execution.js';
import { formatDateKo, formatMinutes } from '../../lib/planTime.js';
import { groupItems, initialCollapsed, placementsToEditedItems } from '../../lib/planDraft.js';
import {
  ACTION_TYPE_LABEL, EXISTING_ACTION_LABEL, ITEM_ORIGIN_LABEL, PRIORITY_LABEL, TREATMENT_LABEL, describeDeadline,
  formatEstimate,
} from '../../lib/planLabels.js';
import { buildEvidenceSummary } from '../../lib/planEvidence.js';
import { acquirePreview, previewInputKey, replacePreview, storedOrRecompute } from '../../ai/previewSolveCache.js';
import MaterialFileLink from '../../components/MaterialFileLink.jsx';
import PlanDraftOverview from './PlanDraftOverview.jsx';
import PlanStrategyPanel from './PlanStrategyPanel.jsx';
import PlanProvenancePanel, { ItemEvidence } from './PlanProvenance.jsx';
import PlanItemDetail from './PlanItemDetail.jsx';
import PlanMaterialSelection from './PlanMaterialSelection.jsx';

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

function itemIds(draft) {
  return new Set((draft?.proposal?.items ?? []).map((i) => i.proposalItemId));
}

/**
 * 검토 상태 복구. 같은 초안이면 서버에 저장된 상태(draft.reviewState)를 그대로. 다시 만든 초안이면 이전 초안의 상태
 * (initialReview) 중 안정된 식별자로 대응되는 것만 옮긴다 — 기존 항목 변경은 targetExecutionItemId로 찾고, 새 항목의 제외는
 * id가 바뀌어 옮기지 않는다. 옮기지 못한 것이 있으면 사용자에게 말한다.
 */
function restoreReview(draft, initialReview) {
  const ids = itemIds(draft);
  const stored = draft?.reviewState;
  if (stored) {
    const kept = (stored.excludedProposalItemIds ?? []).filter((id) => ids.has(id));
    // 직접 고친 예상 시간. 검토 상태에 저장돼 있으면 새로고침 뒤에도 그대로다.
    const minutes = new Map((stored.editedItems ?? [])
      .filter((e) => ids.has(e.proposalItemId) && e.expectedMinutes != null)
      .map((e) => [e.proposalItemId, e.expectedMinutes]));
    return { excluded: new Set(kept), title: stored.title ?? null, note: null, minutes };
  }
  if (!initialReview) return { excluded: new Set(), title: null, note: null, minutes: new Map() };
  const items = draft?.proposal?.items ?? [];
  const byTarget = new Map(items.filter((i) => i.targetExecutionItemId != null).map((i) => [i.targetExecutionItemId, i.proposalItemId]));
  const excluded = new Set();
  let lost = 0;
  for (const prev of initialReview.excludedItems ?? []) {
    if (prev.targetExecutionItemId != null && byTarget.has(prev.targetExecutionItemId)) {
      excluded.add(byTarget.get(prev.targetExecutionItemId));
    } else {
      lost += 1;
    }
  }
  return {
    excluded,
    title: initialReview.title ?? null,
    minutes: new Map(),
    note: lost > 0 ? `이전 초안에서 뺀 새 항목 ${lost}개는 다시 만든 초안에 그대로 옮기지 못했어요. 항목을 다시 확인해 주세요.` : null,
  };
}

export default function PlanDraftReview({
  draft, projectTitles = {}, todayIso, onConfirmed, onDiscard, discardLabel = '다시 만들기', onOpenSchedule,
  onOpenSource, onExcludeThisTime = null, onRedraft = null, onNotify = null,
  busy = false, confirmBlockedReason = null, onChooseRequestedMaterial = null, initialReview = null,
  onReviewStateChange = null,
  /*
   * 상담과 이어지는 부분. 전부 선택이다 — 없으면 그 조각만 안 보인다.
   * stale/onRemake: 최신 답변을 반영하기 전 버전임을 표시하고 다시 만들게 한다(서버의 freshness도 함께 본다).
   * remaking: 다시 만드는 중. 이 화면은 그동안 이전 버전을 그대로 보여 준다.
   * outcome: 다시 만든 결과가 알려 준 것(무엇이 바뀌었나·옮겨 온 편집·부딪친 편집).
   */
  stale = false, staleReasons = [], remaking = false, remakeStageLabel = null, onRemake = null, outcome = null,
  onAnswerQuestion = null, onContinueConsult = null,
}) {
  /*
   * 검토 상태(제목·항목 포함/제외)는 서버 초안에 붙어 온다(draft.reviewState). 새로고침·탭 이동 뒤에도 같은 초안이면 그대로
   * 복구되고, 다시 만든 초안(initialReview)에는 안정된 식별자(기존 항목 변경의 targetExecutionItemId)가 있는 선택만 옮긴다.
   * 새 항목의 제외는 id가 바뀌어 옮기지 않고 사용자에게 말한다 — 제목만으로 억지로 맞추지 않는다.
   */
  const restored = useMemo(() => restoreReview(draft, initialReview), [draft, initialReview]);
  const [excluded, setExcluded] = useState(() => restored.excluded);
  /*
   * 안내 상세도. 기본은 간단히. 전체 전환과 항목 하나만 펼치기가 있고, 어느 쪽도 항목·선택·시간·마감·
   * 배치를 바꾸지 않는다 — 설명을 펼치는 동작일 뿐이다. 영구 선호로 저장하지 않는다.
   */
  const [detailAll, setDetailAll] = useState(false);
  const [detailOpen, setDetailOpen] = useState(() => new Set());
  const [collapsed, setCollapsed] = useState(() => initialCollapsed(draft, projectTitles, todayIso));
  const [title, setTitle] = useState(() => restored.title || draft?.suggestedTitle || '');
  const reviewVersion = useRef(draft?.reviewState?.version ?? null);
  const reviewSaveTicket = useRef(0);
  const [reviewNote, setReviewNote] = useState(restored.note);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewNote, setPreviewNote] = useState(null);
  /*
   * 일정(배치 미리보기)을 못 읽었다. "일정이 없다"와 다른 사실이다 — 이때는 "등록된 일정이 없어 가정했다"는
   * 문구를 띄우지 않고, 못 읽었다고 말하고 다시 시도하게 한다.
   */
  const [previewFailed, setPreviewFailed] = useState(false);
  const [previewReload, setPreviewReload] = useState(0);
  /** 직접 고친 예상 시간(proposalItemId → 분). 원래 값과 같아지면 지운다. */
  const [minutesEdits, setMinutesEdits] = useState(() => restored.minutes ?? new Map());
  const [minutesOpen, setMinutesOpen] = useState(() => new Set());
  /** 다시 만든 초안에서 내 편집과 새 제안이 달랐던 값. 기본은 내 값 유지다. */
  const [conflictChoice, setConflictChoice] = useState({});
  const itemsRef = useRef(null);
  /*
   * 미리보기 요청 순번. 화면이 뜰 때의 요청과 확정 거절 뒤의 재계산이 겹칠 수 있는데, 늦게
   * 도착한 옛 응답이 새 응답을 덮으면 사용자는 방금 계산한 시각이 아니라 옛 시각을 확정한다.
   * 마지막으로 보낸 요청의 응답만 쓴다.
   */
  const previewRequest = useRef(0);
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
  const previewKey = useMemo(
    () => previewInputKey(proposalId, current?.proposal?.items ?? []),
    [proposalId, current],
  );
  useEffect(() => {
    if (!proposalId || noAvailableTime) return undefined;
    if (!schedulePreviewAPI?.get) return undefined;
    let cancelled = false;
    const ticket = previewRequest.current + 1;
    previewRequest.current = ticket;
    /*
     * 같은 제안·같은 입력의 미리보기는 한 번만 푼다. 셸의 초안 훅(useProposalDraft)이 이미 풀고 있으면 그
     * 결과를 나눠 받는다 — AI 패널에서 연 기간 계획이 같은 배치를 두 번 계산하지 않게.
     */
    const hold = acquirePreview(proposalId, previewKey, storedOrRecompute(schedulePreviewAPI, proposalId));
    hold.promise
      .then((result) => {
        if (cancelled || previewRequest.current !== ticket) return;
        setPreview(result ?? null);
        setPreviewFailed(false);
      })
      .catch(() => {
        if (cancelled || previewRequest.current !== ticket) return;
        setPreviewFailed(true);
      });
    return () => { cancelled = true; hold.release(); };
  }, [proposalId, noAvailableTime, previewKey, previewReload]);

  /*
   * 재생성하면 proposalId가 바뀌고 회차도 바뀐다. 옛 스냅샷을 들고 있으면 새 항목의
   * refId가 어디에도 안 맞아 "근거 없음"으로 보인다.
   */
  const [provenanceReload, setProvenanceReload] = useState(0);
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
  }, [proposalId, provenanceReload]);
  /*
   * 다시 읽어야 할 때: 요청이 안 됐거나, 원본 파일을 열지 못했을 때(지워짐·변경됨을 새로
   * 판단해야 한다). 검토 상태(제외·제목)는 건드리지 않는다.
   */
  const reloadProvenance = useCallback(() => setProvenanceReload((v) => v + 1), []);

  /*
   * 새 항목과 기존 항목 조정(줄이기·옮기기·빼기)을 나눈다. 재계획은 새 항목만 더해 기존 미완료 항목을 중복시키지 않는다 —
   * 기존 항목의 변경은 확정 때 함께 적용되는 별도 변경안이고, 체크를 풀면 그 변경만 빠진다.
   */
  const items = useMemo(() => (current?.proposal?.items ?? []).filter((i) => !i.operation || i.operation === 'CREATE'),
    [current]);
  const adjustments = useMemo(() => (current?.proposal?.items ?? []).filter((i) => i.operation && i.operation !== 'CREATE'),
    [current]);

  /** 항목 하나의 근거. 서버가 제안 항목 id로 내려주므로 화면이 제목으로 짝짓지 않는다. */
  const evidenceByItem = useMemo(() => {
    const map = new Map();
    (provenance?.items ?? []).forEach((one) => map.set(one.proposalItemId, one));
    return map;
  }, [provenance]);

  /*
   * 기본 AI 경로의 항목에는 topicId가 없다(판단 경로만 조각에 topic_id를 남긴다). 그 항목이 인용한 학습 항목
   * 줄(TOPIC 인용)이 있으면 그 id를 쓴다 — 회차에 실제로 준 것 중 모델이 고른 근거이지, 제목으로 짝지은 것이 아니다.
   */
  const topicIdOf = useCallback((item) => {
    if (item?.topicId != null) return item.topicId;
    const evidence = evidenceByItem.get(item?.proposalItemId);
    if (!evidence?.refIds?.length || !provenance?.providedSources) return null;
    const refs = new Set(evidence.refIds);
    const cited = provenance.providedSources.filter((s) => refs.has(s.refId));
    const topic = cited.find((s) => s.sourceType === 'TOPIC' && s.sourceId != null);
    if (topic) return topic.sourceId;
    // 구간만 인용한 항목: 그 구간이 어느 학습 항목 아래 실렸는지는 스냅샷(parentSourceId)이 안다.
    const section = cited.find((s) => s.sourceType === 'MATERIAL_SECTION' && s.parentSourceId != null);
    return section ? section.parentSourceId : null;
  }, [evidenceByItem, provenance]);

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
  const minutesOf = useCallback(
    (item) => (minutesEdits.has(item.proposalItemId) ? minutesEdits.get(item.proposalItemId) : (item.expectedMinutes || 0)),
    [minutesEdits],
  );
  const selectedMinutes = selectedItems.reduce((sum, item) => sum + minutesOf(item), 0);
  const allExcluded = items.length + adjustments.length > 0
    && items.every((i) => excluded.has(i.proposalItemId)) && adjustments.every((i) => excluded.has(i.proposalItemId));
  const longPlan = (current?.days ?? 0) > 7;

  /*
   * 자동 저장. 실행 데이터가 아니라 검토 상태다 — 저장돼도 일정은 바뀌지 않는다. 마지막 응답만 반영하고(늦은 응답 무시),
   * 다른 탭이 먼저 저장했으면(409) 서버의 최신 상태를 다시 읽어 화면을 맞춘다. 저장 실패는 검토를 막지 않는다.
   */
  const reviewStateEnabled = Boolean(proposalId) && Boolean(planAPI?.saveReviewState)
    && (current?.proposal?.status ?? 'PROPOSED') === 'PROPOSED';
  const excludedKey = useMemo(() => [...excluded].sort((a, b) => a - b).join(','), [excluded]);
  const minutesKey = useMemo(
    () => [...minutesEdits.entries()].sort((a, b) => a[0] - b[0]).map(([id, m]) => `${id}:${m}`).join(','),
    [minutesEdits],
  );
  const firstReviewRender = useRef(true);
  useEffect(() => {
    if (firstReviewRender.current) { firstReviewRender.current = false; return undefined; }
    // 상위 화면은 저장 여부와 무관하게 최신 검토 상태를 안다 — 다시 만들 때 안정된 선택을 옮기는 근거다.
    onReviewStateChange?.({ proposalId, title, excludedProposalItemIds: excludedKey ? excludedKey.split(',').map(Number) : [] });
    if (!reviewStateEnabled) return undefined;
    const ticket = reviewSaveTicket.current + 1;
    reviewSaveTicket.current = ticket;
    const timer = setTimeout(async () => {
      try {
        const saved = await planAPI.saveReviewState(proposalId, {
          version: reviewVersion.current,
          title: title.trim() || null,
          excludedProposalItemIds: excludedKey ? excludedKey.split(',').map(Number) : [],
          // 고친 시간이 있을 때만 싣는다. 다시 만들 때 서버가 이 값을 새 초안으로 옮겨 준다.
          ...(minutesEdits.size > 0
            ? { editedItems: [...minutesEdits.entries()].map(([id, m]) => ({ proposalItemId: id, expectedMinutes: m })) }
            : {}),
        });
        if (reviewSaveTicket.current === ticket && saved?.version != null) reviewVersion.current = saved.version;
      } catch (err) {
        if (reviewSaveTicket.current !== ticket) return;
        if (err?.code === 'E409_022' && planAPI?.loadDraft) {
          try {
            const latest = await planAPI.loadDraft(proposalId);
            const state = latest?.reviewState;
            if (reviewSaveTicket.current === ticket && state) {
              reviewVersion.current = state.version ?? null;
              setExcluded(new Set((state.excludedProposalItemIds ?? []).filter((id) => itemIds(current).has(id))));
              setTitle(state.title || current?.suggestedTitle || '');
              setReviewNote('다른 곳에서 먼저 저장된 검토 상태를 불러왔어요.');
            }
          } catch { /* 최신 상태를 못 읽어도 검토는 계속된다 */ }
        }
      }
    }, 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [excludedKey, minutesKey, title, proposalId, reviewStateEnabled]);

  /** 예상 시간을 고친다. 5~600분 밖의 값과 원래 값은 편집으로 치지 않는다. */
  const editMinutes = useCallback((item, value) => {
    const minutes = Math.round(Number(value));
    setMinutesEdits((prev) => {
      const next = new Map(prev);
      if (!Number.isFinite(minutes) || minutes < 5 || minutes > 600 || minutes === (item.expectedMinutes || 0)) {
        next.delete(item.proposalItemId);
      } else {
        next.set(item.proposalItemId, minutes);
      }
      return next;
    });
  }, []);

  /** 다시 만든 초안에서 부딪친 예상 시간. 기본은 내 값이고, 새 제안을 고르면 그 값으로 고친다. */
  const chooseConflict = useCallback((conflict, choice) => {
    setConflictChoice((prev) => ({ ...prev, [`${conflict.title}|${conflict.field}`]: choice }));
    const item = (current?.proposal?.items ?? []).find((i) => i.title === conflict.title);
    if (!item) return;
    editMinutes(item, choice === 'suggested' ? conflict.suggested : conflict.yours);
  }, [current, editMinutes]);

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
      setMinutesEdits(new Map());
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
  const redraftableDraft = Boolean(current?.requestContext?.redraftable);
  const markKnown = useCallback(async (topicId) => {
    if (topicId == null || regenerating) return;
    try {
      await topicAPI.updateUserMark(topicId, 'KNOWN');
    } catch (err) {
      setError(err.message || '표시를 저장하지 못했습니다.');
      return;
    }
    /*
     * 어느 경로로 다시 만드는가는 서버의 저장 계약(requestContext.redraftable = 원래 요청이 저장돼 있다)이 정한다 — 전략이
     * 있는지로 가르지 않는다. 새 운영 경로의 초안은 전략을 항상 갖고 있어서, 그 기준으로는 옛 조각 재생성으로 빠져
     * 지시·과목 범위·상담 합의·기존 항목 조정이 전부 사라졌다(2026-09-17 지시서 §4).
     */
    const commonPath = redraftableDraft && Boolean(onRedraft);
    if (commonPath || !strategy) {
      /*
       * 같은 조건으로 초안을 다시 만든다(계획 화면·상담 초안 공통, 서버가 원래 요청·합의·기존 항목을 그대로 쓴다). 표식은
       * 다음 계획에도 남는다(「이번만 빼기」와 다르다). 요청이 저장되지 않은 옛 초안(전략 없음)도 이 경로다 — 조각만
       * 다시 만들 판단이 없다.
       *
       * 안내와 되돌리기는 호출부(onNotify)에 맡긴다. 새 초안이 오면 이 컴포넌트는 key가 바뀌어 다시
       * 만들어지므로, 여기 둔 토스트는 초안이 도착하는 순간 사라져 되돌릴 수 없게 된다.
       * 다시 만들기가 실패하면 호출부가 확정을 막고 다시 만들기·표시 되돌리기를 준다 — 옛 초안이 방금 표시한 내용을
       * 담은 채 확정되지 않게.
       */
      const note = {
        message: '다음 계획부터도 이 내용은 건너뛸게요',
        undo: async () => {
          await topicAPI.updateUserMark(topicId, null);
          if (onRedraft) {
            const ok = await onRedraft(null);
            if (ok) onNotify?.({ message: '「이미 알아요」 표시를 지우고 다시 만들었어요' });
          }
        },
      };
      if (!onRedraft) {
        (onNotify ?? setToast)({ message: '표시는 저장했어요. 이 초안에는 반영되지 않았으니 새로 만들어 주세요.' });
        return;
      }
      const ok = await onRedraft(note);
      if (ok) (onNotify ?? setToast)(note);
      return;
    }
    await regenerate({
      message: '다음 계획부터도 이 내용은 건너뛸게요',
      undo: async () => {
        await topicAPI.updateUserMark(topicId, null);
        await regenerate(null);
      },
    });
  }, [regenerate, regenerating, strategy, onRedraft, onNotify, redraftableDraft]);

  const handleConfirm = async () => {
    if (!draft || confirming || allExcluded || confirmBlockedReason) return;
    setConfirming(true);
    setError(null);
    try {
      // 미리보기에서 승인한 시각을 그대로 싣는다. 배치되지 않은 항목은 원본(미배치) 그대로다.
      /*
       * 시간을 고친 항목은 미리보기의 시각을 싣지 않는다 — 그 시각은 고치기 전 길이로 잡은 것이라 그대로 확정하면
       * 끝 시각이 어긋난다. 고친 분량만 보내고, 시각은 확정 뒤 배치가 정한다.
       */
      const editedItems = [
        ...placementsToEditedItems(selectedItems.filter((i) => !minutesEdits.has(i.proposalItemId)), placedById),
        ...selectedItems.filter((i) => minutesEdits.has(i.proposalItemId))
          .map((i) => ({ proposalItemId: i.proposalItemId, expectedMinutes: minutesEdits.get(i.proposalItemId) })),
      ];
      const plan = await planAPI.confirm(proposalId, {
        excludedItemIds: [...excluded],
        editedItems: editedItems.length > 0 ? editedItems : null,
        title: title.trim() || current.suggestedTitle,
        goalSummary: current.goalSummary,
      });
      onConfirmed?.(plan);
    } catch (err) {
      /*
       * 미리보기 이후 일정이 바뀌어 겹치는 항목이 있으면 서버가 전체를 거절한다(E409_016).
       * 시각을 다시 계산해 보여주고 사용자가 다시 확정하게 한다 — 겹친 항목만 빼고 조용히
       * 확정하지 않는다. 선택·제목·제외는 그대로 둔다.
       */
      if (err.code === 'E409_016' && schedulePreviewAPI?.recompute) {
        setError('미리보기 이후 일정이 바뀌어 겹치는 항목이 있어요. 시각을 다시 계산했으니 확인하고 다시 확정해 주세요.');
        const ticket = previewRequest.current + 1;
        previewRequest.current = ticket;
        try {
          const solving = Promise.resolve(schedulePreviewAPI.recompute(proposalId, {}));
          // 같은 제안을 보는 다른 쪽(셸의 초안)도 새 결과를 받게 나눠 쓰는 자리를 갈아 끼운다.
          replacePreview(proposalId, previewKey, solving);
          const recomputed = await solving;
          if (previewRequest.current === ticket) setPreview(recomputed ?? null);
        } catch {
          if (previewRequest.current === ticket) setPreviewNote('정확한 시각 미리보기를 다시 계산하지 못했어요.');
        }
      } else {
        setError(err.message || '확정하지 못했습니다.');
      }
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
        <PlanDraftOverview
          draft={current}
          selectedCount={selectedItems.length}
          selectedMinutes={selectedMinutes}
          projectTitles={projectTitles}
          stale={stale || current?.freshness?.state === 'STALE'}
          staleReasons={staleReasons.length > 0 ? staleReasons : (current?.freshness?.reasons ?? [])}
          regenerating={remaking}
          stageLabel={remakeStageLabel}
          onRemake={onRemake}
          outcome={outcome}
          conflictChoice={conflictChoice}
          onChooseConflict={chooseConflict}
          scheduleLookupFailed={previewFailed}
          onRetrySchedule={() => { setPreviewFailed(false); setPreviewReload((v) => v + 1); }}
          onAnswerQuestion={onAnswerQuestion}
          onReview={() => itemsRef.current?.scrollIntoView?.({ block: 'start' })}
          onApply={handleConfirm}
          applyDisabled={confirming || allExcluded || !!confirmBlockedReason || remaking}
          applyLabel={confirming ? '적용하는 중…' : '적용'}
          onContinueConsult={onContinueConsult}
        />
        <PlanSummary
          confidence={previewFailed ? null : current.availabilityConfidenceSummary}
          cappedByItemLimit={current.targetCappedByItemLimit}
          uncoveredMinutes={current.uncoveredMinutes}
        />
        {/* 예전 서버가 이유를 보내면 그대로 보여준다. 새 서버는 예산을 직접 계산하므로 비어 있다. */}
        {current.targetMinutesReason && <p className="plan-draft-reason">{current.targetMinutesReason}</p>}
        {/*
          아직 분석이 끝나지 않은 자료. 이 초안은 그 내용을 보지 못했다 — 계획을 막지 않고 짧게 말한다.
          분석이 끝나도 이 초안을 자동으로 다시 쓰지 않는다. 다시 만들기는 사용자의 선택이다.
        */}
        {(current.pendingMaterials ?? []).length > 0 && (
          <p className="plan-pending-materials hint">
            아직 반영되지 않은 자료 {current.pendingMaterials.length}개
            {' · '}
            {current.pendingMaterials.slice(0, 3).map((m) => m.filename).join(', ')}
            {current.pendingMaterials.length > 3 ? ' 외' : ''}
            {' — 분석이 끝난 뒤 다시 만들면 반영돼요.'}
          </p>
        )}
        <PlanMaterialSelection selection={current.materialSelection}
          onChooseRequestedMaterial={onChooseRequestedMaterial} busy={busy || regenerating} />
        {/*
          서버가 실제로 센 호출·읽기 횟수. 모델이 "다 읽었다"고 말하는 것과 다르다. 자료 선택을 생략하고 이전 근거를
          다시 읽었으면 그 사실도 말한다.
        */}
        {current.generation && (
          <p className="hint plan-generation-line">
            AI 호출 {current.generation.normalCalls}회
            {current.generation.recoveryCalls > 0 ? ` (다시 답하기 ${current.generation.recoveryCalls}회)` : ''}
            {' · 원문 읽기 '}{current.generation.retrievalRounds}회
            {current.generation.selectionReused ? ' · 이전 초안과 근거가 같아 자료 선택은 생략했어요' : ''}
          </p>
        )}
        {current.previousDraft && (current.previousDraft.changes ?? []).length > 0 && (
          <p className="hint plan-generation-line">
            이전 초안 이후 달라진 것: {current.previousDraft.changes.join(', ')}
          </p>
        )}
        <p className="plan-detail-level" role="group" aria-label="안내 상세도">
          <span className="view-dim">안내</span>
          <button type="button" className={`chip-toggle${!detailAll ? ' is-on' : ''}`} aria-pressed={!detailAll}
            onClick={() => { setDetailAll(false); setDetailOpen(new Set()); }}>간단히</button>
          <button type="button" className={`chip-toggle${detailAll ? ' is-on' : ''}`} aria-pressed={detailAll}
            onClick={() => setDetailAll(true)}>자세히</button>
        </p>
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
        onRetry={reloadProvenance}
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
      {reviewNote && <p className="hint plan-review-note" role="status">{reviewNote}</p>}

      <span ref={itemsRef} />
      {previewNote && <p className="hint">{previewNote}</p>}
      {preview && longPlan && (
        <p className="hint">
          정확한 시각은 처음 7일({formatDateKo(preview.horizonStart)} ~ {formatDateKo(preview.horizonEnd)})만 미리 계산했어요.
          이번 주 이후 항목은 해당 주가 가까워지면 배치됩니다.
        </p>
      )}

      {adjustments.length > 0 && (
        <div className="plan-group plan-group-adjustments">
          <div className="plan-group-head">
            <span className="plan-group-title">이미 있던 항목의 변경 {adjustments.length}개</span>
          </div>
          <ul className="plan-group-items">
            {adjustments.map((item) => (
              <li key={item.proposalItemId} className="plan-item">
                <label>
                  <input type="checkbox" checked={!excluded.has(item.proposalItemId)}
                    onChange={() => toggleItem(item.proposalItemId)} />
                  <span className="plan-item-title">{item.beforeTitle ?? item.title}</span>
                  <span className="plan-item-meta">
                    {[
                      EXISTING_ACTION_LABEL[item.operation] ?? item.operation,
                      item.operation === 'REDUCE' && item.expectedMinutes
                        ? `${item.beforeExpectedMinutes ?? '?'}분 → ${item.expectedMinutes}분` : null,
                      item.operation === 'MOVE' && item.targetDate
                        ? `${item.beforeScheduledDate ? formatDateKo(item.beforeScheduledDate) : '날짜 미정'} → ${formatDateKo(item.targetDate)}` : null,
                    ].filter(Boolean).join(' · ')}
                  </span>
                </label>
                {item.reason && <p className="plan-item-reason">{item.reason}</p>}
              </li>
            ))}
          </ul>
          <p className="hint">체크를 풀면 그 변경만 빠지고 기존 항목은 그대로 남아요.</p>
        </div>
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
          topicIdOf={topicIdOf}
          minutesOf={minutesOf}
          minutesEdits={minutesEdits}
          minutesOpen={minutesOpen}
          onToggleMinutes={(id) => setMinutesOpen((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          })}
          onEditMinutes={editMinutes}
          onExcludeThisTime={onExcludeThisTime}
          detailAll={detailAll}
          detailOpen={detailOpen}
          onToggleDetail={(proposalItemId) => setDetailOpen((prev) => {
            const next = new Set(prev);
            if (next.has(proposalItemId)) next.delete(proposalItemId);
            else next.add(proposalItemId);
            return next;
          })}
          busy={regenerating || busy}
          provenance={provenance}
          provenanceLoading={provenanceLoading}
          provenanceError={provenanceError}
          onReloadProvenance={reloadProvenance}
          evidenceByItem={evidenceByItem}
          onOpenSource={onOpenSource}
          projectTitles={projectTitles}
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
        <button type="button" className="btn-primary" disabled={confirming || allExcluded || !!confirmBlockedReason}
          title={confirmBlockedReason ?? undefined} onClick={handleConfirm}>
          {confirming ? '확정하는 중…' : '계획 확정'}
        </button>
      </div>
      {allExcluded && <p className="hint">항목을 하나도 안 고르면 확정할 게 없어요.</p>}
      {confirmBlockedReason && !allExcluded && <p className="hint">{confirmBlockedReason}</p>}
    </div>
  );
}

/**
 * 요약 아래의 보조 설명. 실제 제안량·예산·포함 프로젝트는 PlanDraftOverview가 말한다.
 *
 * 예전의 목표 대비 게이지는 없앴다 — 예산은 상한이지 채울 양이 아니라서, 막대로 그리면 덜 채운 만큼이
 * 모자란 것처럼 보인다.
 */
function PlanSummary({ confidence, cappedByItemLimit, uncoveredMinutes }) {
  const lowConfidence = confidence != null && confidence.includes('기본 시간대');
  if (!cappedByItemLimit && !confidence) return null;
  return (
    <div className="plan-summary">
      {/*
        한 번에 담을 수 있는 최대(항목 30개 × 120분)를 넘어 예산이 깎인 경우. 잘못된 것이 아니라
        "이 기간을 한 계획에 다 담지는 못한다"는 사실이라 그대로 말한다.
      */}
      {cappedByItemLimit && (
        <p className="plan-summary-line plan-summary-capped">
          이 기간의 남는 시간을 한 계획에 다 담지는 못했어요
          {uncoveredMinutes ? <> · 약 {formatMinutes(uncoveredMinutes)}이 남아요</> : null}.
          주 단위로 나눠 만들면 더 담을 수 있어요.
        </p>
      )}
      {confidence && (
        <p className={`hint${lowConfidence ? ' plan-summary-low' : ''}`}>
          {lowConfidence ? '남는 시간은 ' : ''}{confidence}
          {lowConfidence ? '이에요. 확정 사실이 아니라 추정이라 미리보기에서 고칠 수 있어요.' : ''}
        </p>
      )}
    </div>
  );
}

function PlanDraftGroup({
  group, excluded, collapsed, placedById, unplacedById, previewLoaded, onToggleCollapse, onToggleItem, onToggleGroup,
  treatmentByTopic, classAtByCourse, onMarkKnown, busy, provenance, provenanceLoading, provenanceError,
  onReloadProvenance, evidenceByItem, onOpenSource, projectTitles,
  onExcludeThisTime = null, detailAll = false, detailOpen = new Set(), onToggleDetail = null, topicIdOf = null,
  minutesOf = (item) => item.expectedMinutes || 0, minutesEdits = new Map(), minutesOpen = new Set(),
  onToggleMinutes = null, onEditMinutes = null,
}) {
  const groupMinutes = group.items
    .filter((item) => !excluded.has(item.proposalItemId))
    .reduce((sum, item) => sum + minutesOf(item), 0);
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
          {group.items.map((item) => {
            const topicId = topicIdOf ? topicIdOf(item) : item.topicId;
            return (
            <li key={item.proposalItemId} className="plan-item">
              {/* 할 일과 완료 기준이 먼저다. 분류·시간·출처는 그 다음에 읽는다. */}
              <label>
                <input
                  type="checkbox"
                  checked={!excluded.has(item.proposalItemId)}
                  onChange={() => onToggleItem(item.proposalItemId)}
                />
                <span className="plan-item-title">{item.title}</span>
              </label>

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

              <p className="plan-item-meta plan-item-meta-line">
                {/*
                  취급과 우선순위는 다른 축이다 — "꼭 하기 · 핵심만 보기"가 성립한다.
                  한쪽으로 합치면 "중요한데 짧게 본다"를 말할 수 없다. 마감은 출처와 함께 아래에 따로 적는다.
                */}
                {[
                  PRIORITY_LABEL[item.priority],
                  treatmentByTopic?.get(item.topicId) != null
                    ? TREATMENT_LABEL[treatmentByTopic.get(item.topicId)]
                    : null,
                  ACTION_TYPE_LABEL[item.actionType],
                  formatEstimate(minutesOf(item)),
                  minutesEdits.has(item.proposalItemId) ? '시간을 직접 고침' : null,
                  /*
                    targetDate가 아니라 placementType으로 판단한다. 제안의 targetDate는 서버가
                    요청 기간의 시작일로 강제하는 값이라 미배치 항목에도 값이 들어 있다.
                  */
                  item.placementType === 'UNSCHEDULED' || !item.targetDate
                    ? null
                    : formatDateKo(item.targetDate),
                ].filter(Boolean).join(' · ')}
              </p>

              {minutesOpen.has(item.proposalItemId) && onEditMinutes && (
                <p className="plan-item-minutes">
                  <label>
                    예상 시간(분)
                    <input type="number" min={5} max={600} step={5}
                      aria-label={`${item.title} 예상 시간(분)`}
                      defaultValue={minutesOf(item)}
                      onChange={(e) => onEditMinutes(item, e.target.value)} />
                  </label>
                  {minutesEdits.has(item.proposalItemId) && (
                    <span className="hint">시간을 바꿔서 정확한 시각은 확정한 뒤 다시 잡혀요.</span>
                  )}
                </p>
              )}

              <ItemFacts
                item={item}
                evidence={evidenceByItem?.get(item.proposalItemId)}
                provenance={provenance}
                projectTitles={projectTitles}
                classAt={classAtByCourse?.get(item.courseId)}
                onMaterialOpenError={onReloadProvenance}
              />

              <span className="plan-item-actions">
                {topicId != null && onMarkKnown && (
                  <button
                    type="button"
                    className="btn-ghost btn-sm plan-item-known"
                    disabled={busy}
                    onClick={() => onMarkKnown(topicId)}
                  >
                    이미 알아요
                  </button>
                )}
                {/*
                  「이번만 빼기」는 이 요청에서만 후보에서 뺀다. 표식을 저장하지 않으므로 다음 계획에는
                  다시 후보로 돌아온다 — 「이미 알아요」와 무게가 다르다.
                */}
                {topicId != null && onExcludeThisTime && (
                  <button type="button" className="btn-ghost btn-sm" disabled={busy}
                    onClick={() => onExcludeThisTime(topicId, item.title)}>
                    이번만 빼기
                  </button>
                )}
                {onEditMinutes && onToggleMinutes && (
                  <button type="button" className="btn-ghost btn-sm" disabled={busy}
                    aria-expanded={minutesOpen.has(item.proposalItemId)}
                    onClick={() => onToggleMinutes(item.proposalItemId)}>
                    시간 고치기
                  </button>
                )}
                {/* 항목 하나만 자세히. 전체 전환과 독립이고, 선택·시간·마감은 그대로다. */}
                {onToggleDetail && !detailAll && (
                  <button type="button" className="btn-ghost btn-sm" aria-expanded={detailOpen.has(item.proposalItemId)}
                    onClick={() => onToggleDetail(item.proposalItemId)}>
                    {detailOpen.has(item.proposalItemId) ? '간단히' : '자세히'}
                  </button>
                )}
              </span>
              <PlanItemDetail
                mode="draft"
                id={item.proposalItemId}
                expanded={detailAll || detailOpen.has(item.proposalItemId)}
              />

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
                  projectTitles={projectTitles}
                  onMaterialOpenError={onReloadProvenance}
                />
              )}
              {/*
                아직 불러오는 중이거나 못 불러온 것은 "근거 없음"이 아니다. 같은 자리에서
                상태를 말하고, 못 불러왔으면 다시 시도할 수 있게 한다.
              */}
              {!evidenceByItem?.has(item.proposalItemId) && provenanceLoading && (
                <p className="plan-evidence plan-evidence-pending hint">근거를 불러오는 중…</p>
              )}
              {!evidenceByItem?.has(item.proposalItemId) && !provenanceLoading && provenanceError && (
                <p className="plan-evidence plan-evidence-pending error-text">
                  근거를 불러오지 못했어요.
                  {' '}
                  <button type="button" className="btn-ghost btn-sm" onClick={onReloadProvenance}>다시 시도</button>
                </p>
              )}
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * 항목이 어디서 나왔고(출처 라벨), 자료의 어디를 보면 되고(위치 + 파일 열기), 왜 중요하고, 마감이 무엇인가.
 *
 * ★ 위치로 곧장 데려가지 못한다 — 파일은 통째로 열리고 쪽·슬라이드·셀까지 이동시키지 않는다. 그래서
 *   "이 위치를 열어서 확인해 주세요: p.3~4"라고 말한다. 갈 수 없는 곳을 가는 것처럼 적지 않는다.
 * ★ 「꼭 하기」는 이유와 함께 보인다. 이유 없는 「꼭」은 사용자가 빼도 되는지 판단할 수 없다.
 * ★ 마감은 출처와 함께 따로 적는다. AI가 잡은 목표 시각은 실제 마감이 아니다. 없으면 "마감 미확인"이다.
 */
function ItemFacts({ item, evidence, provenance, projectTitles, classAt, onMaterialOpenError }) {
  const origin = ITEM_ORIGIN_LABEL[evidence?.origin ?? item.evidence?.origin ?? item.origin] ?? null;
  const deadline = describeDeadline(item.deadlineAt, classAt, item.deadlineSource);
  const must = item.priority === 'MUST';
  // selectionReason: 서버가 근거 기록(evidence)에서 읽어 붙인, 모델이 쓴 선정 이유. reason은 조정 카드(줄임·이동)의 이유다.
  const reason = item.priorityReason ?? item.selectionReason ?? item.reason ?? null;
  // 이 항목이 실제로 인용한 자료 중 지금 열 수 있는 첫 파일. 제목이 아니라 근거의 id로 찾는다.
  const material = evidence && provenance
    ? buildEvidenceSummary(provenance, evidence, projectTitles).materials
      .find((m) => m.materialId != null && m.openMode !== 'NONE')
    : null;

  return (
    <>
      {origin && <p className="plan-item-origin"><span className="plan-item-tag">{origin}</span></p>}

      {item.sourceLocator && (
        <p className="plan-item-source">
          <span className="plan-item-done-label">이 위치를 열어서 확인해 주세요</span>
          <span>{item.sourceLocator}</span>
          {material && (
            <MaterialFileLink
              materialId={material.materialId}
              filename={material.currentFilename ?? material.filename}
              contentType={material.contentType}
              onError={onMaterialOpenError}
            />
          )}
        </p>
      )}

      {must ? (
        <p className="plan-item-reason">
          <span className="plan-item-done-label">꼭 하는 이유</span>
          {reason ?? '이유가 기록되지 않았어요. 필요 없어 보이면 빼도 괜찮아요.'}
        </p>
      ) : (
        reason && <p className="plan-item-reason">{reason}</p>
      )}
      {!item.doneCriteria && item.description && (
        <p className="plan-item-reason">{item.description}</p>
      )}

      <p className="plan-item-deadline">
        <span className="plan-item-done-label">마감</span>
        {deadline ? `${deadline.when} · ${deadline.sourceLabel}` : '마감 미확인'}
      </p>
    </>
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
