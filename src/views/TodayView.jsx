/**
 * 오늘 탭.
 *
 * 책임: 실제 execution_items 중 오늘 날짜에 해당하는 항목을
 *      현재 시각과 남은 하루 기준으로 처리하는 작업면.
 * 핵심 질문: 지금 무엇을 하고 남은 오늘을 어떻게 조정할까?
 *
 * 오늘은 별도 데이터를 소유하지 않는다. execution_items를 오늘 날짜로 투영한다.
 * 데이터 조회/새로고침은 MainShell이 소유하고, 이 화면은 받은 items를 투영만 한다.
 */

import { useState } from 'react';
import { ViewHeader, ExecutionItemCard, EmptyState } from './shared.jsx';
import {
  selectPriorityItems,
  selectUpcomingItems,
  selectTodayItems,
  getTodayString,
} from '../mock/executionMock.js';
import { ExecutionStatus } from '../types/execution.js';
import { executionItemAPI } from '../api/api.js';

export default function TodayView({ items, loading, error, onRecordResult, onOpenDetail, onRefresh }) {
  const today = getTodayString();
  const [completingId, setCompletingId] = useState(null);

  const priorityItems = selectPriorityItems(items, today);
  const upcoming = selectUpcomingItems(items, today);
  const doneOrHold = selectTodayItems(items, today).filter(
    (it) => it.status === ExecutionStatus.DONE || it.status === ExecutionStatus.HOLD,
  );

  const handleComplete = async (item) => {
    if (completingId) return;
    setCompletingId(item.executionItemId);
    try {
      await executionItemAPI.complete(item.executionItemId, item.version);
      await onRefresh?.();
    } catch (err) {
      alert('완료 처리에 실패했습니다: ' + err.message);
    } finally {
      setCompletingId(null);
    }
  };

  return (
    <div className="v6-view">
      <ViewHeader
        title="오늘"
        question="지금 무엇을 하고, 남은 오늘을 어떻게 조정할까?"
      />

      {error && (
        <EmptyState
          title="오늘 조각을 불러오지 못했어요"
          desc={error}
        />
      )}

      {!error && loading && (
        <EmptyState title="불러오는 중..." />
      )}

      {!error && !loading && (
        <>
          <section className="v6-section">
            <h2 className="v6-section-title">먼저 할 조각</h2>
            {priorityItems.length === 0 ? (
              <EmptyState
                title="오늘 남은 조각이 없어요"
                desc="AI 상담에서 오늘 할 것을 제안받거나, 새로 하나 만들어도 좋아요."
              />
            ) : (
              <div className="v6-item-list">
                {priorityItems.map((item) => (
                  <ExecutionItemCard
                    key={item.executionItemId}
                    item={item}
                    onComplete={completingId ? undefined : handleComplete}
                    onRecordResult={onRecordResult}
                    onOpenDetail={onOpenDetail}
                  />
                ))}
              </div>
            )}
          </section>

          {upcoming.length > 0 && (
            <section className="v6-section">
              <h2 className="v6-section-title">다음 일정</h2>
              <p className="v6-section-desc">
                시각이 정해진 일정이에요. 우선순위와는 따로 봅니다.
              </p>
              <div className="v6-item-list">
                {upcoming.map((item) => (
                  <ExecutionItemCard
                    key={item.executionItemId}
                    item={item}
                    onRecordResult={item.isFixed ? undefined : onRecordResult}
                    onOpenDetail={onOpenDetail}
                  />
                ))}
              </div>
            </section>
          )}

          {doneOrHold.length > 0 && (
            <section className="v6-section">
              <h2 className="v6-section-title">오늘 정리한 것</h2>
              <div className="v6-item-list">
                {doneOrHold.map((item) => (
                  <ExecutionItemCard
                    key={item.executionItemId}
                    item={item}
                    onOpenDetail={onOpenDetail}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
