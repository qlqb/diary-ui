/**
 * 오늘 = 실행 작업면.
 *
 * 핵심 질문: "지금 무엇을 하고, 남은 오늘을 어떻게 조정할까?"
 * 통계 대시보드도, 단순 할 일 목록도 아니다. 그래서 순서가
 *   지금 -> (필요하면) 다시 잡기 -> 남은 오늘 -> 정리한 것
 * 이다. 화면 맨 위는 항상 "지금 할 것 하나"이고, 그 자리에서 바로 완료/일부/줄이기/이동을 한다.
 *
 * "지금" 영역은 빈 시간 표시가 아니라 상태 판단이다. 예정 시간이 지난 미완료 항목이 있는데
 * "지금 잡힌 것이 없어요"라고 말하는 것은 틀린 답이다 — 그건 계획이 이미 틀어졌다는 뜻이고,
 * 그 순간 사용자에게 필요한 것은 빈 화면이 아니라 남은 하루를 다시 잡을 방법이다.
 * 다만 밀렸다는 사실을 실패로 표현하지 않는다(classifyToday 주석 참고).
 *
 * AI 초안이 있으면 카드 목록으로 따로 보여주지 않고 이 화면 위에 그대로 겹친다:
 * 새 항목은 남은 오늘 자리에 ghost로, 기존 항목 변경은 그 항목 줄 위에 변경 전 -> 후로.
 */

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Sparkles, Clock3 } from 'lucide-react';
import ExecutionRow from '../components/ExecutionRow.jsx';
import TimeBlockRow from '../components/TimeBlockRow.jsx';
import DraftRow from '../components/DraftRow.jsx';
import ReschedulePanel from './today/ReschedulePanel.jsx';
import { adjustmentFor } from '../ai/useProposalDraft.js';
import { classifyToday, isTimed } from '../lib/today.js';
import { blockingEntries, buildTodayTimeline, todayOccupancy } from '../lib/todayTimeline.js';
import { formatDateKo, formatMinutes, minutesOf, nowMinutes, toHHmm, todayString } from '../lib/datetime.js';
import { executionItemAPI } from '../api/api.js';

/** 발생분에는 id가 없다(서버에 행이 없다). 루틴과 날짜로 한 건을 가리킨다. */
function blockKey(entry) {
  return `${entry.kind}:${entry.sourceRef.routineId}:${entry.sourceRef.date}:${entry.startAt}`;
}

export default function TodayView({
  items, occurrences, loading, error, onRefresh, projectTitles,
  draft, onPatchCard, onToggleExclude, onOpenAi, onAsk, onItemDeleted,
}) {
  const today = todayString();
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newMinutes, setNewMinutes] = useState(30);
  const [rescheduling, setRescheduling] = useState(false);
  const [overdueOpen, setOverdueOpen] = useState(true);
  /** 지나간 항목이 있다는 것을 알고는 있지만 지금은 그대로 두기로 한 상태. 다시 잡기 CTA만 접는다. */
  const [dismissedOverdue, setDismissedOverdue] = useState(false);

  // "지금"은 시계를 따라 움직여야 한다 — 화면을 켜둔 채로 일정이 지나가면 그 사실이 보여야 한다.
  const [now, setNow] = useState(() => nowMinutes());
  useEffect(() => {
    const timer = setInterval(() => setNow(nowMinutes()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const {
    nowState, focus, overdue, upcoming, rest, finished, remainingMinutes,
  } = useMemo(() => classifyToday(items, now, today), [items, now, today]);

  /*
   * 시간 점유는 실행 상태와 다른 계산이다. classifyToday는 실행 조각의 상태(밀렸는가,
   * 남은 실행량이 얼마인가)를 보고, 여기 타임라인은 "오늘 언제가 비어 있는가"를 본다.
   * 루틴은 뒤쪽에만 들어간다 — remainingMinutes에 수업 시간이 섞이면 "남은 예정"이
   * 해야 할 일과 못 쓰는 시간을 합친 숫자가 되어 뜻을 잃는다.
   */
  const timeline = useMemo(
    () => buildTodayTimeline({ items, occurrences }, today),
    [items, occurrences, today],
  );
  const { busy, nextEntry, minutesToNext } = useMemo(
    () => todayOccupancy(timeline, now), [timeline, now],
  );
  /** 지금 진행 중인 실행 조각이 아닌 것(수업·알바). 있으면 "지금 이걸 하세요"를 띄우지 않는다. */
  const runningBlocks = blockingEntries(busy);
  /*
   * 수업 중인데 "지금 웹서버 과제 하세요"가 뜨면 앱을 못 믿게 된다. 다만 실행 조각이
   * 실제로 돌고 있는 경우(RUNNING)는 그대로 둔다 — 그건 지금 하고 있는 일이 맞다.
   * 시각 없는 항목을 골라 제안하는 FOCUS만 접는다.
   */
  const shownFocus = runningBlocks.length > 0 && nowState === 'FOCUS' ? null : focus;
  /** 아직 시작하지 않은 점유. "남은 오늘"에 실행 조각과 시간순으로 섞어 놓는다. */
  const upcomingBlocks = useMemo(
    () => timeline.filter((e) => e.kind !== 'EXECUTION' && e.startMinutes > now),
    [timeline, now],
  );

  /*
   * "남은 오늘"에 놓을 줄. 시각 없는 항목이 먼저고, 시각이 있는 것들은 실행 조각과 점유를
   * 섞어 시간순으로 세운다 — 14시 수업과 15시 과제를 따로 나열하면 순서를 사용자가 다시
   * 맞춰 읽어야 한다.
   *
   * focus를 접었을 때(수업 중) 그 항목이 여기로 돌아오게 한다. 안 그러면 지금 자리에서도
   * 목록에서도 빠져 오늘 화면에서 통째로 사라진다.
   */
  const restRows = useMemo(() => {
    const base = !shownFocus && focus ? [focus, ...rest] : rest;
    const untimedRows = base.filter((i) => !isTimed(i)).map((item) => ({ at: null, item }));
    const timedRows = base.filter(isTimed).map((item) => ({ at: minutesOf(item.startTime), item }));
    const blockRows = upcomingBlocks.map((entry) => ({ at: entry.startMinutes, entry }));
    return [...untimedRows, ...[...timedRows, ...blockRows].sort((a, b) => a.at - b.at)];
  }, [shownFocus, focus, rest, upcomingBlocks]);

  // 보류와 완료는 같은 "끝난 것"이 아니다 — 보류는 되돌릴 수 있는 상태이므로 따로 보여준다.
  const held = finished.filter((i) => i.status === 'HOLD');
  const done = finished.filter((i) => i.status !== 'HOLD');

  // 지나간 항목이 다시 생기면(또는 새로 밀리면) 안내를 다시 보여준다.
  useEffect(() => { setDismissedOverdue(false); }, [overdue.length]);

  // 오늘 새로 만들자는 초안만 이 화면에 ghost로 놓는다. 다른 날짜 것은 일정 화면이 맡는다.
  const newDraftCards = (draft?.cards ?? []).filter(
    (c) => c.operation === 'CREATE' && c.scheduledDate === today,
  );

  /**
   * 실행 액션. 결과를 돌려준다 — ExecutionRow가 성공했을 때만 트레이를 닫고, 실패하면
   * 사용자가 친 값을 그대로 둔 채 그 자리에 이유를 보여주기 위해서다.
   *
   * 오류를 잡는 곳은 여기 하나다. code까지 함께 넘기는 것은 버전 충돌(E409_004)만
   * 화면이 다르게 말해야 하기 때문이고, 문구를 파싱하는 방식은 쓰지 않는다.
   */
  const handleAction = async (action, item, payload) => {
    setBusyId(item.executionItemId);
    setActionError(null);
    try {
      if (action === 'complete') {
        await executionItemAPI.complete(item.executionItemId, item.version, payload ?? {});
      } else if (action === 'partial') {
        await executionItemAPI.partial(item.executionItemId, { version: item.version, ...payload });
      } else if (action === 'reduce') {
        await executionItemAPI.reduce(item.executionItemId, { version: item.version, ...payload });
      } else if (action === 'move') {
        await executionItemAPI.move(item.executionItemId, payload.toDate, item.version, {
          startTime: payload.startTime ?? null,
          endTime: payload.endTime ?? null,
        });
      } else if (action === 'hold') {
        await executionItemAPI.hold(item.executionItemId, item.version);
      } else if (action === 'resume') {
        await executionItemAPI.resume(item.executionItemId, item.version);
      } else if (action === 'delete') {
        await executionItemAPI.delete(item.executionItemId, item.version);
        // 되돌릴 수 있게 알린다. 확인을 묻지 않는 대신 지운 뒤에 되돌릴 길을 준다.
        onItemDeleted?.(item);
      }
      await onRefresh?.();
      return { ok: true };
    } catch (err) {
      setActionError(err.message || '처리하지 못했습니다.');
      return { ok: false, code: err.code ?? null, message: err.message ?? null };
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

  const showOverdueCta = overdue.length > 0 && !dismissedOverdue && !rescheduling;

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
          {/* 다시 잡기 검토 중에는 그 영역이 곧 화면이다 — 같은 항목을 아래에 또 늘어놓아
              검토 영역을 화면 밖으로 밀어내지 않는다(1536x760 기준). 검토를 닫으면
              평소 화면이 그대로 돌아온다. */}
          {!rescheduling && (
          <section className="view-section">
            <h2 className="section-title">지금</h2>

            {/* 지금 못 쓰는 시간이 먼저다. 수업 중이라는 사실이 "무엇을 할까"보다 앞선다. */}
            {runningBlocks.map((entry) => (
              <TimeBlockRow key={blockKey(entry)} entry={entry} running />
            ))}

            {shownFocus && <Row item={shownFocus} {...rowProps} highlight />}

            {/* 지금 할 것이 있으면 그 줄이 주인공이므로 한 줄 띠로만 알리고, 지금 자리가 비어
                있으면 이 안내가 곧 "지금"의 내용이다. 어느 쪽이든 "지금 잡힌 것이 없어요"로
                끝내지 않는다. */}
            {showOverdueCta && (shownFocus || runningBlocks.length > 0 ? (
              <div className="overdue-strip">
                <p className="empty-title">예정 시간이 지난 일정이 {overdue.length}개 있어요</p>
                <div className="overdue-actions">
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setRescheduling(true)}>
                    남은 오늘 다시 잡기
                  </button>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setDismissedOverdue(true)}>
                    그대로 둘게요
                  </button>
                </div>
              </div>
            ) : (
              <div className="empty-block overdue-block">
                <p className="empty-title">예정 시간이 지난 일정이 {overdue.length}개 있어요</p>
                <p className="empty-desc">오늘 계획을 지금 상황에 맞게 다시 정리할 수 있어요.</p>
                <div className="overdue-actions">
                  <button type="button" className="btn-primary btn-sm" onClick={() => setRescheduling(true)}>
                    남은 오늘 다시 잡기
                  </button>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setDismissedOverdue(true)}>
                    그대로 둘게요
                  </button>
                </div>
              </div>
            ))}

            {/* 다음 일정은 실행 조각일 수도 수업일 수도 있다. 둘을 나눠 세면 "다음 일정까지
                3시간"이라고 해놓고 1시간 뒤 수업이 시작하는 상태가 만들어진다. */}
            {!shownFocus && runningBlocks.length === 0 && overdue.length === 0 && nextEntry && (
              <div className="empty-block">
                <p className="empty-title">
                  <Clock3 size={15} /> 다음 일정까지 {formatMinutes(minutesToNext) || '곧'} 남았어요
                </p>
                <p className="empty-desc">
                  {toHHmm(nextEntry.startAt)} {nextEntry.title}
                  {nextEntry.kind !== 'EXECUTION' && <span className="exec-row-dim"> · 반복 일정</span>}
                </p>
              </div>
            )}

            {!shownFocus && runningBlocks.length === 0 && overdue.length === 0 && !nextEntry
              && nowState === 'EMPTY' && (
              <div className="empty-block">
                <p className="empty-title">아직 계획된 항목이 없어요.</p>
                <p className="empty-desc">직접 추가하거나, 오른쪽에서 AI에게 남은 오늘을 어떻게 쓸지 물어보세요.</p>
                <div className="overdue-actions">
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setAdding(true)}>
                    <Plus size={13} /> 직접 추가
                  </button>
                  <button type="button" className="btn-ghost btn-sm" onClick={onOpenAi}>
                    <Sparkles size={13} /> AI와 정리하기
                  </button>
                </div>
              </div>
            )}

            {/* 지나간 항목이 있는데 안내를 접어둔 상태에서도 다시 열 길은 남겨둔다. */}
            {overdue.length > 0 && dismissedOverdue && (
              <p className="view-dim">
                지난 항목 {overdue.length}개는 그대로 뒀어요.{' '}
                <button type="button" className="link-btn" onClick={() => setDismissedOverdue(false)}>
                  다시 보기
                </button>
              </p>
            )}
          </section>
          )}

          {rescheduling && (
            <ReschedulePanel
              overdue={overdue}
              upcoming={upcoming}
              items={items}
              now={now}
              today={today}
              onClose={() => setRescheduling(false)}
              onApplied={onRefresh}
              onAskAi={(text) => { setRescheduling(false); onAsk?.(text); }}
            />
          )}

          {!rescheduling && (
          <section className="view-section">
            <h2 className="section-title">남은 오늘</h2>

            {/* 지나간 것과 앞으로 할 것을 같은 목록에 섞지 않는다. 지나간 것은 작은 묶음으로
                접을 수 있게 두어 화면을 차지하지 않게 한다. */}
            {overdue.length > 0 && (
              <div className="overdue-group">
                <div className="overdue-group-head">
                  <button type="button" className="collapse-head overdue-group-toggle"
                    aria-expanded={overdueOpen} onClick={() => setOverdueOpen((v) => !v)}>
                    {overdueOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    <span>예정 시간이 지난 항목 {overdue.length}개</span>
                  </button>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setRescheduling(true)}>
                    한번에 정리
                  </button>
                </div>
                {overdueOpen && (
                  <div className="row-list">
                    {overdue.map((item) => (
                      <Row key={item.executionItemId} item={item} {...rowProps} compact />
                    ))}
                  </div>
                )}
              </div>
            )}

            {restRows.length === 0 && newDraftCards.length === 0 ? (
              overdue.length === 0 && <p className="view-dim">남은 것이 없어요.</p>
            ) : (
              <>
                {overdue.length > 0 && <p className="section-desc overdue-divider">앞으로 할 일</p>}
                <div className="row-list">
                  {restRows.map((row) => (row.entry
                    ? <TimeBlockRow key={blockKey(row.entry)} entry={row.entry} />
                    : <Row key={row.item.executionItemId} item={row.item} {...rowProps} />
                  ))}
                  {newDraftCards.map((card) => (
                    <DraftRow
                      key={card.proposalItemId}
                      card={card}
                      onPatch={onPatchCard}
                      onToggleExclude={onToggleExclude}
                    />
                  ))}
                </div>
              </>
            )}
          </section>
          )}

          {/* 보류는 끝난 것이 아니라 "당분간 빼둔 것"이다 — 완료와 같은 자리에 묻어두면
              다시 꺼낼 방법이 없는 유령 항목이 된다. 여기서 바로 다시 시작하거나 지운다. */}
          {!rescheduling && held.length > 0 && (
            <section className="view-section">
              <h2 className="section-title">보류한 것</h2>
              <p className="section-desc">지금은 하지 않기로 한 것들이에요. 다시 시작하거나 지울 수 있어요.</p>
              <div className="row-list">
                {held.map((item) => (
                  <Row key={item.executionItemId} item={item} {...rowProps} compact />
                ))}
              </div>
            </section>
          )}

          {!rescheduling && done.length > 0 && (
            <section className="view-section">
              <h2 className="section-title">오늘 정리한 것</h2>
              <div className="row-list">
                {done.map((item) => (
                  <Row key={item.executionItemId} item={item} {...rowProps} onAction={undefined} compact />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** 초안 겹치기와 프로젝트 이름표를 붙여 ExecutionRow를 그린다. */
function Row({ item, projectTitles, draft, onPatchCard, onToggleExclude, onAction, busyId, highlight, compact }) {
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
        compact={compact}
      />
    </div>
  );
}
