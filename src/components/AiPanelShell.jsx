/**
 * 우측 AI 패널.
 *
 * 자유로운 대화가 기본이다: 인사·잡담·고민 상담은 말풍선으로만 오간다. 계획을 짤 정보가
 * 충분해지면 AI가 먼저 "초안을 만들어볼까?"(OFFER) 하고 물어보고, 사용자가 그 버튼을
 * 누르거나 스스로 "계획 짜줘"처럼 명시적으로 요청했을 때만 편집 가능한 Proposal 초안이
 * 생긴다. Proposal은 승인 전 초안이며, 하단 단일 "오늘에 적용" 버튼으로만 반영된다.
 *
 * 대화 목록 / 새 대화:
 * - "새 대화"는 화면만 지우는 게 아니라 이후 메시지를 AI에 보낼 때 이전 대화의 채팅 기록을
 *   참고하지 않는다는 뜻이다. 이전 대화·적용 전 제안은 서버에 그대로 남고 삭제되지 않는다.
 * - "+ 새 대화"를 누르는 즉시 빈 conversation을 만들지 않는다. activeConversationId를
 *   null(신규 준비 상태)로 두고, 첫 메시지를 실제로 보낼 때만 서버에 대화를 생성한다 —
 *   그래서 아무것도 보내지 않고 패널을 닫아도 빈 대화가 목록에 쌓이지 않는다.
 *
 * Quick + 는 별도 기능이 아니다(v6.1 §6). 이 패널을 여는 축약 진입점일 뿐이고,
 * 입력 후에는 동일한 상담 흐름을 그대로 탄다.
 *
 * 카드마다 적용 버튼을 두지 않는다 — 적용은 묶음 전체 단일 버튼으로만 한다.
 * 사용자에게 "대화 모드/제안 모드" 스위치를 노출하지 않는다 — 입력창과 전송 버튼은 항상 하나뿐이다.
 */

import { useEffect, useRef, useState } from 'react';
import { X, Sparkles, Loader2, CircleCheck, Send, Ban, List, Plus, MessageCircle, RefreshCw, CalendarX } from 'lucide-react';
import { conversationAPI, proposalAPI, schedulePreviewAPI } from '../api/api.js';
import { PRIORITY_LABEL } from '../types/execution.js';

const PRIORITY_OPTIONS = ['MUST', 'SHOULD', 'OPTIONAL'];
const NEW_CONVERSATION_DRAFT_KEY = '__new__';

/** 오늘 화면 전용 추천 질문. 지금은 이 패널이 오늘 상담(TODAY)만 다루므로 딱 이 범위만 보여준다. */
const SUGGESTED_PROMPTS = ['지금부터 할 수 있는 일을 정리해줘', '남은 오늘 계획을 다시 짜줘'];

function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cardFromResponseItem(item) {
  return {
    proposalItemId: item.proposalItemId,
    status: item.status,
    title: item.title ?? '',
    description: item.description ?? '',
    expectedMinutes: item.expectedMinutes ?? 0,
    priority: item.priority ?? 'SHOULD',
    placementType: item.placementType ?? 'DATE_ONLY',
    scheduledStartAt: item.scheduledStartAt ?? null,
    scheduledEndAt: item.scheduledEndAt ?? null,
    original: {
      title: item.title ?? '',
      description: item.description ?? '',
      expectedMinutes: item.expectedMinutes ?? 0,
      priority: item.priority ?? 'SHOULD',
    },
  };
}

function isCardEdited(card) {
  return (
    card.title !== card.original.title ||
    card.description !== card.original.description ||
    card.expectedMinutes !== card.original.expectedMinutes ||
    card.priority !== card.original.priority
  );
}

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

function fmtDateShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${WEEKDAY_KO[d.getDay()]} ${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function fmtTimeShort(iso) {
  return iso ? String(iso).slice(11, 16) : '';
}

const CONFIDENCE_LABEL = { HIGH: '신뢰도 높음', MEDIUM: '신뢰도 보통', LOW: '신뢰도 낮음' };

/**
 * schedulePreview가 있으면(7일 범위 배치 후보) 그 계산 결과를 우선 보여준다. 없으면 기존
 * TODAY 흐름 그대로 카드 자체의 배치값을 보여준다 — 이 분기가 기존 오늘 제안 동작을 그대로
 * 유지하는 지점이다.
 */
function placementLabel(card, scheduleResult) {
  if (scheduleResult?.placed) {
    return `${fmtDateShort(scheduleResult.placed.scheduledDate)} ${fmtTimeShort(scheduleResult.placed.scheduledStartAt)} ~ ${fmtTimeShort(scheduleResult.placed.scheduledEndAt)}`;
  }
  if (scheduleResult?.unplaced) {
    return '미배치';
  }
  if (card.placementType === 'TIME_FIXED' && card.scheduledStartAt && card.scheduledEndAt) {
    return `${fmtTimeShort(card.scheduledStartAt)} ~ ${fmtTimeShort(card.scheduledEndAt)}`;
  }
  if (card.placementType === 'UNSCHEDULED') {
    return '날짜 미정 · 자동 배치 예정';
  }
  return '날짜만 지정';
}

function formatRelativeTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return `${hh}:${mm}`;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/** 목록을 "오늘 / 이전 7일 / 이전 대화"로 나눈다. 마지막 메시지 시각 내림차순은 서버가 이미 보장한다. */
function groupConversations(list) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysAgo = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);

  const groups = { today: [], last7Days: [], older: [] };
  for (const item of list) {
    const lastAt = item.lastMessageAt ? new Date(item.lastMessageAt) : null;
    if (lastAt && lastAt >= startOfToday) groups.today.push(item);
    else if (lastAt && lastAt >= sevenDaysAgo) groups.last7Days.push(item);
    else groups.older.push(item);
  }
  return groups;
}

export default function AiPanelShell({ open, contextLabel, onClose, onApplied }) {
  const [view, setView] = useState('chat'); // 'chat' | 'list'

  const [conversationList, setConversationList] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState(null);

  const [activeConversationId, setActiveConversationId] = useState(null); // null = 새 대화 준비 상태
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [initialized, setInitialized] = useState(false);

  const [messages, setMessages] = useState([]); // { key, role, content, responseType, streaming }
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);
  const lastUserMessageIdRef = useRef(null);

  const [currentOffer, setCurrentOffer] = useState(null);
  const [currentProposal, setCurrentProposal] = useState(null); // { proposalId, cards: [] }
  const [excludedIds, setExcludedIds] = useState(() => new Set());

  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState(null);
  const [applySuccess, setApplySuccess] = useState(false);

  // 7일 범위 일정 후보 배치 미리보기. currentProposal에 UNSCHEDULED 후보가 있을 때만 쓴다 —
  // 그렇지 않은(기존 오늘 제안) 흐름은 이 값이 항상 null이고 기존 카드 UI만 그대로 보인다.
  const [schedulePreview, setSchedulePreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const [availabilityOverrides, setAvailabilityOverrides] = useState([]);
  // 사용자가 특정 항목을 직접 특정 날짜·시각으로 고정한 값. { [proposalItemId]: {fixedStartAt, fixedEndAt} }
  const [itemFixedOverrides, setItemFixedOverrides] = useState({});
  const [exceptionDraft, setExceptionDraft] = useState({ date: '', start: '', end: '' });
  // recomputeSchedule 동시 호출을 막는다 — state는 비동기라 클릭 두 번이 겹치는 순간을
  // 못 잡을 수 있어 ref로 즉시 확인한다.
  const previewLoadingRef = useRef(false);

  const bodyRef = useRef(null);
  const abortControllerRef = useRef(null);
  // 진행 중인 스트림이 실제로 어느 conversation을 위한 것인지. 사용자가 그 사이 다른 대화로
  // 전환하면 이 값이 바뀌므로, 뒤늦게 도착하는 SSE 이벤트를 화면에 반영하지 않고 버릴 수 있다.
  const activeStreamConversationIdRef = useRef(null);
  // 대화별로 아직 보내지 않은 입력값을 보존한다(과도한 영구 저장 없이 세션 중 메모리에만).
  const draftsRef = useRef({});
  // 대화 불러오기가 겹칠 때(빠르게 여러 번 클릭 등) 가장 마지막 요청 결과만 반영한다.
  const loadTokenRef = useRef(0);

  // 패널이 실제로 unmount될 때(로그아웃 등) 진행 중인 스트림을 취소한다. 취소 후 여기서
  // 자동으로 다시 연결하거나 재전송하지 않는다.
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // 최초 오픈 시: 대화 목록을 불러와 가장 최근 대화가 있으면 이어서 열고, 없으면 새 대화
  // 준비 상태로 둔다. 패널을 열 때마다 빈 conversation을 만들지 않는다.
  useEffect(() => {
    if (!open || initialized) return;
    setInitialized(true);

    (async () => {
      try {
        const list = await conversationAPI.list();
        setConversationList(list);
        if (list.length > 0) {
          await selectConversation(list[0].conversationId);
        }
      } catch (err) {
        setLoadError(err.message || '대화 목록을 불러오지 못했습니다.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialized]);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages, currentOffer, currentProposal, view]);

  const hasSchedulingCandidates = !!currentProposal?.cards?.some((c) => c.placementType === 'UNSCHEDULED');

  /**
   * 7일 범위 배치 재계산. OpenAI를 호출하지 않는다 — 서버가 Timefold만 다시 돈다.
   * previewLoadingRef로 중복 요청을 막는다(버튼 disabled와 별개로, 클릭이 겹치는 순간을 잡는다).
   *
   * 아래 useEffect가 이 함수를 참조하므로, 이 함수와 useEffect 모두 `if (!open) return null`
   * 이전에 둔다 — 훅은 렌더마다 같은 순서로 호출돼야 하고(rules-of-hooks), 그 훅이 참조하는
   * 클로저 변수도 open이 false인 렌더에서 여전히 정의돼 있어야 한다.
   */
  const recomputeSchedule = async (proposalId, overridesForRequest, itemsForRequest) => {
    if (previewLoadingRef.current) return;
    previewLoadingRef.current = true;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const result = await schedulePreviewAPI.recompute(proposalId, {
        availabilityOverrides: overridesForRequest,
        items: itemsForRequest,
      });
      setSchedulePreview(result);
      setAvailabilityOverrides(result?.userOverrides ?? overridesForRequest);
    } catch (err) {
      setPreviewError(err.message || '다시 배치하지 못했습니다.');
    } finally {
      previewLoadingRef.current = false;
      setPreviewLoading(false);
    }
  };

  const buildItemsOverridePayload = (overridesMap) =>
    Object.entries(overridesMap).map(([proposalItemId, fix]) => ({
      proposalItemId: Number(proposalItemId),
      fixedStartAt: fix?.fixedStartAt ?? null,
      fixedEndAt: fix?.fixedEndAt ?? null,
    }));

  // 새 Proposal이 UNSCHEDULED 후보를 담고 도착했거나(SSE), 적용 전 제안이 있는 대화를 다시
  // 열었을 때(새로고침 포함) 저장된 계산 결과를 복원한다. 없으면 서버에 자동으로 첫 계산을
  // 요청한다 — 사용자가 클릭하지 않아도 "이번 계획에 쓸 수 있는 시간" 요약이 바로 보인다.
  useEffect(() => {
    if (!currentProposal || !hasSchedulingCandidates) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const stored = await schedulePreviewAPI.get(currentProposal.proposalId);
        if (cancelled) return;
        if (stored) {
          setSchedulePreview(stored);
          setAvailabilityOverrides(stored.userOverrides ?? []);
        } else {
          await recomputeSchedule(currentProposal.proposalId, [], []);
        }
      } catch (err) {
        if (!cancelled) setPreviewError(err.message || '가용시간 계산을 불러오지 못했습니다.');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProposal?.proposalId, hasSchedulingCandidates]);

  if (!open) return null;

  const saveDraftForCurrent = () => {
    draftsRef.current[activeConversationId ?? NEW_CONVERSATION_DRAFT_KEY] = inputText;
  };

  const resetTurnState = () => {
    setMessages([]);
    setCurrentOffer(null);
    setCurrentProposal(null);
    setExcludedIds(new Set());
    setApplySuccess(false);
    setApplyError(null);
    setSendError(null);
    setLoadError(null);
    setSchedulePreview(null);
    setPreviewError(null);
    setAvailabilityOverrides([]);
    setItemFixedOverrides({});
    setExceptionDraft({ date: '', start: '', end: '' });
    lastUserMessageIdRef.current = null;
  };

  const handleAddException = async () => {
    if (!currentProposal || !exceptionDraft.date || !exceptionDraft.start || !exceptionDraft.end) return;
    const next = [
      ...availabilityOverrides,
      {
        startAt: `${exceptionDraft.date}T${exceptionDraft.start}:00`,
        endAt: `${exceptionDraft.date}T${exceptionDraft.end}:00`,
        available: false,
      },
    ];
    setAvailabilityOverrides(next);
    setExceptionDraft({ date: '', start: '', end: '' });
    await recomputeSchedule(currentProposal.proposalId, next, buildItemsOverridePayload(itemFixedOverrides));
  };

  const handleRemoveException = async (index) => {
    if (!currentProposal) return;
    const next = availabilityOverrides.filter((_, i) => i !== index);
    setAvailabilityOverrides(next);
    await recomputeSchedule(currentProposal.proposalId, next, buildItemsOverridePayload(itemFixedOverrides));
  };

  const handleReplan = async () => {
    if (!currentProposal) return;
    await recomputeSchedule(currentProposal.proposalId, availabilityOverrides, buildItemsOverridePayload(itemFixedOverrides));
  };

  const handleFixItemTime = async (proposalItemId, date, start, end) => {
    if (!currentProposal || !date || !start || !end) return;
    const nextMap = {
      ...itemFixedOverrides,
      [proposalItemId]: { fixedStartAt: `${date}T${start}:00`, fixedEndAt: `${date}T${end}:00` },
    };
    setItemFixedOverrides(nextMap);
    await recomputeSchedule(currentProposal.proposalId, availabilityOverrides, buildItemsOverridePayload(nextMap));
  };

  const handleUnfixItemTime = async (proposalItemId) => {
    if (!currentProposal) return;
    const nextMap = { ...itemFixedOverrides };
    delete nextMap[proposalItemId];
    setItemFixedOverrides(nextMap);
    await recomputeSchedule(currentProposal.proposalId, availabilityOverrides, buildItemsOverridePayload(nextMap));
  };

  /** 대화 목록에서 하나를 골랐을 때 + 최초 오픈 시 가장 최근 대화를 이어갈 때 공용으로 쓴다. */
  const selectConversation = async (conversationId) => {
    saveDraftForCurrent();
    abortControllerRef.current?.abort();
    activeStreamConversationIdRef.current = null;

    const myToken = ++loadTokenRef.current;

    setView('chat');
    setActiveConversationId(conversationId);
    resetTurnState();
    setInputText(draftsRef.current[conversationId] ?? '');
    setLoadingHistory(true);

    try {
      const history = await conversationAPI.getMessages(conversationId);
      if (loadTokenRef.current !== myToken) return; // 그 사이 다른 대화로 또 전환됨

      setMessages(
        history.map((m) => ({
          key: `m-${m.messageId}`,
          role: m.role,
          content: m.content,
          responseType: m.responseType,
          proposalId: m.proposalId,
          streaming: false,
        })),
      );

      const lastUser = [...history].reverse().find((m) => m.role === 'USER');
      if (lastUser) lastUserMessageIdRef.current = lastUser.messageId;

      const last = history.length > 0 ? history[history.length - 1] : null;
      if (last && last.role === 'ASSISTANT') {
        if (last.responseType === 'OFFER') {
          setCurrentOffer({ type: 'CREATE_PROPOSAL', label: '이 내용으로 계획 초안 만들기' });
        } else if (last.responseType === 'PROPOSAL' && last.proposalId) {
          try {
            const proposal = await proposalAPI.get(last.proposalId);
            if (loadTokenRef.current === myToken && proposal.status === 'PROPOSED') {
              setCurrentProposal({ proposalId: proposal.proposalId, cards: proposal.items.map(cardFromResponseItem) });
            }
          } catch {
            // 제안 조회 실패해도 대화 자체는 정상 표시한다.
          }
        }
      }
    } catch (err) {
      if (loadTokenRef.current === myToken) {
        setLoadError(err.message || '대화를 불러오지 못했습니다. 삭제되었거나 접근할 수 없어요.');
      }
    } finally {
      if (loadTokenRef.current === myToken) setLoadingHistory(false);
    }
  };

  /** "+ 새 대화": 이전 대화·제안은 그대로 두고 빈 화면으로만 전환한다. 서버 호출은 아직 없다. */
  const startNewConversation = () => {
    saveDraftForCurrent();
    abortControllerRef.current?.abort();
    activeStreamConversationIdRef.current = null;
    loadTokenRef.current += 1; // 진행 중이던 대화 로딩 결과를 무시한다

    setView('chat');
    setActiveConversationId(null);
    resetTurnState();
    setInputText(draftsRef.current[NEW_CONVERSATION_DRAFT_KEY] ?? '');
  };

  const openList = async () => {
    setView('list');
    setListLoading(true);
    setListError(null);
    try {
      const list = await conversationAPI.list();
      setConversationList(list);
    } catch (err) {
      setListError(err.message || '대화 목록을 불러오지 못했습니다.');
    } finally {
      setListLoading(false);
    }
  };

  const runTurn = async (payload, { optimisticUserText } = {}) => {
    // 이전 요청이 아직 살아있으면(정상적으로는 sending 가드가 막지만 방어적으로) 먼저 취소한다.
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setSending(true);
    setSendError(null);
    setCurrentOffer(null);

    if (optimisticUserText) {
      setMessages((prev) => [...prev, { key: `u-${Date.now()}`, role: 'USER', content: optimisticUserText, streaming: false }]);
    }

    const streamingKey = `a-${Date.now()}`;
    let started = false;
    let targetConversationId = activeConversationId;

    try {
      if (!targetConversationId) {
        const created = await conversationAPI.create('TODAY');
        if (controller.signal.aborted) return; // 생성되는 사이 다른 대화로 전환/취소됨
        targetConversationId = created.conversationId;
        setActiveConversationId(targetConversationId);
      }
      activeStreamConversationIdRef.current = targetConversationId;

      await conversationAPI.sendMessage(targetConversationId, payload, {
        signal: controller.signal,
        onEvent: (eventName, data) => {
          // 이 스트림이 시작된 대화에서 이미 벗어났으면(전환/새 대화) 화면에 반영하지 않는다.
          if (activeStreamConversationIdRef.current !== targetConversationId) return;

          if (eventName === 'message.started') {
            started = true;
            setMessages((prev) => [...prev, { key: streamingKey, role: 'ASSISTANT', content: '', streaming: true }]);
          } else if (eventName === 'message.delta') {
            setMessages((prev) =>
              prev.map((m) => (m.key === streamingKey ? { ...m, content: m.content + (data?.text ?? '') } : m)),
            );
          } else if (eventName === 'offer.ready') {
            setCurrentOffer(data?.offerAction ?? null);
          } else if (eventName === 'proposal.ready') {
            setCurrentProposal({ proposalId: data.proposalId, cards: (data.items ?? []).map(cardFromResponseItem) });
            setExcludedIds(new Set());
          } else if (eventName === 'message.completed') {
            if (data?.userMessageId) lastUserMessageIdRef.current = data.userMessageId;
            setMessages((prev) =>
              prev.map((m) =>
                m.key === streamingKey
                  ? { ...m, content: data.reply ?? m.content, responseType: data.responseType, proposalId: data.proposalId, streaming: false }
                  : m,
              ),
            );
          } else if (eventName === 'message.error') {
            setMessages((prev) => prev.filter((m) => m.key !== streamingKey));
            setSendError(
              data?.code === 'E429_001' || data?.code === 'E429_002'
                ? data.message
                : data?.message || 'AI 응답을 받지 못했습니다.',
            );
          }
        },
      });
    } catch (err) {
      if (activeStreamConversationIdRef.current !== targetConversationId) {
        // 이미 다른 대화로 전환된 뒤 도착한 오류 — 지금 화면에는 표시하지 않는다.
        return;
      }
      if (err.name === 'AbortError') {
        // 사용자가 패널을 벗어났거나 의도적으로 취소한 것 — 자동으로 다시 연결하지 않는다.
        setMessages((prev) => prev.filter((m) => m.key !== streamingKey));
        return;
      }
      if (!started) {
        setMessages((prev) => prev.filter((m) => m.key !== streamingKey));
      }
      setSendError(err.message || 'AI 응답을 받지 못했습니다.');
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      if (activeStreamConversationIdRef.current === targetConversationId) {
        setSending(false);
      }
    }
  };

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || sending) return;
    setInputText('');
    draftsRef.current[activeConversationId ?? NEW_CONVERSATION_DRAFT_KEY] = '';
    await runTurn(
      { message: text, requestedAction: 'AUTO', idempotencyKey: newIdempotencyKey() },
      { optimisticUserText: text },
    );
  };

  const handleSuggestedPrompt = (text) => {
    if (sending) return;
    setInputText(text);
  };

  const handleCreateProposalFromOffer = async () => {
    if (sending || !activeConversationId) return;
    await runTurn({
      requestedAction: 'CREATE_PROPOSAL',
      sourceMessageId: lastUserMessageIdRef.current,
      idempotencyKey: newIdempotencyKey(),
    });
  };

  const updateCard = (proposalItemId, patch) => {
    setCurrentProposal((prev) =>
      prev
        ? { ...prev, cards: prev.cards.map((c) => (c.proposalItemId === proposalItemId ? { ...c, ...patch } : c)) }
        : prev,
    );
  };

  const toggleExcluded = (proposalItemId) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(proposalItemId)) next.delete(proposalItemId);
      else next.add(proposalItemId);
      return next;
    });
  };

  /** placedItems에 없으면 UNSCHEDULED로 취급한다(미배치를 사용자가 그대로 남기기로 한 경우 포함). */
  const buildSchedulingEdit = (card) => {
    const placed = schedulePreview?.placedItems?.find((p) => p.proposalItemId === card.proposalItemId);
    const base = {
      proposalItemId: card.proposalItemId,
      title: card.title,
      description: card.description,
      expectedMinutes: card.expectedMinutes,
      priority: card.priority,
    };
    if (placed) {
      return {
        ...base,
        placementType: 'TIME_FIXED',
        scheduledDate: placed.scheduledDate,
        scheduledStartAt: placed.scheduledStartAt,
        scheduledEndAt: placed.scheduledEndAt,
      };
    }
    return { ...base, placementType: 'UNSCHEDULED', scheduledDate: null, scheduledStartAt: null, scheduledEndAt: null };
  };

  const handleApply = async () => {
    if (!currentProposal || applying) return;
    const remaining = currentProposal.cards.filter((c) => !excludedIds.has(c.proposalItemId));
    if (remaining.length === 0) {
      setApplyError('적용할 항목이 없어요. 하나 이상 남겨주세요.');
      return;
    }

    // hasSchedulingCandidates가 아닌 기존 오늘 제안 흐름은 그대로: 실제로 고친 항목만 보낸다.
    const editedItems = hasSchedulingCandidates
      ? remaining.map(buildSchedulingEdit)
      : remaining.filter(isCardEdited).map((card) => ({
          proposalItemId: card.proposalItemId,
          title: card.title,
          description: card.description,
          expectedMinutes: card.expectedMinutes,
          priority: card.priority,
        }));

    setApplying(true);
    setApplyError(null);

    try {
      await proposalAPI.apply(currentProposal.proposalId, editedItems, [...excludedIds]);
      setApplySuccess(true);
      setCurrentProposal(null);
      setExcludedIds(new Set());
      setSchedulePreview(null);
      setAvailabilityOverrides([]);
      setItemFixedOverrides({});
      await onApplied?.();
    } catch (err) {
      setApplyError(err.message || '오늘에 적용하지 못했습니다.');
    } finally {
      setApplying(false);
    }
  };

  const groups = groupConversations(conversationList);

  return (
    <aside className="v6-ai-panel">
      <header className="v6-ai-header">
        <span className="v6-ai-title">
          <Sparkles size={15} /> 상담
        </span>
        <span className="v6-ai-header-actions">
          <button
            type="button"
            className="v6-icon-button"
            onClick={openList}
            aria-label="대화 목록"
            title="대화 목록"
          >
            <List size={16} />
          </button>
          <button
            type="button"
            className="v6-icon-button"
            onClick={startNewConversation}
            aria-label="새 대화"
            title="새 대화"
          >
            <Plus size={16} />
          </button>
          <button type="button" className="v6-icon-button" onClick={onClose} aria-label="닫기" title="닫기">
            <X size={16} />
          </button>
        </span>
      </header>

      {view === 'list' ? (
        <div className="v6-ai-body v6-ai-conversation-list">
          {listLoading && (
            <p className="v6-ai-hint">
              <Loader2 size={14} className="v6-spin" /> 대화 목록을 불러오는 중...
            </p>
          )}
          {listError && <p className="v6-ai-error">{listError}</p>}

          {!listLoading && !listError && conversationList.length === 0 && (
            <p className="v6-ai-hint">아직 나눈 대화가 없어요. 새 대화를 시작해보세요.</p>
          )}

          {!listLoading && !listError && (
            <>
              <ConversationGroup
                label="오늘"
                items={groups.today}
                activeConversationId={activeConversationId}
                onSelect={selectConversation}
              />
              <ConversationGroup
                label="이전 7일"
                items={groups.last7Days}
                activeConversationId={activeConversationId}
                onSelect={selectConversation}
              />
              <ConversationGroup
                label="이전 대화"
                items={groups.older}
                activeConversationId={activeConversationId}
                onSelect={selectConversation}
              />
            </>
          )}
        </div>
      ) : (
        <>
          <div className="v6-ai-context">
            <p className="v6-ai-context-label">지금 참고하는 범위</p>
            <p className="v6-ai-context-value">{contextLabel}</p>
          </div>

          <div className="v6-ai-body v6-ai-chat-body" ref={bodyRef}>
            {loadingHistory && (
              <p className="v6-ai-hint">
                <Loader2 size={14} className="v6-spin" /> 대화를 불러오는 중...
              </p>
            )}
            {loadError && <p className="v6-ai-error">{loadError}</p>}

            {!loadingHistory && !loadError && activeConversationId === null && messages.length === 0 && (
              <div className="v6-ai-new-conversation-hint">
                <p className="v6-ai-hint">
                  새 대화를 시작해보세요.
                  <br />
                  이전 채팅 내용은 이번 대화에서 참고하지 않아요.
                </p>
                <div className="v6-ai-examples">
                  {SUGGESTED_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      className="v6-ai-example"
                      onClick={() => handleSuggestedPrompt(prompt)}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="v6-ai-chat-list">
              {messages
                // 텍스트 답변 없이 계획 제안(Proposal)만 온 턴은 reply가 빈 문자열로 완료된다 —
                // 스트리밍 중(커서 표시)에는 빈 채로 잠깐 보여도 되지만, 완료된 뒤까지 빈 회색
                // 말풍선을 남기지 않는다. 제안 카드 자체는 이 필터와 무관하게 항상 표시된다.
                .filter((m) => m.role !== 'ASSISTANT' || m.streaming || m.content)
                .map((m) => (
                  <div key={m.key} className={`v6-ai-bubble v6-ai-bubble-${m.role.toLowerCase()}`}>
                    <p>
                      {m.content}
                      {m.streaming && <span className="v6-ai-cursor" aria-hidden="true" />}
                    </p>
                  </div>
                ))}
            </div>

            {currentOffer && !sending && (
              <div className="v6-ai-offer">
                <button type="button" className="btn-primary v6-ai-offer-btn" onClick={handleCreateProposalFromOffer}>
                  {currentOffer.label || '이 내용으로 계획 초안 만들기'}
                </button>
              </div>
            )}

            {currentProposal && !applySuccess && (
              <>
                <p className="v6-ai-hint">적용 전 초안이에요. 제목·예상 시간·우선순위를 고치거나 제외할 수 있어요.</p>

                {hasSchedulingCandidates && (
                  <SchedulingPreviewPanel
                    schedulePreview={schedulePreview}
                    previewLoading={previewLoading}
                    previewError={previewError}
                    availabilityOverrides={availabilityOverrides}
                    exceptionDraft={exceptionDraft}
                    onExceptionDraftChange={setExceptionDraft}
                    onAddException={handleAddException}
                    onRemoveException={handleRemoveException}
                    onReplan={handleReplan}
                  />
                )}

                <div className="v6-proposal-list">
                  {currentProposal.cards.map((card) => {
                    const excluded = excludedIds.has(card.proposalItemId);
                    const scheduleResult = hasSchedulingCandidates
                      ? {
                          placed: schedulePreview?.placedItems?.find((p) => p.proposalItemId === card.proposalItemId) ?? null,
                          unplaced: schedulePreview?.unplacedItems?.find((p) => p.proposalItemId === card.proposalItemId) ?? null,
                        }
                      : null;
                    return (
                      <div key={card.proposalItemId} className={`v6-proposal-card${excluded ? ' v6-proposal-card-excluded' : ''}`}>
                        <div className="v6-proposal-card-badge-row">
                          <span className="v6-proposal-card-badge">AI 초안 · 적용 전</span>
                          <span className={`v6-proposal-card-placement${scheduleResult?.unplaced ? ' v6-proposal-card-placement-unplaced' : ''}`}>
                            {placementLabel(card, scheduleResult)}
                          </span>
                          <button
                            type="button"
                            className="v6-proposal-exclude-btn"
                            onClick={() => toggleExcluded(card.proposalItemId)}
                            disabled={applying}
                            aria-label={excluded ? '다시 포함' : '이 항목 제외'}
                            title={excluded ? '다시 포함' : '이 항목 제외'}
                          >
                            <Ban size={14} />
                          </button>
                        </div>

                        {hasSchedulingCandidates && !excluded && (
                          <ScheduleResultRow
                            card={card}
                            scheduleResult={scheduleResult}
                            fixed={itemFixedOverrides[card.proposalItemId]}
                            disabled={applying || previewLoading}
                            onFix={(date, start, end) => handleFixItemTime(card.proposalItemId, date, start, end)}
                            onUnfix={() => handleUnfixItemTime(card.proposalItemId)}
                          />
                        )}

                        <label className="v6-proposal-field">
                          <span>제목</span>
                          <input
                            type="text"
                            value={card.title}
                            onChange={(e) => updateCard(card.proposalItemId, { title: e.target.value })}
                            disabled={applying || excluded}
                          />
                        </label>
                        <label className="v6-proposal-field">
                          <span>설명</span>
                          <input
                            type="text"
                            value={card.description}
                            onChange={(e) => updateCard(card.proposalItemId, { description: e.target.value })}
                            disabled={applying || excluded}
                          />
                        </label>
                        <div className="v6-proposal-field-row">
                          <label className="v6-proposal-field">
                            <span>예상 시간(분)</span>
                            <input
                              type="number"
                              min="1"
                              value={card.expectedMinutes}
                              onChange={(e) =>
                                updateCard(card.proposalItemId, { expectedMinutes: Number(e.target.value) || 0 })
                              }
                              disabled={applying || excluded}
                            />
                          </label>
                          <label className="v6-proposal-field">
                            <span>우선순위</span>
                            <select
                              value={card.priority}
                              onChange={(e) => updateCard(card.proposalItemId, { priority: e.target.value })}
                              disabled={applying || excluded}
                            >
                              {PRIORITY_OPTIONS.map((p) => (
                                <option key={p} value={p}>
                                  {PRIORITY_LABEL[p]}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {applyError && <p className="v6-ai-error">{applyError}</p>}
              </>
            )}

            {applySuccess && (
              <div className="v6-ai-success">
                <CircleCheck size={18} />
                <p>오늘에 적용됐어요.</p>
                <button type="button" className="v6-btn-small" onClick={() => setApplySuccess(false)}>
                  계속 상담하기
                </button>
              </div>
            )}

            {sendError && <p className="v6-ai-error">{sendError}</p>}
          </div>

          {currentProposal && !applySuccess ? (
            <footer className="v6-ai-footer v6-ai-footer-apply">
              <button type="button" className="btn-primary v6-ai-apply-btn" onClick={handleApply} disabled={applying}>
                {applying ? (
                  <>
                    <Loader2 size={14} className="v6-spin" /> 적용하는 중...
                  </>
                ) : (
                  '오늘에 적용'
                )}
              </button>
            </footer>
          ) : (
            <footer className="v6-ai-footer v6-ai-footer-input">
              <textarea
                className="v6-ai-textarea"
                placeholder="예: 오늘 프로젝트를 좀 하고 싶은데 너무 피곤해"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                disabled={sending || loadingHistory}
                rows={3}
              />
              <button
                type="button"
                className="btn-primary v6-ai-send-btn"
                onClick={handleSend}
                disabled={sending || loadingHistory || !inputText.trim()}
              >
                {sending ? <Loader2 size={14} className="v6-spin" /> : <Send size={14} />}
              </button>
            </footer>
          )}
        </>
      )}
    </aside>
  );
}

function ConversationGroup({ label, items, activeConversationId, onSelect }) {
  if (items.length === 0) return null;
  return (
    <div className="v6-ai-conv-group">
      <p className="v6-ai-conv-group-label">{label}</p>
      {items.map((item) => (
        <button
          key={item.conversationId}
          type="button"
          className={`v6-ai-conv-item${item.conversationId === activeConversationId ? ' v6-ai-conv-item-active' : ''}`}
          onClick={() => onSelect(item.conversationId)}
        >
          <MessageCircle size={13} className="v6-ai-conv-item-icon" />
          <span className="v6-ai-conv-item-title">{item.title || '(제목 없음)'}</span>
          <span className="v6-ai-conv-item-meta">
            {item.pendingProposalCount > 0 ? (
              <span className="v6-ai-conv-item-badge">적용 전 {item.pendingProposalCount}개</span>
            ) : null}
            <span className="v6-ai-conv-item-time">{formatRelativeTime(item.lastMessageAt)}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * 7일 범위 일정 후보 배치의 가용시간 요약 + 예외 수정 + 미배치 표시 + 다시 배치 버튼.
 * hasSchedulingCandidates일 때만 렌더링된다 — 기존 오늘 제안 화면에는 전혀 나타나지 않는다.
 */
function SchedulingPreviewPanel({
  schedulePreview,
  previewLoading,
  previewError,
  availabilityOverrides,
  exceptionDraft,
  onExceptionDraftChange,
  onAddException,
  onRemoveException,
  onReplan,
}) {
  const windows = schedulePreview?.availabilityWindows ?? [];
  const totalMinutes = windows.reduce((sum, w) => sum + (new Date(w.endAt) - new Date(w.startAt)) / 60000, 0);
  const totalHours = totalMinutes > 0 ? Math.round((totalMinutes / 60) * 10) / 10 : 0;
  const unplaced = schedulePreview?.unplacedItems ?? [];
  const canAddException = Boolean(exceptionDraft.date && exceptionDraft.start && exceptionDraft.end);

  return (
    <div className="v6-schedule-preview">
      <p className="v6-ai-hint">
        {previewLoading && windows.length === 0
          ? '이번 계획에 사용할 수 있는 시간을 계산하는 중...'
          : windows.length > 0
            ? `이번 계획에 사용할 수 있는 시간을 약 ${totalHours}시간으로 추정했어요.`
            : '아직 사용할 수 있는 시간을 계산하지 않았어요.'}
      </p>

      {windows.length > 0 && (
        <ul className="v6-schedule-window-list">
          {windows.map((w, i) => (
            <li key={i} className={`v6-schedule-window v6-schedule-window-${(w.confidence ?? 'low').toLowerCase()}`}>
              <span className="v6-schedule-window-time">
                {fmtDateShort(String(w.startAt).slice(0, 10))} {fmtTimeShort(w.startAt)}~{fmtTimeShort(w.endAt)}
              </span>
              <span className="v6-schedule-window-confidence">{CONFIDENCE_LABEL[w.confidence] ?? w.confidence}</span>
            </li>
          ))}
        </ul>
      )}

      {unplaced.length > 0 && (
        <div className="v6-schedule-unplaced">
          <p className="v6-ai-hint">배치하지 못한 항목이 있어요. 오류가 아니라 시간이 부족했다는 뜻이에요.</p>
          <ul>
            {unplaced.map((u) => (
              <li key={u.proposalItemId}>
                {u.title} — {u.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {availabilityOverrides.length > 0 && (
        <ul className="v6-schedule-exceptions">
          {availabilityOverrides.map((o, i) => (
            <li key={i}>
              <CalendarX size={12} />
              <span>
                {fmtDateShort(String(o.startAt).slice(0, 10))} {fmtTimeShort(o.startAt)}~{fmtTimeShort(o.endAt)} 제외
              </span>
              <button type="button" className="v6-btn-small" onClick={() => onRemoveException(i)} disabled={previewLoading}>
                되돌리기
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="v6-schedule-exception-form">
        <input
          type="date"
          value={exceptionDraft.date}
          onChange={(e) => onExceptionDraftChange({ ...exceptionDraft, date: e.target.value })}
          aria-label="제외할 날짜"
        />
        <input
          type="time"
          value={exceptionDraft.start}
          onChange={(e) => onExceptionDraftChange({ ...exceptionDraft, start: e.target.value })}
          aria-label="제외할 시작 시각"
        />
        <input
          type="time"
          value={exceptionDraft.end}
          onChange={(e) => onExceptionDraftChange({ ...exceptionDraft, end: e.target.value })}
          aria-label="제외할 종료 시각"
        />
        <button type="button" className="v6-btn-small" onClick={onAddException} disabled={previewLoading || !canAddException}>
          이 시간은 안 돼요
        </button>
      </div>

      <button
        type="button"
        className="v6-btn-small v6-schedule-replan-btn"
        onClick={onReplan}
        disabled={previewLoading}
      >
        {previewLoading ? (
          <>
            <Loader2 size={13} className="v6-spin" /> 다시 배치하는 중...
          </>
        ) : (
          <>
            <RefreshCw size={13} /> 이 기준으로 다시 배치
          </>
        )}
      </button>
      {previewError && <p className="v6-ai-error">{previewError}</p>}
    </div>
  );
}

/** 제안 카드 한 장의 배치 결과 표시 + 날짜·시각 직접 수정. */
function ScheduleResultRow({ card, scheduleResult, fixed, disabled, onFix, onUnfix }) {
  const [editing, setEditing] = useState(false);
  const dateRef = useRef(null);
  const startRef = useRef(null);
  const endRef = useRef(null);

  const placed = scheduleResult?.placed;
  const unplaced = scheduleResult?.unplaced;

  const submit = () => {
    onFix(dateRef.current?.value, startRef.current?.value, endRef.current?.value);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="v6-schedule-result-row v6-schedule-result-edit">
        <input ref={dateRef} type="date" defaultValue={placed?.scheduledDate ?? ''} aria-label={`${card.title} 날짜`} />
        <input ref={startRef} type="time" defaultValue={fmtTimeShort(placed?.scheduledStartAt)} aria-label={`${card.title} 시작 시각`} />
        <input ref={endRef} type="time" defaultValue={fmtTimeShort(placed?.scheduledEndAt)} aria-label={`${card.title} 종료 시각`} />
        <button type="button" className="v6-btn-small" onClick={submit} disabled={disabled}>
          이 시간으로 고정
        </button>
        <button type="button" className="v6-btn-small" onClick={() => setEditing(false)} disabled={disabled}>
          취소
        </button>
      </div>
    );
  }

  return (
    <div className="v6-schedule-result-row">
      <span className={`v6-schedule-result-text${unplaced ? ' v6-schedule-result-unplaced' : ''}`}>
        {placed ? placed.reason : unplaced ? `미배치: ${unplaced.reason}` : ''}
      </span>
      <button type="button" className="v6-btn-small" onClick={() => setEditing(true)} disabled={disabled}>
        날짜·시간 직접 수정
      </button>
      {fixed && (
        <button type="button" className="v6-btn-small" onClick={onUnfix} disabled={disabled}>
          고정 해제
        </button>
      )}
    </div>
  );
}
