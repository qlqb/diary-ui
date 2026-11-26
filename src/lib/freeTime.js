/**
 * 계획 기간의 날짜별 비어 있는 시간과 이번 초안이 쓰는 시간(FreeTimeBars가 그린다).
 * 구간을 시작 날짜에 더한다. 서버가 가용 구간을 자정에서 자르고(PlanPlacementService.splitAtMidnight, 하루 창은 24:00까지)
 * 배치도 그 구간 안에만 하므로 날짜를 넘는 구간은 오지 않는다 — 이 전제가 바뀌면 여기서 날짜 경계로 나눠야 한다.
 * 가용 구간은 일정 미리보기 응답의 availabilityWindows — 배치기가 실제로 쓴 구간이다. 화면에서 기준을 새로 세우지 않는다.
 */
const minutesBetween = (start, end) => Math.max(0, Math.round((new Date(end) - new Date(start)) / 60000));
const dateOf = (iso) => String(iso).slice(0, 10);

/**
 * @returns {{ date, free, used }[]} 날짜순. 가용 구간이 하나도 없는 날도 배치가 있으면 넣는다.
 */
export function freeTimeByDay(preview, excluded = new Set()) {
  const days = new Map();
  const day = (d) => {
    if (!days.has(d)) days.set(d, { date: d, free: 0, used: 0 });
    return days.get(d);
  };
  for (const w of preview?.availabilityWindows ?? []) {
    if (!w?.startAt || !w?.endAt) continue;
    day(dateOf(w.startAt)).free += minutesBetween(w.startAt, w.endAt);
  }
  for (const p of preview?.placedItems ?? []) {
    if (!p?.scheduledStartAt || !p?.scheduledEndAt || excluded.has(p.proposalItemId)) continue;
    day(dateOf(p.scheduledStartAt)).used += minutesBetween(p.scheduledStartAt, p.scheduledEndAt);
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

