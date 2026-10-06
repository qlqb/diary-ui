/**
 * 일정 = 앞으로 언제 무엇을 할지.
 *
 * 예전의 "계획" 탭과 "실행" 탭을 하나로 합친 자리다. 초안(계획)과 확정된 배치를 다른 탭으로
 * 나누면 "지금 보고 있는 게 적용된 것인지 아닌지"가 흐려진다 — 여기서는 같은 격자 위에서
 * 확정된 것과 적용 전 초안을 함께 보고, 초안만 점선으로 구분한다.
 */

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import WeekGrid from './WeekGrid.jsx';
import DraftRow from '../../components/DraftRow.jsx';
import ExecutionRow from '../../components/ExecutionRow.jsx';
import { adjustmentFor } from '../../ai/useProposalDraft.js';
import RoutineSection from './RoutineSection.jsx';
import CommitmentSection from './CommitmentSection.jsx';
import { commitmentAPI, executionItemAPI, routineAPI } from '../../api/api.js';
import { formatDateShort, todayString, weekDates, weekOffsetOf } from '../../lib/datetime.js';

export default function ScheduleView({
  draft, onPatchCard, onToggleExclude, onOpenAi, refreshToken, projectTitles, projects, onItemDeleted,
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const dates = useMemo(() => weekDates(weekOffset), [weekOffset]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [routines, setRoutines] = useState([]);
  const [occurrences, setOccurrences] = useState([]);
  const [routinesLoading, setRoutinesLoading] = useState(true);
  const [commitments, setCommitments] = useState([]);
  const [commitmentsLoading, setCommitmentsLoading] = useState(true);
  /** 격자에서 약속을 누르면 아래 목록의 그 줄이 편집으로 열린다. */
  const [editingCommitmentId, setEditingCommitmentId] = useState(null);
  const today = todayString();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await executionItemAPI.getByDateRange(dates[0], dates[6]));
    } catch (err) {
      setError(err.message || '일정을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  /*
   * 반복 일정은 규칙과 발생분을 따로 읽는다. 규칙은 아래 목록이 쓰고, 발생분은 격자가 쓴다.
   * 발생분에는 서버에 행이 없어서 주를 옮길 때마다 그 주 것을 다시 계산해 받아야 한다.
   */
  const loadRoutines = async () => {
    setRoutinesLoading(true);
    try {
      const [list, expanded] = await Promise.all([
        routineAPI.list(),
        routineAPI.occurrences(dates[0], dates[6]),
      ]);
      setRoutines(list);
      setOccurrences(expanded);
    } catch (err) {
      setError(err.message || '반복 일정을 불러오지 못했습니다.');
    } finally {
      setRoutinesLoading(false);
    }
  };

  /* 약속도 그 주에 걸치는 것을 받는다 — 시작일이 아니라 구간이 겹치면 온다. */
  const loadCommitments = async () => {
    setCommitmentsLoading(true);
    try {
      setCommitments(await commitmentAPI.list(dates[0], dates[6]));
    } catch (err) {
      setError(err.message || '약속을 불러오지 못했습니다.');
    } finally {
      setCommitmentsLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadRoutines();
    loadCommitments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset, refreshToken]);

  /*
   * 새 초안이 도착하면 그 초안이 실제로 놓이는 주로 화면을 옮긴다. 이게 없으면 "다음 주
   * 계획을 짜줘"라고 했을 때 초안은 만들어졌는데 이번 주 격자에는 아무것도 안 보이는,
   * 가장 나쁜 상태가 된다. 사용자가 직접 주를 옮긴 뒤에는 따라가지 않는다(초안이 바뀔 때만).
   */
  useEffect(() => {
    if (!draft) return;
    const dates = draft.cards
      .map((c) => c.scheduledDate)
      .filter(Boolean)
      .sort();
    if (dates.length === 0) return;
    setWeekOffset(weekOffsetOf(dates[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.proposalId]);

  const draftCards = draft?.cards ?? [];
  const weekDraftCards = draftCards.filter(
    (c) => c.operation === 'CREATE' && (!c.scheduledDate || dates.includes(c.scheduledDate)),
  );
  const adjustedItems = items.filter((i) => adjustmentFor(draft, i.executionItemId));

  /** 결과를 돌려준다 — ExecutionRow가 성공했을 때만 트레이를 닫는다(TodayView와 같은 계약). */
  const handleAction = async (action, item, payload) => {
    setBusyId(item.executionItemId);
    try {
      if (action === 'complete') await executionItemAPI.complete(item.executionItemId, item.version, payload ?? {});
      else if (action === 'partial') await executionItemAPI.partial(item.executionItemId, { version: item.version, ...payload });
      else if (action === 'reduce') await executionItemAPI.reduce(item.executionItemId, { version: item.version, ...payload });
      else if (action === 'move') {
        await executionItemAPI.move(item.executionItemId, payload.toDate, item.version, {
          startTime: payload.startTime ?? null,
          endTime: payload.endTime ?? null,
        });
      }
      else if (action === 'resume') await executionItemAPI.resume(item.executionItemId, item.version);
      else if (action === 'delete') {
        await executionItemAPI.delete(item.executionItemId, item.version);
        // 되돌릴 수 있게 알린다. 확인을 묻지 않는 대신 지운 뒤에 되돌릴 길을 준다.
        onItemDeleted?.(item);
      }
      setSelected(null);
      await load();
      return { ok: true };
    } catch (err) {
      setError(err.message || '처리하지 못했습니다.');
      return { ok: false, code: err.code ?? null, message: err.message ?? null };
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="view view-wide">
      <header className="view-head">
        <div>
          <h1 className="view-title">일정</h1>
          <p className="view-sub">
            {formatDateShort(dates[0])} ~ {formatDateShort(dates[6])} · 앞으로 언제 무엇을 할지
          </p>
        </div>
        <div className="week-nav">
          <button type="button" className="icon-btn" onClick={() => setWeekOffset((v) => v - 1)} aria-label="지난 주">
            <ChevronLeft size={16} />
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setWeekOffset(0)}>이번 주</button>
          <button type="button" className="icon-btn" onClick={() => setWeekOffset((v) => v + 1)} aria-label="다음 주">
            <ChevronRight size={16} />
          </button>
        </div>
      </header>

      {error && <p className="view-error">{error}</p>}
      {loading && <p className="view-dim">불러오는 중...</p>}

      <WeekGrid
        dates={dates}
        items={items}
        draftCards={draftCards}
        occurrences={occurrences}
        commitments={commitments}
        todayDate={today}
        onPatchCard={onPatchCard}
        onSelectItem={setSelected}
        onSelectCommitment={(c) => setEditingCommitmentId(c.commitmentId)}
      />

      {selected && (
        <section className="view-section">
          <h2 className="section-title">선택한 일정</h2>
          <ExecutionRow
            item={selected}
            projectTitle={selected.courseId ? projectTitles?.[selected.courseId] : null}
            adjustment={adjustmentFor(draft, selected.executionItemId)}
            onAdjustmentPatch={onPatchCard}
            onAdjustmentExclude={onToggleExclude}
            onAction={handleAction}
            busy={busyId === selected.executionItemId}
          />
          <button type="button" className="btn-ghost btn-sm" onClick={() => setSelected(null)}>닫기</button>
        </section>
      )}

      {(weekDraftCards.length > 0 || adjustedItems.length > 0) && (
        <section className="view-section">
          <h2 className="section-title"><Sparkles size={14} /> 이번 주 초안</h2>
          <p className="section-desc">
            격자에서 끌어 옮기거나 아래에서 값을 고칠 수 있어요. AI에게 &quot;수요일 거 금요일로 옮겨&quot;처럼
            말해도 됩니다.
          </p>
          <div className="row-list">
            {weekDraftCards.map((card) => (
              <DraftRow key={card.proposalItemId} card={card} showDate
                onPatch={onPatchCard} onToggleExclude={onToggleExclude} />
            ))}
            {adjustedItems.map((item) => (
              <ExecutionRow
                key={item.executionItemId}
                item={item}
                compact
                projectTitle={item.courseId ? projectTitles?.[item.courseId] : null}
                adjustment={adjustmentFor(draft, item.executionItemId)}
                onAdjustmentPatch={onPatchCard}
                onAdjustmentExclude={onToggleExclude}
              />
            ))}
          </div>
        </section>
      )}

      <CommitmentSection
        commitments={commitments}
        loading={commitmentsLoading}
        editingId={editingCommitmentId}
        onEdit={setEditingCommitmentId}
        onChanged={loadCommitments}
      />

      <RoutineSection
        routines={routines}
        courses={projects}
        loading={routinesLoading}
        onChanged={loadRoutines}
      />

      {!loading && items.length === 0 && draftCards.length === 0 && occurrences.length === 0
        && commitments.length === 0 && (
        <div className="empty-block">
          <p className="empty-title">이번 주에 잡힌 것이 없어요</p>
          <p className="empty-desc">오른쪽에서 &quot;이번 주 계획 짜줘&quot;라고 말하면 초안이 이 격자 위에 바로 나타나요.</p>
          <button type="button" className="btn-ghost btn-sm" onClick={onOpenAi}>
            <Sparkles size={13} /> AI와 계획 세우기
          </button>
        </div>
      )}
    </div>
  );
}
