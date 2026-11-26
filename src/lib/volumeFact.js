/**
 * 분량 3층(사실 → 제안 → 관점)의 문장과 조건.
 *
 * 사람은 소요 시간을 체계적으로 적게 잡는다. 그걸 미리 숫자로 알려주는 것이 계획의 기능이다(handoff
 * plan-experience-plan-2026-11-20 §1 4단계). 분량에 대해서는 사용자를 만족시키지 않는 것이 맞지만, 거절감 없이:
 *   1층 사실  — 늘. 지난 4주 같은 자리의 실제 시간. 은유로 바꾸지 않는다.
 *   2층 제안  — 늘. 자리 크기(서버가 정확한 평균을 30분 단위로 올린 값)로 두고 남으면 더 하기.
 *   3층 관점  — 같은 자리에서 적게 잡은 날이 3번 이상일 때만, 한 문장. 원인은 사람이 아니라 자리로 말한다.
 * 기록이 없으면(첫 주) 아무것도 말하지 않는다 — 무엇을 보여줄지는 미해결이다(같은 문서 §4).
 * 기준값(30분 단위, 3번, 80%)은 첫 구현 기준이고 실측 대상이다(§3).
 *
 * 분량이 자리 크기 안쪽이면 사실도 보여 주지 않는다(2026-11-20 결정). 모든 항목 아래에 숫자를 붙이면 확정 직전
 * 화면이 다시 목록과 숫자로 가득 차서 "안심이 먼저"라는 원칙과 부딪힌다. 줄일 여지가 있을 때만 말한다.
 */
import { formatMinutesKo } from './planTime.js';

export const PERSPECTIVE_MIN_COUNT = 3;

const DAY_KO = { MONDAY: '월요일', TUESDAY: '화요일', WEDNESDAY: '수요일', THURSDAY: '목요일', FRIDAY: '금요일', SATURDAY: '토요일', SUNDAY: '일요일' };
const BAND_KO = { MORNING: '오전(6~12시)', AFTERNOON: '오후(12~18시)', EVENING: '저녁(18~24시)', NIGHT: '새벽(0~6시)' };

/** 한 번에 물을 수 있는 자리 수(서버 검증 상한과 같다). 넘으면 나눠 묻는다. */
export const SLOTS_PER_REQUEST = 60;

/** 자리의 서명 — 과목과 시작 시각. 기록은 이 서명과 함께 저장하고, 지금 자리와 같을 때만 보여 준다. */
export const slotSig = (slot) => `${slot.courseId}:${slot.startAt}`;

/** 서버에 물을 자리들. 시각이 정해졌고 과목이 있는 항목만. */
export function slotsOf(items, placedById, minutesOf) {
  return items
    .map((item) => ({ item, placed: placedById.get(item.proposalItemId) }))
    .filter(({ item, placed }) => item.courseId != null && placed?.scheduledStartAt)
    .map(({ item, placed }) => ({
      key: String(item.proposalItemId),
      courseId: item.courseId,
      startAt: placed.scheduledStartAt,
      plannedMinutes: minutesOf(item),
    }));
}

/** 같은 자리 묶음이면 다시 묻지 않도록 쓰는 키(분량은 빼고 자리만). */
export function slotsKey(slots) {
  return slots.map((s) => `${s.key}:${slotSig(s)}`).join('|');
}

/** 상한에 맞게 나눈다. */
export function chunkSlots(slots, size = SLOTS_PER_REQUEST) {
  const out = [];
  for (let i = 0; i < slots.length; i += size) out.push(slots.slice(i, i + size));
  return out;
}

/**
 * 한 항목의 분량 3층. 잡은 시간이 자리 평균(30분 단위로 올림)보다 크지 않으면 null — 줄이자고 말할 이유가 없다.
 * @param history 서버 SlotHistoryResponse 하나
 * @param plannedMinutes 지금 잡은 분량(사용자가 고친 값 포함)
 */
export function volumeFact(history, plannedMinutes) {
  if (!history || !(history.weeks?.length > 0) || history.averageActualMinutes == null) return null;
  // 자리 크기는 서버가 정확한 평균으로 계산한 값만 쓴다(화면에서 반올림한 평균으로 다시 올리면 경계에서 틀린다).
  const suggested = history.sizeMinutes;
  if (!(suggested > 0) || !(plannedMinutes > suggested)) return null;
  const where = `${DAY_KO[history.dayOfWeek] ?? ''} ${BAND_KO[history.band] ?? ''}`.trim();
  return {
    suggestedMinutes: suggested,
    fact: `${formatMinutesKo(plannedMinutes)}으로 잡으셨네요. 지난 4주 ${where}에 이 과목은 평균 ${formatMinutesKo(history.averageActualMinutes)}이었어요.`,
    weeks: history.weeks.map((w) => ({ date: w.date, actual: w.actualMinutes, planned: w.plannedMinutes })),
    suggestion: `${formatMinutesKo(suggested)}으로 두고, 남으면 더 하는 쪽은 어떠세요?`,
    perspective: history.underestimateCount >= PERSPECTIVE_MIN_COUNT
      ? `${where} 이 자리는 지난 ${history.underestimateCount}번 잡은 시간보다 짧게 끝났어요. 자리 크기에 맞춰 두면 그 뒤에 놓인 계획이 덜 흔들려요.`
      : null,
  };
}
