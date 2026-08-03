/**
 * 우측 AI 패널.
 *
 * 오늘 상담 -> AI 제안(구조화된 오늘 실행 후보) -> 카드별 편집 -> 하단 단일
 * "오늘에 적용" 버튼으로 묶음 전체를 한 트랜잭션으로 적용하는 흐름을 담당한다.
 *
 * Quick + 는 별도 기능이 아니다(v6.1 §6). 이 패널을 여는 축약 진입점일 뿐이고,
 * 입력 후에는 동일한 상담·Proposal 흐름을 그대로 탄다.
 *
 * 카드마다 적용 버튼을 두지 않는다 — 적용은 묶음 전체 단일 버튼으로만 한다.
 */

import { useEffect, useState } from 'react';
import { X, Sparkles, Loader2, CircleCheck } from 'lucide-react';
import { proposalAPI } from '../api/api.js';
import { PRIORITY_LABEL } from '../types/execution.js';

const PROPOSAL_ID_STORAGE_KEY = 'todayProposalId';
const PRIORITY_OPTIONS = ['MUST', 'SHOULD', 'OPTIONAL'];

function cardFromResponseItem(item) {
  return {
    proposalItemId: item.proposalItemId,
    status: item.status,
    title: item.title ?? '',
    description: item.description ?? '',
    expectedMinutes: item.expectedMinutes ?? 0,
    priority: item.priority ?? 'SHOULD',
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

export default function AiPanelShell({ open, contextLabel, targetDate, onClose, onApplied }) {
  const [sourceText, setSourceText] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);

  const [proposalId, setProposalId] = useState(null);
  const [cards, setCards] = useState([]);

  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState(null);
  const [applySuccess, setApplySuccess] = useState(false);

  // 새로고침 후에도 아직 적용 전(PROPOSED)인 제안 카드를 복원한다.
  useEffect(() => {
    const storedId = localStorage.getItem(PROPOSAL_ID_STORAGE_KEY);
    if (!storedId) return;

    proposalAPI.get(storedId)
      .then((data) => {
        if (data?.status === 'PROPOSED' && data.items?.length) {
          setProposalId(data.proposalId);
          setCards(data.items.map(cardFromResponseItem));
        } else {
          localStorage.removeItem(PROPOSAL_ID_STORAGE_KEY);
        }
      })
      .catch(() => {
        localStorage.removeItem(PROPOSAL_ID_STORAGE_KEY);
      });
  }, []);

  if (!open) return null;

  const resetProposal = () => {
    setProposalId(null);
    setCards([]);
    setApplySuccess(false);
    setApplyError(null);
    localStorage.removeItem(PROPOSAL_ID_STORAGE_KEY);
  };

  const handleGenerate = async () => {
    if (!sourceText.trim() || generating) return;

    setGenerating(true);
    setGenerateError(null);
    setApplySuccess(false);

    try {
      const data = await proposalAPI.create(sourceText.trim(), targetDate);
      setProposalId(data.proposalId);
      setCards((data.items ?? []).map(cardFromResponseItem));
      localStorage.setItem(PROPOSAL_ID_STORAGE_KEY, String(data.proposalId));
    } catch (err) {
      // 실패해도 입력한 상담 원문은 지우지 않는다.
      setGenerateError(err.message || '제안을 만들지 못했습니다.');
    } finally {
      setGenerating(false);
    }
  };

  const updateCard = (proposalItemId, patch) => {
    setCards((prev) =>
      prev.map((card) =>
        card.proposalItemId === proposalItemId ? { ...card, ...patch } : card,
      ),
    );
  };

  const handleApply = async () => {
    if (!proposalId || applying) return;

    const editedItems = cards
      .filter(isCardEdited)
      .map((card) => ({
        proposalItemId: card.proposalItemId,
        title: card.title,
        description: card.description,
        expectedMinutes: card.expectedMinutes,
        priority: card.priority,
      }));

    setApplying(true);
    setApplyError(null);

    try {
      await proposalAPI.apply(proposalId, editedItems);
      setApplySuccess(true);
      localStorage.removeItem(PROPOSAL_ID_STORAGE_KEY);
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

      <div className="v6-ai-body">
        {cards.length === 0 && (
          <>
            <p className="v6-ai-hint">
              상황을 그대로 적으면 오늘 실행 후보를 만들어 드려요. 적용 전에 직접 고칠 수
              있고, 하단의 적용 버튼을 눌러야 오늘에 반영돼요.
            </p>
            <textarea
              className="v6-ai-textarea"
              placeholder="예: 오늘 프로젝트를 좀 하고 싶은데 너무 피곤해"
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              disabled={generating}
              rows={5}
            />
            {generateError && <p className="v6-ai-error">{generateError}</p>}
            <button
              type="button"
              className="btn-primary v6-ai-generate-btn"
              onClick={handleGenerate}
              disabled={generating || !sourceText.trim()}
            >
              {generating ? (
                <>
                  <Loader2 size={14} className="v6-spin" /> 만드는 중...
                </>
              ) : (
                '제안 받기'
              )}
            </button>
          </>
        )}

        {cards.length > 0 && !applySuccess && (
          <>
            <p className="v6-ai-hint">
              적용 전 제안이에요. 제목·예상 시간·우선순위를 고칠 수 있어요.
            </p>
            <div className="v6-proposal-list">
              {cards.map((card) => (
                <div key={card.proposalItemId} className="v6-proposal-card">
                  <div className="v6-proposal-card-badge">제안 · 적용 전</div>
                  <label className="v6-proposal-field">
                    <span>제목</span>
                    <input
                      type="text"
                      value={card.title}
                      onChange={(e) => updateCard(card.proposalItemId, { title: e.target.value })}
                      disabled={applying}
                    />
                  </label>
                  <label className="v6-proposal-field">
                    <span>설명</span>
                    <input
                      type="text"
                      value={card.description}
                      onChange={(e) => updateCard(card.proposalItemId, { description: e.target.value })}
                      disabled={applying}
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
                          updateCard(card.proposalItemId, {
                            expectedMinutes: Number(e.target.value) || 0,
                          })
                        }
                        disabled={applying}
                      />
                    </label>
                    <label className="v6-proposal-field">
                      <span>우선순위</span>
                      <select
                        value={card.priority}
                        onChange={(e) => updateCard(card.proposalItemId, { priority: e.target.value })}
                        disabled={applying}
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
              ))}
            </div>
            {applyError && <p className="v6-ai-error">{applyError}</p>}
          </>
        )}

        {applySuccess && (
          <div className="v6-ai-success">
            <CircleCheck size={18} />
            <p>오늘에 적용됐어요.</p>
            <button type="button" className="v6-btn-small" onClick={resetProposal}>
              새로 상담하기
            </button>
          </div>
        )}
      </div>

      {cards.length > 0 && !applySuccess && (
        <footer className="v6-ai-footer v6-ai-footer-apply">
          <button
            type="button"
            className="btn-primary v6-ai-apply-btn"
            onClick={handleApply}
            disabled={applying}
          >
            {applying ? (
              <>
                <Loader2 size={14} className="v6-spin" /> 적용하는 중...
              </>
            ) : (
              '오늘에 적용'
            )}
          </button>
        </footer>
      )}
    </aside>
  );
}
