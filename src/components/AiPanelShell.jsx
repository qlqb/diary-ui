/**
 * 우측 AI 패널.
 *
 * 자유로운 대화가 기본이다: 인사·잡담·고민 상담은 말풍선으로만 오간다. 계획을 짤 정보가
 * 충분해지면 AI가 먼저 "초안을 만들어볼까?"(OFFER) 하고 물어보고, 사용자가 그 버튼을
 * 누르거나 스스로 "계획 짜줘"처럼 명시적으로 요청했을 때만 편집 가능한 Proposal 초안이
 * 생긴다. Proposal은 승인 전 초안이며, 하단 단일 "오늘에 적용" 버튼으로만 반영된다.
 *
 * Quick + 는 별도 기능이 아니다(v6.1 §6). 이 패널을 여는 축약 진입점일 뿐이고,
 * 입력 후에는 동일한 상담 흐름을 그대로 탄다.
 *
 * 카드마다 적용 버튼을 두지 않는다 — 적용은 묶음 전체 단일 버튼으로만 한다.
 * 사용자에게 "대화 모드/제안 모드" 스위치를 노출하지 않는다 — 입력창과 전송 버튼은 항상 하나뿐이다.
 */

import { useEffect, useRef, useState } from 'react';
import { X, Sparkles, Loader2, CircleCheck, Send, Ban } from 'lucide-react';
import { conversationAPI, proposalAPI } from '../api/api.js';
import { PRIORITY_LABEL } from '../types/execution.js';

const CONVERSATION_ID_STORAGE_KEY = 'aiConversationId';
const PRIORITY_OPTIONS = ['MUST', 'SHOULD', 'OPTIONAL'];

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

function placementLabel(card) {
  if (card.placementType === 'TIME_FIXED' && card.scheduledStartAt && card.scheduledEndAt) {
    const fmt = (iso) => iso.slice(11, 16);
    return `${fmt(card.scheduledStartAt)} ~ ${fmt(card.scheduledEndAt)}`;
  }
  return '날짜만 지정';
}

export default function AiPanelShell({ open, contextLabel, onClose, onApplied }) {
  const [conversationId, setConversationId] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadError, setLoadError] = useState(null);

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

  const bodyRef = useRef(null);

  // 대화 시작/복원: 저장된 conversationId가 있으면 이어서 쓰고, 없으면 새로 만든다.
  useEffect(() => {
    if (!open || conversationId) return;

    let cancelled = false;
    setLoadingHistory(true);
    setLoadError(null);

    (async () => {
      try {
        const storedId = localStorage.getItem(CONVERSATION_ID_STORAGE_KEY);
        let activeId = storedId ? Number(storedId) : null;
        let history = null;

        if (activeId) {
          try {
            history = await conversationAPI.getMessages(activeId);
          } catch {
            activeId = null;
          }
        }

        if (!activeId) {
          const created = await conversationAPI.create('TODAY');
          activeId = created.conversationId;
          localStorage.setItem(CONVERSATION_ID_STORAGE_KEY, String(activeId));
          history = [];
        }

        if (cancelled) return;

        setConversationId(activeId);
        setMessages(
          (history ?? []).map((m) => ({
            key: `m-${m.messageId}`,
            role: m.role,
            content: m.content,
            responseType: m.responseType,
            proposalId: m.proposalId,
            streaming: false,
          })),
        );

        const lastUser = [...(history ?? [])].reverse().find((m) => m.role === 'USER');
        if (lastUser) lastUserMessageIdRef.current = lastUser.messageId;

        const last = history && history.length > 0 ? history[history.length - 1] : null;
        if (last && last.role === 'ASSISTANT') {
          if (last.responseType === 'OFFER') {
            setCurrentOffer({ type: 'CREATE_PROPOSAL', label: '이 내용으로 계획 초안 만들기' });
          } else if (last.responseType === 'PROPOSAL' && last.proposalId) {
            try {
              const proposal = await proposalAPI.get(last.proposalId);
              if (!cancelled && proposal.status === 'PROPOSED') {
                setCurrentProposal({ proposalId: proposal.proposalId, cards: proposal.items.map(cardFromResponseItem) });
              }
            } catch {
              // 조회 실패해도 대화 자체는 정상 표시한다.
            }
          }
        }
      } catch (err) {
        if (!cancelled) setLoadError(err.message || '대화를 불러오지 못했습니다.');
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, conversationId]);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages, currentOffer, currentProposal]);

  if (!open) return null;

  const runTurn = async (payload, { optimisticUserText } = {}) => {
    setSending(true);
    setSendError(null);
    setCurrentOffer(null);

    if (optimisticUserText) {
      setMessages((prev) => [...prev, { key: `u-${Date.now()}`, role: 'USER', content: optimisticUserText, streaming: false }]);
    }

    const streamingKey = `a-${Date.now()}`;
    let started = false;

    try {
      await conversationAPI.sendMessage(conversationId, payload, {
        onEvent: (eventName, data) => {
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
      if (!started) {
        setMessages((prev) => prev.filter((m) => m.key !== streamingKey));
      }
      setSendError(err.message || 'AI 응답을 받지 못했습니다.');
    } finally {
      setSending(false);
    }
  };

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || sending || !conversationId) return;
    setInputText('');
    await runTurn(
      { message: text, requestedAction: 'AUTO', idempotencyKey: newIdempotencyKey() },
      { optimisticUserText: text },
    );
  };

  const handleCreateProposalFromOffer = async () => {
    if (sending || !conversationId) return;
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

  const handleApply = async () => {
    if (!currentProposal || applying) return;
    const remaining = currentProposal.cards.filter((c) => !excludedIds.has(c.proposalItemId));
    if (remaining.length === 0) {
      setApplyError('적용할 항목이 없어요. 하나 이상 남겨주세요.');
      return;
    }

    const editedItems = remaining.filter(isCardEdited).map((card) => ({
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
      await onApplied?.();
    } catch (err) {
      setApplyError(err.message || '오늘에 적용하지 못했습니다.');
    } finally {
      setApplying(false);
    }
  };

  return (
    <aside className="v6-ai-panel">
      <header className="v6-ai-header">
        <span className="v6-ai-title">
          <Sparkles size={15} /> 상담
        </span>
        <button type="button" className="v6-icon-button" onClick={onClose} aria-label="닫기">
          <X size={16} />
        </button>
      </header>

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

        {!loadingHistory && messages.length === 0 && !loadError && (
          <p className="v6-ai-hint">
            안부든 고민이든 편하게 적어보세요. 계획으로 정리할 준비가 되면 먼저 물어볼게요.
          </p>
        )}

        <div className="v6-ai-chat-list">
          {messages.map((m) => (
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
            <div className="v6-proposal-list">
              {currentProposal.cards.map((card) => {
                const excluded = excludedIds.has(card.proposalItemId);
                return (
                  <div key={card.proposalItemId} className={`v6-proposal-card${excluded ? ' v6-proposal-card-excluded' : ''}`}>
                    <div className="v6-proposal-card-badge-row">
                      <span className="v6-proposal-card-badge">AI 초안 · 적용 전</span>
                      <span className="v6-proposal-card-placement">{placementLabel(card)}</span>
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
    </aside>
  );
}
