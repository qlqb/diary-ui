/**
 * AI가 새로 만들자고 제안한 항목 한 줄(ghost).
 *
 * 실제 항목과 시각적으로 구분되지만 같은 목록 안 같은 자리에 놓인다 — 적용하면 무엇이 어디에
 * 생기는지를 카드 목록이 아니라 실제 화면에서 보여주기 위해서다. 여기서 고친 값이 그대로
 * 적용된다(별도 편집 화면 없음).
 */

import { Sparkles, Ban, RotateCcw } from 'lucide-react';
import { formatMinutes } from '../lib/datetime.js';

const PRIORITY_OPTIONS = [
  { value: 'MUST', label: '꼭' },
  { value: 'SHOULD', label: '하면 좋음' },
  { value: 'OPTIONAL', label: '여유 있으면' },
];

export default function DraftRow({ card, onPatch, onToggleExclude, showDate }) {
  const excluded = card.excluded;

  return (
    <article className={`exec-row is-draft${excluded ? ' is-excluded' : ''}`}>
      <div className="exec-row-main">
        <div className="exec-row-headline">
          <span className="draft-badge"><Sparkles size={12} /> AI 초안 · 적용 전</span>
          {card.unplacedReason && <span className="chip chip-warn">시간을 못 찾았어요</span>}
        </div>

        <input
          className="draft-title-input"
          type="text"
          value={card.title}
          disabled={excluded}
          aria-label="초안 제목"
          onChange={(e) => onPatch(card.proposalItemId, { title: e.target.value })}
        />

        <div className="draft-fields">
          {showDate && (
            <label className="inline-field">
              <span>날짜</span>
              <input type="date" value={card.scheduledDate ?? ''} disabled={excluded}
                onChange={(e) => onPatch(card.proposalItemId, { scheduledDate: e.target.value })} />
            </label>
          )}
          <label className="inline-field">
            <span>시작</span>
            <input type="time" value={card.startTime ?? ''} disabled={excluded}
              onChange={(e) => onPatch(card.proposalItemId, { startTime: e.target.value, autoPlaced: false })} />
          </label>
          <label className="inline-field">
            <span>종료</span>
            <input type="time" value={card.endTime ?? ''} disabled={excluded}
              onChange={(e) => onPatch(card.proposalItemId, { endTime: e.target.value, autoPlaced: false })} />
          </label>
          <label className="inline-field">
            <span>분</span>
            <input type="number" min="5" step="5" value={card.expectedMinutes} disabled={excluded}
              onChange={(e) => onPatch(card.proposalItemId, { expectedMinutes: Number(e.target.value) || 0 })} />
          </label>
          <label className="inline-field">
            <span>중요도</span>
            <select value={card.priority} disabled={excluded}
              onChange={(e) => onPatch(card.proposalItemId, { priority: e.target.value })}>
              {PRIORITY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </label>
        </div>

        {card.description && <p className="exec-row-reason">{card.description}</p>}
        {!card.startTime && !excluded && (
          <p className="exec-row-hint">시각을 비워두면 그날 안에서 순서만 잡혀요 ({formatMinutes(card.expectedMinutes)}).</p>
        )}
      </div>

      <div className="exec-row-actions">
        <button type="button" className="btn-ghost btn-sm" onClick={() => onToggleExclude(card.proposalItemId)}>
          {excluded ? <><RotateCcw size={13} /> 되돌리기</> : <><Ban size={13} /> 빼기</>}
        </button>
      </div>
    </article>
  );
}
