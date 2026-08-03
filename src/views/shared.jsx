/**
 * 4개 탭이 공유하는 표시 조각.
 *
 * 여기 있는 컴포넌트는 ExecutionItemDto 를 그대로 받는다.
 * 화면마다 다른 모양으로 감싸더라도 원본 필드 이름은 바꾸지 않는다.
 */

import { Clock, Repeat, Pin } from 'lucide-react';
import {
  ExecutionItemType,
  PlacementType,
  ExecutionStatus,
  STATUS_LABEL,
  PRIORITY_LABEL,
} from '../types/execution.js';
import { placementLabel } from './format.js';

/** 화면 상단 제목 줄. */
export function ViewHeader({ title, question, right }) {
  return (
    <header className="v6-view-header">
      <div>
        <h1 className="v6-view-title">{title}</h1>
        {question && <p className="v6-view-question">{question}</p>}
      </div>
      {right && <div className="v6-view-header-right">{right}</div>}
    </header>
  );
}

/** 내부 보기 전환 탭. */
export function SubTabs({ tabs, active, onChange }) {
  return (
    <div className="v6-subtabs">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          className={`v6-subtab ${active === t.key ? 'active' : ''}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ title, desc }) {
  return (
    <div className="v6-empty">
      <p className="v6-empty-title">{title}</p>
      {desc && <p className="v6-empty-desc">{desc}</p>}
    </div>
  );
}

/**
 * 실행 조각 카드.
 *
 * onRecordResult 가 없으면 결과 기록 버튼이 아예 렌더링되지 않는다.
 * 실행 탭은 이 prop 을 전달하지 않으므로 구조적으로 결과를 기록할 수 없다(v6.1 §2).
 */
export function ExecutionItemCard({
  item,
  onRecordResult,
  onComplete,
  onOpenDetail,
  footer,
}) {
  const isDone = item.status === ExecutionStatus.DONE;
  const isHold = item.status === ExecutionStatus.HOLD;

  return (
    <article
      className={`v6-item-card ${isDone ? 'is-done' : ''} ${isHold ? 'is-hold' : ''}`}
    >
      <div className="v6-item-main">
        <button
          type="button"
          className="v6-item-title-button"
          onClick={() => onOpenDetail?.(item)}
        >
          {item.title}
        </button>

        <div className="v6-item-meta">
          <span className="v6-item-placement">
            {item.placementType === PlacementType.TIME_FIXED && <Clock size={13} />}
            {placementLabel(item)}
          </span>

          {item.itemType === ExecutionItemType.ROUTINE_OCCURRENCE && (
            <span className="v6-item-tag">
              <Repeat size={12} /> 루틴
            </span>
          )}
          {item.isFixed && (
            <span className="v6-item-tag">
              <Pin size={12} /> 고정
            </span>
          )}
          {item.targetAmount && (
            <span className="v6-item-tag">{item.targetAmount}</span>
          )}
          {(isDone || isHold) && (
            <span className="v6-item-status">{STATUS_LABEL[item.status]}</span>
          )}
          {!isDone && !isHold && item.priority && item.priority !== 'SHOULD' && (
            <span className="v6-item-status">{PRIORITY_LABEL[item.priority]}</span>
          )}
        </div>
      </div>

      {(onComplete || onRecordResult) && !isDone && (
        <div className="v6-item-actions">
          {onComplete && (
            <button
              type="button"
              className="v6-btn-small"
              onClick={() => onComplete(item)}
            >
              완료
            </button>
          )}
          {onRecordResult && (
            <button
              type="button"
              className="v6-btn-small"
              onClick={() => onRecordResult(item)}
            >
              결과 남기기
            </button>
          )}
        </div>
      )}

      {footer}
    </article>
  );
}
