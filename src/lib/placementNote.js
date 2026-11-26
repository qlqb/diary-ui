/**
 * 지나간 일정의 "자리" 설명.
 *
 * 계획이 틀어졌을 때 원인을 사람(의지·성실)이 아니라 배치(그 자리가 어떤 자리였나)에 돌린다
 * (handoff plan-experience-plan-2026-11-20 §1 2단계). 그래서 여기서는 그날 일정만 보고
 * **확실히 말할 수 있는 자리의 속성**만 고른다. 근거가 없으면 아무것도 말하지 않는다(null) —
 * 그럴듯한 이유를 지어내면 "들킨 느낌"만 남는다.
 *
 * 지금 판정하는 두 가지:
 *   OVERLAP     같은 시각에 다른 일정(수업·약속·다른 조각)이 겹쳐 있었다 → 둘 중 하나는 밀리게 되어 있었다
 *   RIGHT_AFTER 수업·약속이 끝나고 15분 안에 바로 이어 붙은 자리였다 → 그런 자리는 잘 안 붙는 편이다
 * 지난 기록을 근거로 한 숫자("이 자리는 평균 1시간 40분")는 기록 집계(4단계)가 생긴 뒤에 붙인다.
 * 문구의 적절성과 15분이라는 기준은 실측 대상이다(같은 문서 §3).
 */

/** 앞 일정이 끝난 뒤 이 시간 안에 시작하면 "바로 이어 붙은 자리"로 본다. */
export const RIGHT_AFTER_MINUTES = 15;

const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/**
 * @param item     지나간 실행 조각(시각 있음). startTime/endTime 'HH:mm'
 * @param timeline buildTodayTimeline 결과(오늘 시간을 점유하는 항목들)
 * @returns {{ kind: 'OVERLAP'|'RIGHT_AFTER', text: string } | null}
 */
export function placementNote(item, timeline) {
  if (!item?.startTime || !item?.endTime) return null;
  const [sh, sm] = item.startTime.split(':').map(Number);
  const [eh, em] = item.endTime.split(':').map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  const selfKey = `EXECUTION:${item.executionItemId}`;
  const others = (timeline ?? []).filter((e) => e.key !== selfKey);

  const overlapping = others.find((e) => e.startMinutes < end && start < e.endMinutes);
  if (overlapping) {
    return {
      kind: 'OVERLAP',
      text: `같은 시각에 다른 일정(${overlapping.title} ${hhmm(Math.max(0, overlapping.startMinutes))}~${hhmm(Math.min(1440, overlapping.endMinutes))})이 겹쳐 있던 자리였어요. 둘 중 하나는 밀리게 되어 있었어요.`,
    };
  }

  // 바로 앞에서 끝난 고정 일정(수업·약속). 실행 조각끼리는 사용자가 이어서 하는 경우가 많아 원인으로 보지 않는다.
  const before = others
    .filter((e) => e.kind !== 'EXECUTION' && e.endMinutes <= start && start - e.endMinutes <= RIGHT_AFTER_MINUTES)
    .sort((a, b) => b.endMinutes - a.endMinutes)[0];
  if (before) {
    const gap = start - before.endMinutes;
    return {
      kind: 'RIGHT_AFTER',
      text: `${before.title} 끝나고 ${gap === 0 ? '바로' : `${gap}분 만에`} 이어 붙은 자리였어요. 이런 자리는 잘 안 붙는 편이에요 — 다음엔 사이에 30분을 두는 쪽을 권해요.`,
    };
  }
  return null;
}
