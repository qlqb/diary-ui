/**
 * 계획 초안을 일정 탭과 같은 주간 격자 위에 블록으로 보여준다.
 *
 * 목록만 보면 "적용하면 내 일주일이 어떻게 되는지"를 머릿속으로 맞춰 봐야 한다. 일정 탭의 초안처럼
 * 이미 잡힌 실행·반복 일정·약속 위에 초안 블록(점선)을 겹쳐 그려, 자리로 보여준다.
 *
 * 블록의 시각은 배치 미리보기(placedItems)가 정한 것 그대로다. 여기서는 끌어 옮기지 않는다 — 확정에
 * 실리는 시각은 미리보기 하나뿐이어야 목록과 격자가 서로 다른 말을 하지 않는다.
 */

import { useEffect, useMemo, useState } from 'react';
import WeekGrid from '../schedule/WeekGrid.jsx';
import { commitmentAPI, executionItemAPI, routineAPI } from '../../api/api.js';
import { shiftDate, todayString, toHHmm } from '../../lib/datetime.js';

export default function PlanWeekPreview({ preview, items, excluded }) {
  const horizonStart = preview?.horizonStart ?? preview?.placedItems?.[0]?.scheduledDate ?? null;
  const dates = useMemo(
    () => (horizonStart ? Array.from({ length: 7 }, (_, i) => shiftDate(horizonStart, i)) : []),
    [horizonStart],
  );

  const [context, setContext] = useState({ items: [], occurrences: [], commitments: [] });
  const [contextFailed, setContextFailed] = useState(false);

  /*
   * 이미 잡힌 것들은 배경이다. 못 읽어도 초안 블록은 그대로 보여주고, 못 읽었다고만 말한다 —
   * 빈 격자를 "그 주에 아무것도 없다"로 읽히게 두지 않는다.
   */
  useEffect(() => {
    if (dates.length === 0) return undefined;
    let cancelled = false;
    const from = dates[0];
    const to = dates[dates.length - 1];
    const safely = async (load) => {
      try { return { ok: true, value: (await load()) ?? [] }; } catch { return { ok: false, value: [] }; }
    };
    Promise.all([
      safely(() => executionItemAPI.getByDateRange(from, to)),
      safely(() => routineAPI.occurrences(from, to)),
      safely(() => commitmentAPI.list(from, to)),
    ]).then(([executions, occurrences, commitments]) => {
      if (cancelled) return;
      setContext({ items: executions.value, occurrences: occurrences.value, commitments: commitments.value });
      setContextFailed(!executions.ok || !occurrences.ok || !commitments.ok);
    });
    return () => { cancelled = true; };
  }, [dates]);

  const draftCards = useMemo(() => {
    const titleById = new Map((items ?? []).map((i) => [i.proposalItemId, i.title]));
    return (preview?.placedItems ?? [])
      .filter((p) => titleById.has(p.proposalItemId))
      .map((p) => ({
        proposalItemId: p.proposalItemId,
        operation: 'CREATE',
        title: titleById.get(p.proposalItemId),
        scheduledDate: p.scheduledDate,
        startTime: toHHmm(p.scheduledStartAt),
        endTime: toHHmm(p.scheduledEndAt),
        excluded: excluded.has(p.proposalItemId),
      }));
  }, [preview, items, excluded]);

  if (dates.length === 0) return null;

  return (
    <section className="plan-week-preview" aria-label="주간 블록 미리보기">
      <p className="hint">
        점선 블록이 이 초안이에요. 회색은 이미 잡힌 반복 일정·약속이고, 체크를 푼 항목은 흐리게 보여요.
      </p>
      {contextFailed && <p className="hint">기존 일정 일부를 불러오지 못해 초안 블록만 보일 수 있어요.</p>}
      <WeekGrid
        dates={dates}
        items={context.items}
        draftCards={draftCards}
        occurrences={context.occurrences}
        commitments={context.commitments}
        todayDate={todayString()}
      />
    </section>
  );
}
