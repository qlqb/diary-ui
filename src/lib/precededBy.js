/**
 * 앞 일정 기준 표현 — "자료구조 수업 끝나고 30분 뒤"처럼 시각을 앞 일정에 이어 말한다.
 * 실행할 때 시각보다 기억하기 쉽다는 것이 이유다(handoff plan-experience-plan-2026-11-20 §2).
 *
 * 저장하지 않고 보여줄 때마다 계산한다. 표현은 항목의 속성이 아니라 놓인 자리의 속성이라서, 초안을 끌어 옮기거나
 * 수업이 휴강·보강되거나 다시 잡기로 밀리면 저장해 둔 문장은 사실이 아니게 된다. 계획 미리보기와 오늘 화면이
 * 이 함수 하나를 쓴다.
 *
 * 규칙(첫 구현 기준, 실측 대상 §3):
 *   - 앱이 아는 사건에만 잇는다: 반복 일정 발생분, 약속, 같은 날 앞의 조각. 식사·이동처럼 모르는 사건은 쓰지 않는다.
 *   - 같은 날, 이 자리보다 먼저 끝난 것 중 가장 늦게 끝난 것. 간격이 MAX_GAP_MINUTES보다 길면 잇지 않는다
 *     ("수업 끝나고 3시간 뒤"는 시각보다 못하다) — 그때는 null을 돌려주고 화면은 시각만 쓴다.
 *   - 이름 "anchor"를 쓰지 않는다. 코드에서 anchor는 이미 자료 위치(13번 D6)와 입력 쪽 상대 시각(DraftSlotRegistry)을 뜻한다.
 */

export const MAX_GAP_MINUTES = 60;
const RIGHT_AFTER_MINUTES = 5;
const SHORT_TITLE_MAX = 14;

/** 그날 0시부터의 초. 초까지 비교해야 경계(10:00:10 시작 ↔ 10:00:50 끝)에서 순서가 틀리지 않는다. 표시는 분 단위로 한다. */
const secondsOfIso = (iso) => {
  const [h = 0, m = 0, sec = 0] = String(iso).slice(11, 19).split(':').map(Number);
  return h * 3600 + m * 60 + (Number.isFinite(sec) ? sec : 0);
};
const dateOfIso = (iso) => String(iso).slice(0, 10);

/** 긴 과목명을 문장에 넣을 만큼 줄인다. "스마트앱프로젝트 — 센서활용 …" → "스마트앱프로젝트" */
export function shortTitle(title) {
  const text = String(title ?? '').trim();
  const cut = text.split(/\s[—–-]\s|\s\(/)[0].trim() || text;
  return cut.length > SHORT_TITLE_MAX ? `${cut.slice(0, SHORT_TITLE_MAX)}…` : cut;
}

/**
 * @param startAt 'YYYY-MM-DDTHH:mm(:ss)' — 이 자리의 시작
 * @param blocks  [{ title, startAt, endAt }] 같은 기간의 반복 일정 발생분·약속·다른 조각(자기 자신은 빼고 넘긴다)
 * @returns {string|null}
 */
export function precededByLabel(startAt, blocks) {
  if (!startAt) return null;
  const date = dateOfIso(startAt);
  const start = secondsOfIso(startAt);
  let best = null;
  for (const b of blocks ?? []) {
    if (!b?.endAt || !b?.title) continue;
    // 같은 날 시작해 같은 날 끝난 것만 앞 일정이다. 전날 밤에 시작해 자정을 넘긴 일정(알바 22:00~02:00)은 그날의
    // "앞 일정"이 아니다 — 끝난 날짜만 보면 새벽 조각이 아침 일정의 앞 일정으로 잡힌다.
    if (dateOfIso(b.endAt) !== date || (b.startAt && dateOfIso(b.startAt) !== date)) continue;
    const end = secondsOfIso(b.endAt);
    if (end > start) continue;
    if (start - end > MAX_GAP_MINUTES * 60) continue;
    if (!best || end > best.end) best = { end, title: b.title };
  }
  if (!best) return null;
  const gap = Math.round((start - best.end) / 60);
  return gap <= RIGHT_AFTER_MINUTES
    ? `${shortTitle(best.title)} 끝나고 바로`
    : `${shortTitle(best.title)} 끝나고 ${gap}분 뒤`;
}
