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
} from 'lucide-react';
import { conversationAPI, proposalAPI, contextSuggestionAPI } from '../api/api.js';

/** 화면별 추천 질문. 지금 이 화면에서 실제로 할 수 있는 것만 보여준다. */
const SUGGESTED_PROMPTS = {
  today: ['지금부터 뭐부터 하면 좋을까?', '오늘 너무 피곤해. 남은 걸 줄여줘'],
  schedule: ['이번 주 계획 짜줘', '이번 주에 빈 시간이 언제야?'],
  project: ['이 주제 어디부터 시작하면 좋을까?', '오늘 30분만 해보고 싶어'],
  all: ['요즘 뭐부터 정리하면 좋을까?', '이번 주에 뭘 챙겨야 해?'],
};

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
  onFocusDraft,
  onDiscardDraft,
  onCollapse,
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
  const [contextSuggestions, setContextSuggestions] = useState([]);
  const [contextActionState, setContextActionState] = useState({});
  const [appliedNotice, setAppliedNotice] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const bodyRef = useRef(null);
  const inputRef = useRef(null);
  const abortControllerRef = useRef(null);
  const activeStreamConversationIdRef = useRef(null);
  const lastUserMessageIdRef = useRef(null);
  const loadTokenRef = useRef(0);
  const draftsRef = useRef({});
  // scope가 바뀔 때마다 해당 범위의 대화를 새로 붙인다. 이 키가 같으면 다시 불러오지 않는다.
  const scopeKey = `${scope.kind}:${scope.courseId ?? ''}`;
  const loadedScopeKeyRef = useRef(null);

  useEffect(() => () => abortControllerRef.current?.abort(), []);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, currentOffer, contextSuggestions, view]);

  // 화면의 버튼("이어하기", "이 자료로 질문" 등)이 입력창을 대신 채운다. 바로 보내지 않는다 —
  // 무엇을 물어볼지는 사용자가 마지막으로 확인하고 고칠 수 있어야 한다.
  useEffect(() => {
    if (!prefill?.text) return;
    setView('chat');
    setInputText(prefill.text);
    inputRef.current?.focus();
  }, [prefill]);

  const resetTurnState = useCallback(() => {
    setMessages([]);
    setCurrentOffer(null);
    setContextSuggestions([]);
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
    setInputText(draftsRef.current[conversationId] ?? '');
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
      if (last?.role === 'ASSISTANT') {
        if (last.responseType === 'OFFER') {
          setCurrentOffer({ label: '이 내용으로 초안 만들기' });
        } else if (last.responseType === 'PROPOSAL' && last.proposalId) {
          // 아직 적용하지 않은 초안이 있으면 화면에 다시 띄운다 — 새로고침으로 사라지지 않는다.
          try {
            const proposal = await proposalAPI.get(last.proposalId);
            if (loadTokenRef.current === myToken && proposal.status === 'PROPOSED') {
              onProposal?.(proposal);
            }
          } catch { /* 제안 조회 실패해도 대화 자체는 정상 표시한다 */ }
        }
      }

      try {
        const pending = await conversationAPI.getContextSuggestions(conversationId);
        if (loadTokenRef.current === myToken) setContextSuggestions(pending ?? []);
      } catch { /* 후보 복원 실패는 대화 표시를 막지 않는다 */ }
    } catch (err) {
      if (loadTokenRef.current === myToken) {
        setLoadError(err.message || '대화를 불러오지 못했습니다.');
      }
    } finally {
      if (loadTokenRef.current === myToken) setLoadingHistory(false);
    }
  }, [onProposal, resetTurnState]);

  const startNewConversation = useCallback(() => {
    abortControllerRef.current?.abort();
    activeStreamConversationIdRef.current = null;
    loadTokenRef.current += 1;
    setView('chat');
    setActiveConversationId(null);
    resetTurnState();
    setInputText('');
  }, [resetTurnState]);

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
      setInputText('');
      setView('chat');
      try {
        const list = await conversationAPI.list(scope.courseId ?? null);
        if (cancelled) return;
        setConversationList(list);
        if (list.length > 0) await selectConversation(list[0].conversationId);
      } catch (err) {
        if (!cancelled) setLoadError(err.message || '대화 목록을 불러오지 못했습니다.');
      }
    })();

    return () => { cancelled = true; };
  }, [scopeKey, scope.courseId, resetTurnState, selectConversation]);

  const openList = async () => {
    setView('list');
    setListLoading(true);
    try {
      setConversationList(await conversationAPI.list(scope.courseId ?? null));
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
    setAppliedNotice(false);

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
          } else if (eventName === 'context.suggestions.ready') {
            setContextSuggestions((prev) => [...prev, ...(data?.suggestions ?? [])]);
          } else if (eventName === 'message.completed') {
            if (data?.userMessageId) lastUserMessageIdRef.current = data.userMessageId;
            setMessages((prev) => prev.map((m) => (m.key === streamingKey
              ? { ...m, content: data.reply ?? m.content, responseType: data.responseType, streaming: false }
              : m)));
          } else if (eventName === 'message.error') {
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
    setInputText('');
    draftsRef.current[activeConversationId ?? '__new__'] = '';
    await runTurn({ message: text, requestedAction: 'AUTO', idempotencyKey: newIdempotencyKey() },
      { optimisticUserText: text });
  };

  const handleCreateProposalFromOffer = async () => {
    if (sending || !activeConversationId) return;
    await runTurn({
      requestedAction: 'CREATE_PROPOSAL',
      sourceMessageId: lastUserMessageIdRef.current,
      idempotencyKey: newIdempotencyKey(),
    });
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
      setInputText('');
      // 이 대화에서 나온 적용 전 초안도 함께 치운다 — 대화는 지웠는데 그 대화가 만든 ghost가
      // 오늘/일정 화면에 계속 떠 있으면 안 된다. 적용 전이므로 버려도 실제 데이터는 그대로다.
      onDiscardDraft?.();
    }
    delete draftsRef.current[conversationId];
    setDeletingId(null);

    try {
      const list = await conversationAPI.list(scope.courseId ?? null);
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

  const prompts = SUGGESTED_PROMPTS[scope.kind] ?? SUGGESTED_PROMPTS.all;
  const visibleMessages = messages.filter((m) => m.role !== 'ASSISTANT' || m.streaming || m.content);

  return (
    <aside className="ai-panel">
      <header className="ai-panel-head">
        <span className="ai-panel-title"><Sparkles size={15} /> AI</span>
        <span className="ai-panel-head-actions">
          <button type="button" className="icon-btn" onClick={openList} title="대화 목록" aria-label="대화 목록">
            <List size={16} />
          </button>
          <button type="button" className="icon-btn" onClick={startNewConversation} title="새 대화" aria-label="새 대화">
            <Plus size={16} />
          </button>
          <button type="button" className="icon-btn" onClick={onCollapse} title="패널 접기" aria-label="패널 접기">
            <PanelRightClose size={16} />
          </button>
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
          <div className="ai-panel-body" ref={bodyRef}>
            {loadingHistory && <p className="ai-hint"><Loader2 size={14} className="spin" /> 대화를 불러오는 중...</p>}
            {loadError && <p className="ai-error">{loadError}</p>}

            {!loadingHistory && visibleMessages.length === 0 && (
              <div className="ai-empty">
                <p className="ai-hint">{scope.emptyHint}</p>
                <div className="ai-prompt-list">
                  {prompts.map((prompt) => (
                    <button key={prompt} type="button" className="ai-prompt" onClick={() => setInputText(prompt)}>
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

            {currentOffer && !sending && (
              <button type="button" className="btn-primary ai-offer-btn" onClick={handleCreateProposalFromOffer}>
                {currentOffer.label || '이 내용으로 초안 만들기'}
              </button>
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

          <footer className="ai-panel-foot">
            <textarea
              ref={inputRef}
              className="ai-textarea"
              placeholder={scope.placeholder}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
              disabled={sending || loadingHistory}
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
        </>
      )}
    </aside>
  );
}
