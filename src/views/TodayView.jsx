/**
 * 오늘 = 실행 작업면.
 *
 * 핵심 질문: "지금 무엇을 하고, 남은 오늘을 어떻게 조정할까?"
 * 통계 대시보드도, 단순 할 일 목록도 아니다. 그래서 순서가
 *   지금 -> 다음 고정 일정 -> 남은 오늘 -> 정리한 것
 * 이다. 화면 맨 위는 항상 "지금 할 것 하나"이고, 그 자리에서 바로 완료/일부/줄이기/미루기를 한다.
 *
 * AI 초안이 있으면 카드 목록으로 따로 보여주지 않고 이 화면 위에 그대로 겹친다:
 * 새 항목은 남은 오늘 자리에 ghost로, 기존 항목 변경은 그 항목 줄 위에 변경 전 -> 후로.
 */

import { useMemo, useState } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import ExecutionRow from '../components/ExecutionRow.jsx';
import DraftRow from '../components/DraftRow.jsx';
import { adjustmentFor } from '../ai/useProposalDraft.js';
import { formatDateKo, formatMinutes, minutesOf, nowMinutes, todayString } from '../lib/datetime.js';
import { executionItemAPI } from '../api/api.js';

/** 지금 시각을 지난 시작 시각을 가진 항목은 "지금", 아직 안 온 것은 "다음". */
function splitByNow(items, now) {
  const planned = items.filter((i) => i.status === 'PLANNED');
  const timed = planned.filter((i) => i.startTime).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const untimed = planned.filter((i) => !i.startTime);

  const running = timed.find((i) => {
    const start = minutesOf(i.startTime);
    const end = minutesOf(i.endTime) ?? start + (i.estimatedMinutes ?? 30);
    return now >= start && now < end;
  });
  const nextTimed = timed.filter((i) => minutesOf(i.startTime) > now);
  const overdueTimed = timed.filter((i) => i !== running && !nextTimed.includes(i));

  // "지금"은 진행 중인 시간 고정 항목, 없으면 시각 없는 것 중 가장 중요한 것 하나.
  const priorityRank = { MUST: 0, SHOULD: 1, OPTIONAL: 2 };
  const sortedUntimed = [...untimed].sort((a, b) =>
    (priorityRank[a.priority] ?? 1) - (priorityRank[b.priority] ?? 1)
    || (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

  const focus = running ?? sortedUntimed[0] ?? nextTimed[0] ?? null;
  const rest = planned.filter((i) => i !== focus && !nextTimed.includes(i));

  return { focus, nextTimed, rest: [...overdueTimed.filter((i) => i !== focus), ...rest.filter((i) => !overdueTimed.includes(i))] };
}

export default function TodayView({
  items, loading, error, onRefresh, projectTitles,
  draft, onPatchCard, onToggleExclude, onOpenAi,
}) {
  const today = todayString();
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newMinutes, setNewMinutes] = useState(30);

  const now = nowMinutes();
  const { focus, nextTimed, rest } = useMemo(() => splitByNow(items, now), [items, now]);
  const finished = items.filter((i) => i.status === 'DONE' || i.status === 'HOLD');

  // 오늘 새로 만들자는 초안만 이 화면에 ghost로 놓는다. 다른 날짜 것은 일정 화면이 맡는다.
  const newDraftCards = (draft?.cards ?? []).filter(
    (c) => c.operation === 'CREATE' && c.scheduledDate === today,
  );

  const remainingMinutes = items
    .filter((i) => i.status === 'PLANNED')
    .reduce((sum, i) => sum + (i.estimatedMinutes ?? 0), 0);

  const handleAction = async (action, item, payload) => {
    setBusyId(item.executionItemId);
    setActionError(null);
    try {
      if (action === 'complete') {
        await executionItemAPI.complete(item.executionItemId, item.version);
      } else if (action === 'partial') {
        await executionItemAPI.partial(item.executionItemId, { version: item.version, ...payload });
      } else if (action === 'reduce') {
        await executionItemAPI.reduce(item.executionItemId, { version: item.version, ...payload });
      } else if (action === 'move') {
        await executionItemAPI.move(item.executionItemId, payload.toDate, item.version);
      }
      await onRefresh?.();
    } catch (err) {
      setActionError(err.message || '처리하지 못했습니다.');
    } finally {
      setBusyId(null);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setActionError(null);
    try {
      await executionItemAPI.create({
        title: newTitle.trim(),
        scheduledDate: today,
        expectedMinutes: newMinutes || null,
        priority: 'SHOULD',
      });
      setNewTitle('');
      setAdding(false);
      await onRefresh?.();
    } catch (err) {
      setActionError(err.message || '추가하지 못했습니다.');
    }
  };

  const rowProps = {
    projectTitles,
    draft,
    onPatchCard,
    onToggleExclude,
    onAction: handleAction,
    busyId,
  };

  return (
    <div className="view">
      <header className="view-head">
        <div>
          <h1 className="view-title">오늘</h1>
          <p className="view-sub">
            {formatDateKo(today)} · 남은 예정 {formatMinutes(remainingMinutes) || '0분'}
          </p>
        </div>
        <button type="button" className="btn-ghost" onClick={() => setAdding((v) => !v)}>
          <Plus size={15} /> 직접 추가
        </button>
      </header>

      {adding && (
        <form className="quick-add" onSubmit={handleAdd}>
          <input
            type="text"
            className="quick-add-title"
            placeholder="무엇을 할까요?"
            value={newTitle}
            autoFocus
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <label className="inline-field">
            <span>분</span>
            <input type="number" min="5" step="5" value={newMinutes}
              onChange={(e) => setNewMinutes(Number(e.target.value) || 0)} />
          </label>
          <button type="submit" className="btn-primary btn-sm" disabled={!newTitle.trim()}>추가</button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setAdding(false)}>취소</button>
        </form>
      )}

      {actionError && <p className="view-error">{actionError}</p>}
      {error && <p className="view-error">{error}</p>}
      {loading && <p className="view-dim">불러오는 중...</p>}

      {!loading && !error && (
        <>
          <section className="view-section">
            <h2 className="section-title">지금</h2>
            {focus ? (
              <Row item={focus} {...rowProps} highlight />
            ) : (
              <div className="empty-block">
                <p className="empty-title">지금 잡힌 것이 없어요</p>
                <p className="empty-desc">직접 추가하거나, 오른쪽에서 AI에게 남은 오늘을 어떻게 쓸지 물어보세요.</p>
                <button type="button" className="btn-ghost btn-sm" onClick={onOpenAi}>
                  <Sparkles size={13} /> AI와 정리하기
                </button>
              </div>
            )}
          </section>

          {nextTimed.length > 0 && (
            <section className="view-section">
              <h2 className="section-title">다음</h2>
              <p className="section-desc">시각이 정해진 일정이에요.</p>
              <div className="row-list">
                {nextTimed.map((item) => <Row key={item.executionItemId} item={item} {...rowProps} />)}
              </div>
            </section>
          )}

          <section className="view-section">
            <h2 className="section-title">남은 오늘</h2>
            {rest.length === 0 && newDraftCards.length === 0 ? (
              <p className="view-dim">남은 것이 없어요.</p>
            ) : (
              <div className="row-list">
                {rest.map((item) => <Row key={item.executionItemId} item={item} {...rowProps} />)}
                {newDraftCards.map((card) => (
                  <DraftRow
                    key={card.proposalItemId}
                    card={card}
                    onPatch={onPatchCard}
                    onToggleExclude={onToggleExclude}
                  />
                ))}
              </div>
            )}
          </section>

          {finished.length > 0 && (
            <section className="view-section">
              <h2 className="section-title">오늘 정리한 것</h2>
              <div className="row-list">
                {finished.map((item) => <Row key={item.executionItemId} item={item} {...rowProps} onAction={undefined} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** 초안 겹치기와 프로젝트 이름표를 붙여 ExecutionRow를 그린다. */
function Row({ item, projectTitles, draft, onPatchCard, onToggleExclude, onAction, busyId, highlight }) {
  const adjustment = adjustmentFor(draft, item.executionItemId);
  return (
    <div className={highlight ? 'focus-slot' : undefined}>
      <ExecutionRow
        item={item}
        projectTitle={item.courseId ? projectTitles?.[item.courseId] : null}
        adjustment={adjustment}
        onAdjustmentPatch={onPatchCard}
        onAdjustmentExclude={onToggleExclude}
        onAction={onAction}
        busy={busyId === item.executionItemId}
      />
    </div>
  );
}
