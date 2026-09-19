/**
 * 오른쪽 AI 패널. 부가 기능이 아니라 이 앱의 주요 조작 방법 중 하나다.
 *
 * 항상 열려 있고, 지금 보고 있는 화면에 따라 참고 범위(scope)가 달라진다. 같은 프로젝트를
 * 다시 열면 그 프로젝트에서 하던 대화를 이어간다.
 *
 * 이 패널이 하지 않는 일:
 * - 제안 카드를 여기서 편집하지 않는다. 초안이 만들어지면 오늘/일정 화면에 ghost로 나타나고
 *   편집과 적용도 거기서 한다. 여기는 "왜 이렇게 제안했는지"와 "사용자와 조정하는 대화"만 맡는다.
 * - 사용자에게 대화 모드/제안 모드 스위치를 노출하지 않는다. 입력창과 전송 버튼은 하나뿐이다.
 * - 내부 Agent 이름을 드러내지 않는다. 사용자는 그냥 AI와 이야기한다.
 *
 * "새 대화"는 화면만 지우는 게 아니라 이후 메시지에서 이전 대화 기록을 참고하지 않는다는 뜻이다.
 * 첫 메시지를 실제로 보낼 때만 서버에 대화가 생기므로, 아무것도 보내지 않고 옮겨 다녀도 빈
 * 대화가 쌓이지 않는다.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Sparkles, Loader2, Send, List, Plus, MessageCircle, ArrowLeft, PanelRightClose, CircleCheck, Trash2,
  ImagePlus, FolderOpen, ListChecks, BrainCircuit,
} from 'lucide-react';
import {
  conversationAPI, proposalAPI, contextSuggestionAPI, scheduleSuggestionAPI, scheduleImportAPI, planAPI,
  consultContextAPI,
} from '../api/api.js';
import ScheduleSuggestionCard from './ScheduleSuggestionCard.jsx';
import ScheduleImportReviewModal from './ScheduleImportReviewModal.jsx';
import ConsultQuestionCard from './ConsultQuestionCard.jsx';
import ConsultUnderstandingCard from './ConsultUnderstandingCard.jsx';
import { planStageLabel } from './consultLabels.js';
import { PLAN_INTENSITY_LABEL } from '../types/execution.js';

/** 화면별 추천 질문. 지금 이 화면에서 실제로 할 수 있는 것만 보여준다. */
const SUGGESTED_PROMPTS = {
  today: ['지금부터 뭐부터 하면 좋을까?', '오늘 너무 피곤해. 남은 걸 줄여줘'],
  schedule: ['이번 주 계획 짜줘', '이번 주에 빈 시간이 언제야?'],
  project: ['이 주제 어디부터 시작하면 좋을까?', '오늘 30분만 해보고 싶어'],
  consult: ['이번 주 계획을 같이 짜줘', '어디서부터 시작하면 좋을지 모르겠어'],
  all: ['요즘 뭐부터 정리하면 좋을까?', '이번 주에 뭘 챙겨야 해?'],
};

/**
 * 보내지 않은 입력을 대화마다 세션에 남긴다. 새로고침으로 쓰던 글이 사라지지 않게 하려는 것이고,
 * 탭을 닫으면 같이 사라진다(sessionStorage). 저장은 사용자가 직접 친 순간에만 한다 — 화면 전환이
 * 입력창을 비우는 것까지 받아 적으면 다른 대화에 남겨 둔 글을 덮어쓴다.
 */
const INPUT_DRAFT_PREFIX = 'ai.input.';
function inputDraftKey(conversationId, scopeKey) {
  return `${INPUT_DRAFT_PREFIX}${conversationId != null ? `c:${conversationId}` : `new:${scopeKey}`}`;
}
function readInputDraft(key) {
  try { return sessionStorage.getItem(key) ?? ''; } catch { return ''; }
}
function writeInputDraft(key, text) {
  try {
    if (text) sessionStorage.setItem(key, text);
    else sessionStorage.removeItem(key);
  } catch { /* 세션 저장은 보조 수단이다 */ }
}

/** 이만큼 이내면 "바닥 근처"로 본다. 위로 올려 읽는 중이면 새 글이 와도 끌어내리지 않는다. */
const NEAR_BOTTOM_PX = 80;

/**
 * 상담 턴이 실어 온 부가 정보(질문·이해한 내용·방향)를 화면 상태로 옮긴다. 서버가 아직 이 필드를
 * 모르면 전부 없다 — 있는 것만 그린다.
 */
function consultOf(payload) {
  const consult = payload?.consult;
  if (!consult || typeof consult !== 'object') return null;
  return {
    question: consult.question?.text ? consult.question : null,
    understanding: Array.isArray(consult.understanding) ? consult.understanding : [],
    direction: consult.direction?.after ? consult.direction : null,
  };
}

function contextSuggestionCopy(operation) {
  switch (operation) {
    case 'ADD':
      return { heading: '새로 기억할 정보가 있어요', primaryLabel: '기억해두기', secondaryLabel: '저장하지 않기' };
    case 'SUPERSEDE':
      return { heading: '전에 알던 것과 달라진 것 같아요', primaryLabel: '새 정보로 바꾸기', secondaryLabel: '그대로 두기' };
    case 'MARK_STALE':
      return { heading: '이 정보는 다시 확인이 필요할 수 있어요', primaryLabel: '확인 필요로 표시', secondaryLabel: '계속 사용' };
    case 'ARCHIVE':
      return { heading: '이 정보를 더 이상 쓰지 않을까요?', primaryLabel: '더 이상 사용 안 함', secondaryLabel: '계속 사용' };
    case 'CONFIRM':
      return { heading: '이 정보, 지금도 맞나요?', primaryLabel: '지금도 맞아요', secondaryLabel: '그대로 두기' };
    default:
      return { heading: '생활 정보가 달라진 것 같아요', primaryLabel: '기억해두기', secondaryLabel: '저장하지 않기' };
  }
}

function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `idem-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatPeriod(startIso, endIso) {
  const fmt = (iso) => {
    const [, m, d] = String(iso).split('-');
    return `${Number(m)}/${Number(d)}`;
  };
  if (!startIso) return '';
  return !endIso || endIso === startIso ? fmt(startIso) : `${fmt(startIso)}~${fmt(endIso)}`;
}

function formatRelativeTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const sameDay = date.toDateString() === new Date().toDateString();
  if (sameDay) return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export default function AiPanel({
  scope,
  draft,
  prefill,
  onProposal,
  /** 기간 계획 초안(PlanDraftResponse). 일반 제안과 달리 공통 검토·확정 화면으로 간다. */
  onPeriodPlan,
  onFocusDraft,
  onDiscardDraft,
  onScheduleApplied,
  onCollapse,
  /**
   * 'side'는 늘 있던 오른쪽 좁은 칸, 'workspace'는 상담 작업 공간의 가운데 칸이다. 같은 인스턴스가 자리만
   * 옮긴다 — 다시 만들지 않으므로 대화·입력 중인 글·진행 중인 응답이 그대로 이어진다.
   */
  variant = 'side',
  /** 상담 상태(대화 유무·방향·이해한 내용·진행 단계)를 옆 칸이 그릴 수 있게 셸로 올린다. */
  onConsultState,
  /** 답이 열린 초안에 영향을 줬다. draftIds가 null이면 "지금 열린 초안"을 뜻한다. */
  onDraftStale,
  /** 좁은 화면에서 입력창 위에 늘 보이는 한 줄(포함·빠진 프로젝트, 가정 여부). 누르면 미리보기가 열린다. */
  draftNotice = null,
  onOpenScopePane,
  onOpenPreviewPane,
  /** "AI가 이해한 내 상황" 화면을 연다. 이 대화가 들고 들어가는 나에 대한 이해를 보고 고치는 곳이다. */
  onOpenMemory,
}) {
  const [view, setView] = useState('chat'); // 'chat' | 'list'
  const [conversationList, setConversationList] = useState([]);
  const [listLoading, setListLoading] = useState(false);

  const [activeConversationId, setActiveConversationId] = useState(null); // null = 새 대화 준비 상태
  const [messages, setMessages] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);

  const [currentOffer, setCurrentOffer] = useState(null);
  /**
   * 되묻는 질문에 붙는 짧은 선택지(강도: 가볍게/보통/집중). 누르면 그 문장을 일반 메시지로
   * 보낸다 — 서버가 붙여 준 것만 그린다. 다음 턴이 시작되면 사라진다.
   */
  const [quickReplies, setQuickReplies] = useState([]);
  /** 기간 계획 초안을 검토 화면으로 넘겼다는 안내. 항목 수만 든다. */
  const [periodPlanNotice, setPeriodPlanNotice] = useState(null);
  /** 기간 계획 생성의 진행 단계(서버가 실제로 밟은 단계). 턴이 끝나면 사라진다. */
  const [periodPlanStage, setPeriodPlanStage] = useState(null);
  /**
   * 상담 질문 카드와 "내가 이해한 내용". 마지막 AI 응답에 붙어 온 것만 든다 — 턴이 바뀌면 질문은 사라지고
   * (이미 답했거나 넘어갔다), 새 응답이 새 카드를 가져온다. 입력창의 글은 이 상태와 무관하다.
   */
  const [consultQuestion, setConsultQuestion] = useState(null);
  const [consultUnderstanding, setConsultUnderstanding] = useState([]);
  /** 계획 방향. fresh면 "이번 답변으로 바뀐 방향"이고, 아니면 앞선 턴에서 정해진 지금의 방향이다. */
  const [consultDirection, setConsultDirection] = useState(null);
  const [contextSuggestions, setContextSuggestions] = useState([]);
  /**
   * AI가 뽑은 일정 후보(약속·반복 일정). contextSuggestions와 나란히 두되 합치지 않는다 —
   * 저쪽은 문장 하나를 기억할지 묻는 것이고 이쪽은 구조화된 일정을 만들지 묻는 것이라,
   * 카드도 버튼도 적용 결과도 다르다.
   */
  const [scheduleSuggestions, setScheduleSuggestions] = useState([]);
  const [scheduleActionState, setScheduleActionState] = useState({});
  const [contextActionState, setContextActionState] = useState({});
  const [appliedNotice, setAppliedNotice] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  /*
   * 이미지에서 일정 가져오기. 읽는 중 -> 검토 -> 후보 카드 순으로 간다.
   * 읽은 결과(extraction)는 서버가 아니라 여기서 들고 있다가 confirm에 그대로 돌려준다 —
   * 확정 전 상태를 DB에 두면 "아직 확정되지 않은 일정"이라는 상태가 하나 더 생긴다.
   */
  const [importing, setImporting] = useState(false);
  const [extraction, setExtraction] = useState(null);
  const [importError, setImportError] = useState(null);
  const [batchState, setBatchState] = useState(null);

  const bodyRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const abortControllerRef = useRef(null);
  const activeStreamConversationIdRef = useRef(null);
  const lastUserMessageIdRef = useRef(null);
  const loadTokenRef = useRef(0);
  // scope가 바뀔 때마다 해당 범위의 대화를 새로 붙인다. 이 키가 같으면 다시 불러오지 않는다.
  const scopeKey = `${scope.kind}:${scope.courseId ?? ''}`;
  const loadedScopeKeyRef = useRef(null);
  /** 지금 입력이 어느 대화의 것인가. 입력을 세션에 남길 때의 열쇠다. */
  const inputKeyRef = useRef(inputDraftKey(null, scopeKey));
  /** 사용자가 바닥 근처를 보고 있는가. 위로 올려 읽는 중이면 자동으로 끌어내리지 않는다. */
  const nearBottomRef = useRef(true);

  useEffect(() => () => abortControllerRef.current?.abort(), []);

  useEffect(() => {
    const body = bodyRef.current;
    if (body && nearBottomRef.current) body.scrollTop = body.scrollHeight;
  }, [messages, currentOffer, contextSuggestions, scheduleSuggestions, consultQuestion, consultUnderstanding, view]);

  const handleBodyScroll = useCallback(() => {
    const body = bodyRef.current;
    if (!body) return;
    nearBottomRef.current = body.scrollHeight - body.scrollTop - body.clientHeight <= NEAR_BOTTOM_PX;
  }, []);

  /** 사용자가 친 글. 화면 상태와 세션 저장을 함께 바꾼다. */
  const typeInput = useCallback((text) => {
    setInputText(text);
    writeInputDraft(inputKeyRef.current, text);
  }, []);

  // 화면의 버튼("이어하기", "이 자료로 질문" 등)이 입력창을 대신 채운다. 바로 보내지 않는다 —
  // 무엇을 물어볼지는 사용자가 마지막으로 확인하고 고칠 수 있어야 한다.
  useEffect(() => {
    // focusOnly는 [계속 상담]처럼 대화로 돌아오기만 하는 경우다 — 쓰던 글을 덮어쓰지 않는다.
    if (!prefill?.text && !prefill?.focusOnly) return;
    setView('chat');
    if (prefill.text) typeInput(prefill.text);
    inputRef.current?.focus();
  }, [prefill, typeInput]);

  const resetTurnState = useCallback(() => {
    setMessages([]);
    setCurrentOffer(null);
    setQuickReplies([]);
    setPeriodPlanNotice(null);
    setPeriodPlanStage(null);
    setConsultQuestion(null);
    setConsultUnderstanding([]);
    setConsultDirection(null);
    nearBottomRef.current = true;
    setContextSuggestions([]);
    setScheduleSuggestions([]);
    setScheduleActionState({});
    setContextActionState({});
    setSendError(null);
    setLoadError(null);
    setAppliedNotice(false);
    lastUserMessageIdRef.current = null;
  }, []);

  const selectConversation = useCallback(async (conversationId) => {
    abortControllerRef.current?.abort();
    activeStreamConversationIdRef.current = null;
    const myToken = ++loadTokenRef.current;

    setView('chat');
    setActiveConversationId(conversationId);
    resetTurnState();
    inputKeyRef.current = inputDraftKey(conversationId, '');
    setInputText(readInputDraft(inputKeyRef.current));
    setLoadingHistory(true);

    try {
      const history = await conversationAPI.getMessages(conversationId);
      if (loadTokenRef.current !== myToken) return;

      setMessages(history.map((m) => ({
        key: `m-${m.messageId}`,
        role: m.role,
        content: m.content,
        responseType: m.responseType,
        proposalId: m.proposalId,
        streaming: false,
      })));

      const lastUser = [...history].reverse().find((m) => m.role === 'USER');
      if (lastUser) lastUserMessageIdRef.current = lastUser.messageId;

      const last = history.length > 0 ? history[history.length - 1] : null;
      /*
       * 새로고침 뒤에도 상담 카드를 되살린다. 질문·이해한 내용은 마지막 AI 응답의 것만 — 그 뒤에 내가 이미
       * 답했으면 그 질문은 끝난 것이다. 방향은 가장 최근에 정해진 것을 찾되, 마지막 응답의 것이 아니면
       * "이번 답변으로 바뀐"이라고 말하지 않는다.
       */
      if (last?.role === 'ASSISTANT') {
        const restored = consultOf(last);
        setConsultQuestion(restored?.question ?? null);
        setConsultUnderstanding(restored?.understanding ?? []);
      }
      const lastWithDirection = [...history].reverse()
        .find((m) => m.role === 'ASSISTANT' && consultOf(m)?.direction);
      if (lastWithDirection) {
        setConsultDirection({ ...consultOf(lastWithDirection).direction, fresh: lastWithDirection === last });
      }
      /*
       * 초안은 "마지막 메시지"가 아니라 이 대화에서 가장 최근에 만든 초안 메시지에서 되살린다. 초안을 만든 뒤에 대화를
       * 더 이어 가는 것이 이 화면의 기본 흐름이라(답변 → 방향 변화 → 다시 만들기), 마지막 메시지만 보면 한마디만 더
       * 해도 새로고침에 초안이 사라진다. 이미 적용·폐기한 초안은 아래 status 확인에서 걸러진다.
       */
      const lastDraftMessage = [...history].reverse()
        .find((m) => m.role === 'ASSISTANT' && m.responseType === 'PROPOSAL' && m.proposalId);
      if (last?.role === 'ASSISTANT' && last.responseType === 'OFFER') {
        setCurrentOffer({ label: '이 내용으로 초안 만들기' });
      }
      if (lastDraftMessage) {
        const last = lastDraftMessage;
        if (last.responseType === 'PROPOSAL' && last.proposalId) {
          // 아직 적용하지 않은 초안이 있으면 화면에 다시 띄운다 — 새로고침으로 사라지지 않는다.
          try {
            /*
             * 기간 계획 초안은 일반 제안(적용 바)이 아니라 계획 검토 화면으로 간다. 저장된 초안을 먼저 그 모양으로 읽는다 —
             * 메시지가 가리키는 초안이 「이미 알아요」·되돌리기로 이미 대체됐으면 서버가 그 대체(최신 열린 초안)를
             * 돌려준다. 그래서 새로고침 뒤에도 옛 id가 아니라 지금 열린 초안이 복구된다.
             */
            let periodDraft = null;
            if (planAPI?.loadDraft && onPeriodPlan) {
              try {
                periodDraft = await planAPI.loadDraft(last.proposalId);
              } catch { periodDraft = null; }
            }
            if (loadTokenRef.current !== myToken) return;
            if (periodDraft?.proposalId && (periodDraft.proposal?.status ?? 'PROPOSED') === 'PROPOSED') {
              setPeriodPlanNotice(periodDraft.proposal?.items?.length ?? 0);
              // 되살린 초안이라는 것을 알린다 — 셸은 지금 열려 있는 다른 초안을 이것으로 덮지 않는다.
              onPeriodPlan(periodDraft, { restored: true });
            } else if (!periodDraft?.proposalId) {
              const proposal = await proposalAPI.get(last.proposalId);
              if (loadTokenRef.current === myToken && proposal.status === 'PROPOSED') {
                onProposal?.(proposal);
              }
            }
          } catch { /* 제안 조회 실패해도 대화 자체는 정상 표시한다 */ }
        }
      }

      try {
        const pending = await conversationAPI.getContextSuggestions(conversationId);
        if (loadTokenRef.current === myToken) setContextSuggestions(pending ?? []);
        const pendingSchedule = await conversationAPI.getScheduleSuggestions(conversationId);
        if (loadTokenRef.current === myToken) setScheduleSuggestions(pendingSchedule ?? []);
      } catch { /* 후보 복원 실패는 대화 표시를 막지 않는다 */ }
    } catch (err) {
      if (loadTokenRef.current === myToken) {
        setLoadError(err.message || '대화를 불러오지 못했습니다.');
      }
    } finally {
      if (loadTokenRef.current === myToken) setLoadingHistory(false);
    }
  }, [onProposal, onPeriodPlan, resetTurnState]);

  const startNewConversation = useCallback(() => {
    abortControllerRef.current?.abort();
    activeStreamConversationIdRef.current = null;
    loadTokenRef.current += 1;
    setView('chat');
    setActiveConversationId(null);
    resetTurnState();
    // 새 대화는 빈 입력으로 시작한다 — 새 대화용으로 남겨 둔 글도 함께 지운다.
    inputKeyRef.current = inputDraftKey(null, scopeKey);
    writeInputDraft(inputKeyRef.current, '');
    setInputText('');
  }, [resetTurnState, scopeKey]);

  // scope가 바뀌면(다른 프로젝트로 이동, 오늘<->일정 전환) 그 범위의 가장 최근 대화를 이어간다.
  useEffect(() => {
    if (loadedScopeKeyRef.current === scopeKey) return;
    loadedScopeKeyRef.current = scopeKey;
    let cancelled = false;

    (async () => {
      abortControllerRef.current?.abort();
      loadTokenRef.current += 1;
      setActiveConversationId(null);
      resetTurnState();
      // 이 범위에서 아직 보내지 않은 새 대화의 글이 있으면 되살린다(새로고침 복구).
      inputKeyRef.current = inputDraftKey(null, scopeKey);
      setInputText(readInputDraft(inputKeyRef.current));
      setView('chat');
      try {
        const list = await conversationAPI.list(scope.courseId ?? null, scope.conversationScope);
        if (cancelled) return;
        setConversationList(list);
        if (list.length > 0) await selectConversation(list[0].conversationId);
      } catch (err) {
        if (!cancelled) setLoadError(err.message || '대화 목록을 불러오지 못했습니다.');
      }
    })();

    return () => { cancelled = true; };
  }, [scopeKey, scope.courseId, scope.conversationScope, resetTurnState, selectConversation]);

  const openList = async () => {
    setView('list');
    setListLoading(true);
    try {
      setConversationList(await conversationAPI.list(scope.courseId ?? null, scope.conversationScope));
    } catch (err) {
      setLoadError(err.message || '대화 목록을 불러오지 못했습니다.');
    } finally {
      setListLoading(false);
    }
  };

  const runTurn = async (payload, { optimisticUserText } = {}) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setSending(true);
    setSendError(null);
    setCurrentOffer(null);
    setQuickReplies([]);
    setPeriodPlanNotice(null);
    setPeriodPlanStage(null);
    setAppliedNotice(false);
    // 턴이 넘어가면 앞의 질문은 끝난 것이다. 이해한 내용과 방향은 새 응답이 올 때까지 그대로 둔다.
    setConsultQuestion(null);
    // 내가 보낸 직후에는 바닥으로 데려간다 — 방금 보낸 말과 그 답이 보여야 한다.
    nearBottomRef.current = true;

    if (optimisticUserText) {
      setMessages((prev) => [...prev, { key: `u-${Date.now()}`, role: 'USER', content: optimisticUserText, streaming: false }]);
    }

    const streamingKey = `a-${Date.now()}`;
    let started = false;
    let targetConversationId = activeConversationId;

    try {
      if (!targetConversationId) {
        const created = await conversationAPI.create(scope.conversationScope, scope.courseId ?? null);
        if (controller.signal.aborted) return;
        targetConversationId = created.conversationId;
        setActiveConversationId(targetConversationId);
        inputKeyRef.current = inputDraftKey(targetConversationId, '');
      }
      activeStreamConversationIdRef.current = targetConversationId;

      await conversationAPI.sendMessage(targetConversationId, payload, {
        signal: controller.signal,
        onEvent: (eventName, data) => {
          if (activeStreamConversationIdRef.current !== targetConversationId) return;

          if (eventName === 'message.started') {
            started = true;
            setMessages((prev) => [...prev, { key: streamingKey, role: 'ASSISTANT', content: '', streaming: true }]);
          } else if (eventName === 'message.delta') {
            setMessages((prev) => prev.map((m) =>
              (m.key === streamingKey ? { ...m, content: m.content + (data?.text ?? '') } : m)));
          } else if (eventName === 'offer.ready') {
            setCurrentOffer(data?.offerAction ?? { label: '이 내용으로 초안 만들기' });
          } else if (eventName === 'proposal.ready') {
            // 카드를 여기서 그리지 않는다 — 초안은 실제 화면으로 넘긴다.
            onProposal?.(data);
          } else if (eventName === 'period_plan.progress') {
            // 서버가 실제로 밟은 단계만 보여 준다. 모델이 완료를 선언하는 문구가 아니다.
            setPeriodPlanStage(planStageLabel(data?.stage, data?.label));
          } else if (eventName === 'period_plan.ready') {
            // 기간 계획은 일반 제안(적용 바)이 아니라 계획 검토·확정 화면으로 간다 — 계획
            // 탭에서 만든 것과 같은 화면, 같은 확정 API다.
            setPeriodPlanStage(null);
            setPeriodPlanNotice(data?.proposal?.items?.length ?? 0);
            onPeriodPlan?.(data);
          } else if (eventName === 'context.suggestions.ready') {
            setContextSuggestions((prev) => [...prev, ...(data?.suggestions ?? [])]);
          } else if (eventName === 'schedule.suggestions.ready') {
            // proposal.ready와 달리 여기서 카드를 그린다 — 갈 화면이 따로 없는 사실 후보다.
            setScheduleSuggestions((prev) => [...prev, ...(data?.suggestions ?? [])]);
          } else if (eventName === 'message.completed') {
            if (data?.userMessageId) lastUserMessageIdRef.current = data.userMessageId;
            setMessages((prev) => prev.map((m) => (m.key === streamingKey
              ? { ...m, content: data.reply ?? m.content, responseType: data.responseType, streaming: false }
              : m)));
            /*
             * 상담 카드. 질문이 있으면 예전 quickReplies보다 그쪽이 우선이다 — 같은 질문을 두 모양으로
             * 그리지 않는다. 입력창의 글은 건드리지 않는다: 카드가 새로 와도 쓰던 말은 그대로다.
             */
            const consult = consultOf(data);
            setConsultQuestion(consult?.question ?? null);
            setConsultUnderstanding(consult?.understanding ?? []);
            if (consult?.direction) {
              setConsultDirection({ ...consult.direction, fresh: true });
              // 방향이 바뀌어 열린 초안이 낡았다. 초안을 지우지 않고 "이전 버전"으로 표시만 한다.
              if (consult.direction.affectsDraft) onDraftStale?.(null, 'DIRECTION');
            } else {
              setConsultDirection((prev) => (prev ? { ...prev, fresh: false } : prev));
            }
            setQuickReplies(!consult?.question && Array.isArray(data?.quickReplies) ? data.quickReplies : []);
          } else if (eventName === 'message.error') {
            setPeriodPlanStage(null);
            setMessages((prev) => prev.filter((m) => m.key !== streamingKey));
            setSendError(data?.message || 'AI 응답을 받지 못했습니다.');
          }
        },
      });
    } catch (err) {
      if (activeStreamConversationIdRef.current !== targetConversationId) return;
      if (err.name === 'AbortError') {
        setMessages((prev) => prev.filter((m) => m.key !== streamingKey));
        return;
      }
      if (!started) setMessages((prev) => prev.filter((m) => m.key !== streamingKey));
      setSendError(err.message || 'AI 응답을 받지 못했습니다.');
    } finally {
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
      if (activeStreamConversationIdRef.current === targetConversationId) setSending(false);
    }
  };

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || sending) return;
    typeInput('');
    /*
     * 질문 카드가 떠 있을 때 직접 쓴 답도 그 질문의 답이다. 선택지를 고르지 않았다는 것만 다르다 —
     * 같은 경로, 같은 기록이다.
     */
    const answer = consultQuestion?.id != null
      ? { questionId: consultQuestion.id, choiceIds: [], skipped: false } : null;
    await runTurn({
      message: text, requestedAction: 'AUTO', idempotencyKey: newIdempotencyKey(), ...(answer ? { answer } : {}),
    }, { optimisticUserText: text });
  };

  /**
   * 질문 카드의 선택지·건너뛰기. 자유 입력과 같은 보내기 경로를 지난다 — 고른 라벨이 내 말로 기록에 남고,
   * 어느 질문의 어떤 선택지였는지만 answer로 덧붙인다. 입력창에 쓰던 글은 그대로 둔다.
   */
  const handleQuestionAnswer = async ({ questionId, choiceIds, skipped, text }) => {
    if (sending) return;
    await runTurn({
      message: text,
      requestedAction: 'AUTO',
      idempotencyKey: newIdempotencyKey(),
      answer: { questionId, choiceIds: choiceIds ?? [], skipped: Boolean(skipped) },
    }, { optimisticUserText: text });
  };

  /** 남은 질문은 가정으로 돌리고 지금까지 얘기로 계획을 제안받는다. 서버가 OFFER를 낸다. */
  const handlePlanNow = async () => {
    if (sending) return;
    const text = '지금까지 얘기로 계획해줘';
    await runTurn({ message: text, requestedAction: 'PLAN_NOW', idempotencyKey: newIdempotencyKey() },
      { optimisticUserText: text });
  };

  const focusInput = useCallback(() => {
    setView('chat');
    inputRef.current?.focus();
  }, []);

  /**
   * "조금 달라요"로 고친 기억을 저장한다. 확인 창을 띄우지 않는다 — 고친 문장이 곧 확인이다.
   * 응답의 staleDraftIds에 열린 초안이 있으면 그 초안을 "갱신 필요"로 표시하게 셸에 알린다.
   */
  const handleUnderstandingEdit = async (line, content) => {
    try {
      const response = await consultContextAPI.update(line.id, { content });
      const staleIds = response?.staleDraftIds ?? [];
      if (staleIds.length > 0) onDraftStale?.(staleIds, 'UNDERSTANDING');
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err?.message || '고치지 못했어요. 다시 시도해 주세요.' };
    }
  };

  /** 이번 대화의 합의는 따로 저장된 항목이 아니다 — 대화로 고쳐 말하게 입력창을 채워 준다. 쓰던 글은 지우지 않는다. */
  const handleUnderstandingRestate = () => {
    const lead = '다시 말할게요: ';
    typeInput(inputText.trim() ? [inputText, lead].join('\n') : lead);
    focusInput();
  };

  /**
   * OFFER 버튼. 버튼의 type이 경로를 정한다 — 서버가 만든 값이고 탭과 무관하다.
   * CREATE_PERIOD_PLAN이면 버튼이 들고 있던 기간·강도·대상 프로젝트를 그대로 되돌려 보내고,
   * 서버가 계획 화면과 같은 생성기로 초안을 만든다(period_plan.ready로 돌아온다).
   */
  const handleCreateProposalFromOffer = async () => {
    if (sending || !activeConversationId) return;
    const offer = currentOffer;
    if (offer?.type === 'CREATE_PERIOD_PLAN') {
      await runTurn({
        requestedAction: 'CREATE_PERIOD_PLAN',
        sourceMessageId: lastUserMessageIdRef.current,
        idempotencyKey: newIdempotencyKey(),
        periodPlan: {
          periodStartDate: offer.periodStartDate,
          periodEndDate: offer.periodEndDate,
          intensity: offer.intensity,
          courseIds: offer.courseIds ?? [],
        },
      });
      return;
    }
    // 카드에 보인 기간을 그대로 되돌려 보낸다 — 사용자가 그 날짜를 보고 눌렀으므로 이 값이
    // 이번 계획의 확정 기간이다. 서버는 이 단계에서 기간을 다시 해석하지 않는다.
    await runTurn({
      requestedAction: 'CREATE_PROPOSAL',
      sourceMessageId: lastUserMessageIdRef.current,
      periodStartDate: offer?.periodStartDate,
      periodEndDate: offer?.periodEndDate,
      idempotencyKey: newIdempotencyKey(),
    });
  };

  /** 강도 선택지처럼 서버가 붙인 짧은 답. 사용자가 직접 친 것과 같은 일반 메시지로 보낸다. */
  const handleQuickReply = async (text) => {
    if (sending || !text) return;
    setQuickReplies([]);
    await runTurn({ message: text, requestedAction: 'AUTO', idempotencyKey: newIdempotencyKey() },
      { optimisticUserText: text });
  };

  /**
   * 대화 삭제. 지금 보고 있는 대화를 지우면 화면에 그 대화의 흔적(진행 중 스트림, 이력,
   * 입력 중이던 글, 적용 전 초안 안내)이 남아 있으면 안 된다 — 지운 대화를 계속 보고 있는
   * 것처럼 보이기 때문이다. 그래서 스트림을 먼저 끊고 턴 상태를 비운 뒤 목록을 다시 읽는다.
   */
  const handleDeleteConversation = async (conversationId) => {
    if (deletingId) return;
    if (!window.confirm('이 대화를 삭제할까요?')) return;

    const isActive = conversationId === activeConversationId;
    setDeletingId(conversationId);
    setLoadError(null);
    try {
      await conversationAPI.delete(conversationId);
    } catch (err) {
      setLoadError(err.message || '대화를 삭제하지 못했습니다.');
      setDeletingId(null);
      return;
    }

    if (isActive) {
      // 진행 중이던 SSE를 먼저 끊는다. loadToken도 올려 뒤늦게 도착하는 응답이 화면을
      // 되살리지 못하게 한다.
      abortControllerRef.current?.abort();
      activeStreamConversationIdRef.current = null;
      loadTokenRef.current += 1;
      setSending(false);
      setActiveConversationId(null);
      resetTurnState();
      writeInputDraft(inputDraftKey(conversationId, ''), '');
      inputKeyRef.current = inputDraftKey(null, scopeKey);
      setInputText('');
      // 이 대화에서 나온 적용 전 초안도 함께 치운다 — 대화는 지웠는데 그 대화가 만든 ghost가
      // 오늘/일정 화면에 계속 떠 있으면 안 된다. 적용 전이므로 버려도 실제 데이터는 그대로다.
      onDiscardDraft?.();
    }
    writeInputDraft(inputDraftKey(conversationId, ''), '');
    setDeletingId(null);

    try {
      const list = await conversationAPI.list(scope.courseId ?? null, scope.conversationScope);
      setConversationList(list);
      if (isActive) {
        // 남은 대화가 있으면 가장 최근 것을 열고, 없으면 새 대화 준비 상태로 둔다.
        if (list.length > 0) await selectConversation(list[0].conversationId);
        else setView('chat');
      }
    } catch (err) {
      setLoadError(err.message || '대화 목록을 불러오지 못했습니다.');
    }
  };

  const handleContextAction = async (suggestionId, action) => {
    setContextActionState((prev) => ({ ...prev, [suggestionId]: { status: 'working' } }));
    try {
      if (action === 'apply') await contextSuggestionAPI.apply(suggestionId);
      else await contextSuggestionAPI.dismiss(suggestionId);
      setContextActionState((prev) => ({ ...prev, [suggestionId]: { status: action === 'apply' ? 'applied' : 'dismissed' } }));
    } catch (err) {
      setContextActionState((prev) => ({
        ...prev, [suggestionId]: { status: 'error', message: err.message || '처리하지 못했습니다.' },
      }));
    }
  };

  /**
   * 적용·거절. 성공하면 카드를 지우지 않고 결과 문구로 바꾼다 — 사라지면 사용자가 방금
   * 무엇을 승인했는지 확인할 방법이 없다.
   *
   * 적용 후에는 오늘·일정 화면과 가용시간이 새 사실을 봐야 하므로 새로고침을 알린다.
   */
  /**
   * 일정표 이미지를 읽는다. 대화가 아직 없으면 먼저 만든다 — 후보는 대화에 매달린다.
   *
   * 실패해도 아무것도 저장되지 않았으므로 다시 고르면 그만이다.
   */
  /** 아직 적용도 거절도 되지 않은 후보. [모두 적용]이 다루는 범위다. */
  const pendingScheduleIds = scheduleSuggestions
    .filter((s) => {
      const status = scheduleActionState[s.suggestionId]?.status;
      return status !== 'applied' && status !== 'dismissed' && status !== 'working';
    })
    .map((s) => s.suggestionId);

  const handleImageChosen = useCallback(async (file) => {
    if (!file || importing) return;
    setImportError(null);
    setImporting(true);
    try {
      let targetConversationId = activeConversationId;
      if (!targetConversationId) {
        const created = await conversationAPI.create(scope.conversationScope, scope.courseId ?? null);
        targetConversationId = created.conversationId;
        setActiveConversationId(targetConversationId);
      }
      const result = await scheduleImportAPI.extract(targetConversationId, file);
      setExtraction({ ...result, conversationId: targetConversationId });
    } catch (err) {
      setImportError(err.message || '조금 뒤에 다시 시도해 주세요.');
    } finally {
      setImporting(false);
    }
  }, [activeConversationId, importing, scope]);

  /**
   * 입력창에 이미지를 붙여넣으면 그대로 읽는다.
   *
   * 캡처 도구로 잘라 바로 붙여넣는 것이 근무표를 가져오는 가장 흔한 경로다. 파일로 저장한
   * 뒤 다시 고르게 하면 그 사이에 사진이 디스크에 남는다.
   */
  const handlePaste = useCallback((event) => {
    const item = [...(event.clipboardData?.items ?? [])]
      .find((i) => i.kind === 'file' && i.type.startsWith('image/'));
    if (!item) return;
    const file = item.getAsFile();
    if (!file) return;
    event.preventDefault();
    handleImageChosen(file);
  }, [handleImageChosen]);

  const handleImportConfirm = async ({ conversationId, ...body }) => {
    const created = await scheduleImportAPI.confirm(conversationId, {
      idempotencyKey: crypto.randomUUID(),
      ...body,
    });
    setExtraction(null);
    setScheduleSuggestions((prev) => [...prev, ...created]);
  };

  /**
   * 화면에 남아 있는 후보를 한 번에 적용한다. 전부 되거나 전부 안 된다 — 서버가 한
   * 트랜잭션으로 묶으므로 절반만 들어간 상태가 없다.
   */
  const handleApplyAll = async (ids) => {
    setBatchState({ status: 'working' });
    try {
      await scheduleSuggestionAPI.applyBatch(ids);
      setScheduleActionState((prev) => {
        const next = { ...prev };
        ids.forEach((id) => { next[id] = { status: 'applied' }; });
        return next;
      });
      setBatchState(null);
      await onScheduleApplied?.();
    } catch (err) {
      setBatchState({ status: 'error', message: err.message || '조금 뒤에 다시 시도해 주세요.' });
    }
  };

  const handleScheduleAction = async (suggestionId, action, editedPayload) => {
    setScheduleActionState((prev) => ({ ...prev, [suggestionId]: { status: 'working' } }));
    try {
      if (action === 'apply') await scheduleSuggestionAPI.apply(suggestionId, editedPayload ?? null);
      else await scheduleSuggestionAPI.dismiss(suggestionId);
      setScheduleActionState((prev) => ({
        ...prev, [suggestionId]: { status: action === 'apply' ? 'applied' : 'dismissed' },
      }));
      if (action === 'apply') await onScheduleApplied?.();
    } catch (err) {
      setScheduleActionState((prev) => ({
        ...prev, [suggestionId]: { status: 'error', message: err.message || '처리하지 못했습니다.' },
      }));
    }
  };

  /*
   * 옆 칸(범위·자료, 계획 방향)은 이 패널 밖에 있지만 같은 대화를 본다. 대화 상태를 두 곳에서 따로 들면
   * 같은 질문·다른 방향이 두 군데에 보이게 되므로, 원본은 여기 하나고 셸에는 읽을 값만 올린다.
   */
  const workspace = variant === 'workspace';
  const hasMessages = messages.length > 0;
  useEffect(() => {
    onConsultState?.({
      conversationId: activeConversationId,
      courseId: scope.courseId ?? null,
      hasMessages,
      direction: consultDirection,
      understanding: consultUnderstanding,
      stage: sending ? periodPlanStage : null,
      sending,
    });
  }, [onConsultState, activeConversationId, scope.courseId, hasMessages, consultDirection, consultUnderstanding,
    periodPlanStage, sending]);

  const prompts = SUGGESTED_PROMPTS[scope.kind] ?? SUGGESTED_PROMPTS.all;
  const visibleMessages = messages.filter((m) => m.role !== 'ASSISTANT' || m.streaming || m.content);

  return (
    <aside className={`ai-panel${workspace ? ' ai-panel-workspace' : ''}`} aria-label={workspace ? '상담 대화' : 'AI'}>
      <header className="ai-panel-head">
        <span className="ai-panel-title"><Sparkles size={15} /> {workspace ? '상담' : 'AI'}</span>
        <span className="ai-panel-head-actions">
          {/*
            좁은 화면에서는 옆 칸이 접혀 있다. 여는 버튼을 대화 머리에 둔다 — 넓은 화면에서는 두 칸이 이미
            보이므로 CSS가 이 버튼들을 숨긴다.
          */}
          {workspace && onOpenScopePane && (
            <button type="button" className="btn-ghost btn-sm consult-pane-toggle" onClick={onOpenScopePane}>
              <FolderOpen size={14} /> 범위·자료
            </button>
          )}
          {workspace && onOpenPreviewPane && (
            <button type="button" className="btn-ghost btn-sm consult-pane-toggle" onClick={onOpenPreviewPane}>
              <ListChecks size={14} /> 계획 미리보기
            </button>
          )}
          {onOpenMemory && (
            <button type="button" className="icon-btn" onClick={onOpenMemory}
              title="AI가 이해한 내 상황" aria-label="AI가 이해한 내 상황">
              <BrainCircuit size={16} />
            </button>
          )}
          <button type="button" className="icon-btn" onClick={openList} title="대화 목록" aria-label="대화 목록">
            <List size={16} />
          </button>
          <button type="button" className="icon-btn" onClick={startNewConversation} title="새 대화" aria-label="새 대화">
            <Plus size={16} />
          </button>
          {/* 작업 공간에서는 이 패널이 화면의 가운데다 — 접을 곳이 없다. */}
          {!workspace && (
            <button type="button" className="icon-btn" onClick={onCollapse} title="패널 접기" aria-label="패널 접기">
              <PanelRightClose size={16} />
            </button>
          )}
        </span>
      </header>

      <div className="ai-panel-scope">
        <span className="ai-panel-scope-label">지금 참고</span>
        <span className="ai-panel-scope-value">{scope.label}</span>
      </div>

      {view === 'list' ? (
        <div className="ai-panel-body">
          <button type="button" className="btn-ghost ai-panel-back" onClick={() => setView('chat')}>
            <ArrowLeft size={14} /> 대화로 돌아가기
          </button>
          {/* 목록에서 삭제하다 실패했을 때 아무 말도 없이 그대로 남아 있으면 안 된다. */}
          {loadError && <p className="ai-error">{loadError}</p>}
          {listLoading && <p className="ai-hint"><Loader2 size={14} className="spin" /> 불러오는 중...</p>}
          {!listLoading && conversationList.length === 0 && (
            <p className="ai-hint">아직 이 범위에서 나눈 대화가 없어요.</p>
          )}
          {/* 행 전체를 button으로 두면 삭제 버튼을 button 안에 중첩하게 된다 —
              열기와 삭제는 각각 독립된 조작이므로 container + 두 개의 button으로 나눈다. */}
          {conversationList.map((item) => (
            <div
              key={item.conversationId}
              className={`ai-conv-row${item.conversationId === activeConversationId ? ' is-active' : ''}`}
            >
              <button
                type="button"
                className="ai-conv-item"
                onClick={() => selectConversation(item.conversationId)}
              >
                <MessageCircle size={13} />
                <span className="ai-conv-item-title">{item.title || '(제목 없음)'}</span>
                {item.pendingProposalCount > 0 && (
                  <span className="ai-conv-item-badge">검토 전 {item.pendingProposalCount}</span>
                )}
                <span className="ai-conv-item-time">{formatRelativeTime(item.lastMessageAt)}</span>
              </button>
              <button
                type="button"
                className="icon-btn ai-conv-delete"
                aria-label="대화 삭제"
                title="대화 삭제"
                disabled={deletingId === item.conversationId}
                onClick={() => handleDeleteConversation(item.conversationId)}
              >
                {deletingId === item.conversationId
                  ? <Loader2 size={14} className="spin" />
                  : <Trash2 size={14} />}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="ai-panel-body" ref={bodyRef} onScroll={handleBodyScroll}>
            {loadingHistory && <p className="ai-hint"><Loader2 size={14} className="spin" /> 대화를 불러오는 중...</p>}
            {loadError && <p className="ai-error">{loadError}</p>}

            {!loadingHistory && visibleMessages.length === 0 && (
              <div className="ai-empty">
                <p className="ai-hint">{scope.emptyHint}</p>
                <div className="ai-prompt-list">
                  {prompts.map((prompt) => (
                    <button key={prompt} type="button" className="ai-prompt" onClick={() => typeInput(prompt)}>
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {visibleMessages.map((m) => (
              <div key={m.key} className={`ai-bubble ai-bubble-${m.role.toLowerCase()}`}>
                <p>{m.content}{m.streaming && <span className="ai-cursor" aria-hidden="true" />}</p>
              </div>
            ))}

            {/*
              * 후보가 여럿이면 한 번에 적용할 수 있게 한다. 근무표 한 장이 대여섯 개를
              * 만들고, 그것을 하나씩 누르게 하는 것은 화면이 사용자에게 일을 넘기는 것이다.
              * 카드는 그대로 둔다 — 새 카드를 만들면 같은 후보를 두 곳에서 그리게 된다.
              */}
            {pendingScheduleIds.length > 1 && (
              <div className="ai-schedule-batch">
                <span>일정 후보 {pendingScheduleIds.length}개</span>
                <button type="button" className="btn-ghost btn-sm"
                  disabled={batchState?.status === 'working'}
                  onClick={() => handleApplyAll(pendingScheduleIds)}>
                  {batchState?.status === 'working'
                    ? <Loader2 size={13} className="spin" /> : null} 모두 적용
                </button>
              </div>
            )}
            {batchState?.status === 'error' && <p className="ai-error">{batchState.message}</p>}

            {scheduleSuggestions.map((suggestion) => (
              <ScheduleSuggestionCard
                key={suggestion.suggestionId}
                suggestion={suggestion}
                state={scheduleActionState[suggestion.suggestionId]}
                onApply={(id, payload) => handleScheduleAction(id, 'apply', payload)}
                onDismiss={(id) => handleScheduleAction(id, 'dismiss')}
              />
            ))}

            {contextSuggestions.map((suggestion) => {
              const copy = contextSuggestionCopy(suggestion.operation);
              const state = contextActionState[suggestion.suggestionId];
              const resolved = state?.status === 'applied' || state?.status === 'dismissed';
              return (
                <div key={suggestion.suggestionId} className="ai-context-card">
                  <p className="ai-context-heading">{copy.heading}</p>
                  {suggestion.operation === 'SUPERSEDE' ? (
                    <>
                      {suggestion.targetContextContent && (
                        <p className="ai-context-before">{suggestion.targetContextContent}</p>
                      )}
                      <p className="ai-context-after">{suggestion.proposedContent}</p>
                    </>
                  ) : (
                    <p className="ai-context-after">
                      {suggestion.operation === 'ADD' ? suggestion.proposedContent : suggestion.targetContextContent}
                    </p>
                  )}
                  {suggestion.reason && <p className="ai-context-reason">{suggestion.reason}</p>}
                  {state?.status === 'error' && <p className="ai-error">{state.message}</p>}
                  {resolved ? (
                    <p className="ai-context-resolved">
                      {state.status === 'applied' ? '기억해뒀어요.' : '저장하지 않았어요.'}
                    </p>
                  ) : (
                    <div className="ai-context-actions">
                      <button type="button" className="btn-ghost btn-sm"
                        onClick={() => handleContextAction(suggestion.suggestionId, 'dismiss')}
                        disabled={state?.status === 'working'}>
                        {copy.secondaryLabel}
                      </button>
                      <button type="button" className="btn-primary btn-sm"
                        onClick={() => handleContextAction(suggestion.suggestionId, 'apply')}
                        disabled={state?.status === 'working'}>
                        {copy.primaryLabel}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/*
              이해한 내용이 질문보다 먼저다 — "이렇게 알아들었어요"를 보고 나서 다음 질문에 답하는 순서가 자연스럽다.
              두 카드 모두 서버가 실어 줬을 때만 나온다.
            */}
            {!sending && consultUnderstanding.length > 0 && (
              <ConsultUnderstandingCard
                key={`u-${activeConversationId ?? 'new'}-${consultUnderstanding.map((l) => l.id).join(',')}`}
                lines={consultUnderstanding}
                onEdit={handleUnderstandingEdit}
                onRestate={handleUnderstandingRestate}
              />
            )}
            {consultQuestion && !sending && (
              <ConsultQuestionCard
                key={`q-${consultQuestion.id}`}
                question={consultQuestion}
                disabled={sending}
                onAnswer={handleQuestionAnswer}
                onPlanNow={handlePlanNow}
                onFocusInput={focusInput}
              />
            )}

            {quickReplies.length > 0 && !sending && (
              <div className="ai-quick-replies" role="group" aria-label="빠른 답">
                {quickReplies.map((text) => (
                  <button key={text} type="button" className="chip" onClick={() => handleQuickReply(text)}>
                    {text}
                  </button>
                ))}
              </div>
            )}

            {/*
              기간이 없는 OFFER는 무엇을 만들지 모르는 버튼이다 — 눌러도 서버가 400으로
              거절한다. 정상 응답에는 서버가 항상 기간을 싣지만, 그렇지 않은 응답에서는
              눌리는 버튼 대신 아무것도 보여주지 않는다.
            */}
            {currentOffer?.periodStartDate && !sending && (
              <div className="ai-offer">
                {/*
                  기간을 숨기고 버튼만 보여주면 사용자는 AI가 어떻게 해석했는지 모르는 채로
                  누르게 된다. 그러면 "사용자가 승인한 기간"이라고 부를 수 없다 — 날짜를 보고
                  누른 것만 승인이다. 다르면 대화로 고쳐 말하면 새 OFFER가 온다.
                */}
                {currentOffer.periodStartDate && (
                  <p className="ai-hint">
                    계획 기간 {formatPeriod(currentOffer.periodStartDate, currentOffer.periodEndDate)}
                    {currentOffer.intensity ? ` · ${PLAN_INTENSITY_LABEL[currentOffer.intensity] ?? currentOffer.intensity}` : ''}
                    {currentOffer.type === 'CREATE_PERIOD_PLAN' ? ' · 검토 후 계획으로 확정돼요' : ''}
                  </p>
                )}
                <button type="button" className="btn-primary ai-offer-btn" onClick={handleCreateProposalFromOffer}>
                  {currentOffer.label || '이 내용으로 초안 만들기'}
                </button>
              </div>
            )}

            {periodPlanStage && sending && (
              <p className="ai-hint" role="status"><Loader2 size={13} className="spin" /> {periodPlanStage}…</p>
            )}

            {periodPlanNotice != null && (
              <p className="ai-applied">
                <Sparkles size={13} />{' '}
                {workspace
                  ? `계획 초안 ${periodPlanNotice}개를 만들었어요. 계획 미리보기에서 확인하고 적용해 주세요.`
                  : `계획 초안 ${periodPlanNotice}개를 계획 화면에 표시했어요. 확인하고 확정해주세요.`}
              </p>
            )}

            {/* 초안 자체는 화면에 있다. 여기서는 그쪽을 가리키기만 한다. */}
            {draft && (
              <button type="button" className="ai-draft-link" onClick={onFocusDraft}>
                <Sparkles size={13} />
                <span>초안 {draft.cards.filter((c) => !c.excluded).length}개를 화면에 표시했어요. 확인하고 적용해주세요.</span>
              </button>
            )}

            {appliedNotice && (
              <p className="ai-applied"><CircleCheck size={14} /> 적용했어요.</p>
            )}

            {sendError && <p className="ai-error">{sendError}</p>}
          </div>

          {/*
            좁은 화면에서는 초안이 시트 안에 있다. 빠진 프로젝트나 "시간은 가정"처럼 놓치면 안 되는 사실은
            시트를 열지 않아도 입력창 바로 위에 한 줄로 보인다. 누르면 미리보기가 열린다.
          */}
          {workspace && draftNotice && (
            <button type="button" className="consult-draft-notice" onClick={onOpenPreviewPane}>
              <ListChecks size={13} aria-hidden="true" />
              <span>{draftNotice}</span>
            </button>
          )}

          <footer className="ai-panel-foot">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                // 같은 파일을 다시 고를 수 있게 값을 비운다. 안 그러면 두 번째 선택에서
                // change가 안 뜬다.
                e.target.value = '';
                handleImageChosen(file);
              }}
            />
            <button
              type="button"
              className="btn-ghost ai-attach"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending || loadingHistory || importing}
              aria-label="일정표 이미지 첨부"
              title="근무표 같은 일정표 이미지를 넣으면 일정 후보로 만들어요"
            >
              {importing ? <Loader2 size={15} className="spin" /> : <ImagePlus size={15} />}
            </button>
            <textarea
              ref={inputRef}
              className="ai-textarea"
              placeholder={scope.placeholder}
              value={inputText}
              onChange={(e) => typeInput(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
              /*
                응답을 기다리는 동안에도 다음 말을 쓸 수 있다. 보내기만 막는다 — 질문 카드나 진행 표시가
                자유 입력을 가로막지 않는다.
              */
              disabled={loadingHistory}
              rows={2}
            />
            <button
              type="button"
              className="btn-primary ai-send"
              onClick={handleSend}
              disabled={sending || loadingHistory || !inputText.trim()}
              aria-label="보내기"
            >
              {sending ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
            </button>
          </footer>

          {importing && (
            <p className="ai-import-status" role="status">
              <Loader2 size={13} className="spin" /> 표를 읽고 있어요. 십여 초 걸려요.
            </p>
          )}
          {importError && <p className="ai-error">{importError}</p>}

          {extraction && (
            <ScheduleImportReviewModal
              extraction={extraction}
              conversationId={extraction.conversationId}
              onCancel={() => setExtraction(null)}
              onConfirm={handleImportConfirm}
            />
          )}
        </>
      )}
    </aside>
  );
}
