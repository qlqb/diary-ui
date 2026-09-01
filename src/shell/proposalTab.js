/**
 * 새 초안을 어느 탭에서 보여줄지.
 *
 * ★ UNSCHEDULED 항목의 targetDate는 진짜 날짜가 아니다.
 *
 * 서버(AiProposalService)는 UNSCHEDULED 후보에도 payload.targetDate에 요청 기간의
 * 시작일을 넣어 두고, 적용 시점에 지운다 — ProposalItemPayload 주석이 그것을 "아직
 * 확정되지 않은 최초 추정값(대개 오늘)"이라고 부른다. 실제 날짜는 배치 미리보기
 * (Timefold)가 정한다.
 *
 * 그 임시값을 진짜 날짜로 읽으면 일주일 계획이 "오늘만 있는 계획"으로 판정돼 오늘 탭에
 * 머문다. 실제로 그렇게 됐다 — 5건 전부 UNSCHEDULED인데 targetDate가 오늘이라 일정 탭으로
 * 넘어가지 않았다.
 *
 * payload에는 "임시값"이라는 표시가 없다. 구분할 수 있는 것은 placementType뿐이다.
 * 계획 화면(PlanCreateView)은 이미 같은 이유로 placementType을 보고 판단하고 있다.
 */
export function tabForProposal(items, today) {
  const list = items ?? [];

  // 날짜가 아직 안 정해진 후보가 하나라도 있으면 여러 날에 걸친 계획이다.
  if (list.some((item) => item.placementType === 'UNSCHEDULED')) {
    return 'schedule';
  }

  const dates = new Set(
    list.filter((item) => item.placementType !== 'UNSCHEDULED').map((item) => item.targetDate),
  );
  return dates.size === 1 && dates.has(today) ? 'today' : 'schedule';
}
