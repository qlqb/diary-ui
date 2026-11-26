/**
 * 자료 주차 확인 화면의 모양. 서버가 준 확정 자리(assignment)와 추천(suggestion)을 보드의 칸으로 옮긴다.
 *
 * ★ 여기서 주차를 추측하지 않는다. 파일 이름의 숫자를 읽지도, 추천을 확정으로 바꾸지도 않는다 — 추천은 서버가
 * 계산해 주고, 확정은 사용자가 누른 것만 서버에 저장된다. 이 파일은 "어느 칸에, 어떤 말로 보여 줄까"만 정한다.
 *
 * 칸:
 * - 미분류: 아직 어디에도 놓이지 않았고 한꺼번에 적용할 만한 추천도 없는 자료(약한 추천·충돌·근거 없음),
 *   그리고 사용자가 "주차 없음"으로 확인한 자료.
 * - N주차: 확정된 자료, 그리고 확인 전인 HIGH·MEDIUM 추천(점선 카드, "AI 추천").
 * - 전체 참고자료: 강의계획서처럼 특정 주차가 아닌 자료.
 */

export const Placement = Object.freeze({ WEEK: 'WEEK', COURSE_WIDE: 'COURSE_WIDE', UNASSIGNED: 'UNASSIGNED' });

/** 카드 상태. 색만이 아니라 글자로도 구분한다. */
export const CardState = Object.freeze({
  SUGGESTED: 'SUGGESTED', // 확인 전 추천(HIGH·MEDIUM) — "AI 추천"
  CONFIRMED: 'CONFIRMED', // 추천을 사용자가 적용함 — "확인됨"
  USER: 'USER', // 사용자가 직접 골랐다 — "직접 지정"
  NEEDS_REVIEW: 'NEEDS_REVIEW', // 확인 전이고 한꺼번에 적용할 추천이 없다(약함·충돌·근거 없음)
  DISMISSED: 'DISMISSED', // 사용자가 "주차 없음"으로 확인함
});

export const UNASSIGNED_KEY = 'none';
export const COURSE_KEY = 'course';
export const weekKey = (week) => `w${week}`;

export const EVIDENCE_KIND_LABEL = {
  FILENAME_WEEK: '파일명',
  DOCUMENT_TITLE_WEEK: '파일 속성 제목',
  CONTENT_WEEK: '자료 분석',
  FILENAME_NUMBER: '파일명 순번',
  FIRST_WEEK_NAME: '자료 이름',
  NEXT_LECTURE: '앞뒤 자료',
  PRACTICE_OF: '관련 자료',
  COURSE_PLAN: '강의계획서',
};

export const CONFIDENCE_LABEL = { HIGH: '추천', MEDIUM: '추천', LOW: '약한 추천', CONFLICT: '확인 필요' };

/** 자리 한 곳을 사람이 읽는 말로. */
export function placeLabel(placement, week) {
  if (placement === Placement.WEEK) return `${week}주차`;
  if (placement === Placement.COURSE_WIDE) return '전체 참고자료';
  return '주차 없음';
}

/** 한 자료가 지금 보드의 어디에(여러 곳일 수 있다) 어떤 상태로 놓이는가. */
export function placementsOf(item) {
  const a = item.assignment;
  if (a) {
    const state = a.source === 'SUGGESTION' ? CardState.CONFIRMED : CardState.USER;
    if (a.placement === Placement.WEEK) return (a.weeks ?? []).map((w) => ({ key: weekKey(w), week: w, state }));
    if (a.placement === Placement.COURSE_WIDE) return [{ key: COURSE_KEY, week: null, state }];
    return [{ key: UNASSIGNED_KEY, week: null, state: CardState.DISMISSED }];
  }
  const s = item.suggestion;
  if (s && s.bulkApplicable && s.placement === Placement.WEEK) {
    return [{ key: weekKey(s.week), week: s.week, state: CardState.SUGGESTED }];
  }
  if (s && s.bulkApplicable && s.placement === Placement.COURSE_WIDE) {
    return [{ key: COURSE_KEY, week: null, state: CardState.SUGGESTED }];
  }
  return [{ key: UNASSIGNED_KEY, week: null, state: CardState.NEEDS_REVIEW }];
}

/**
 * 보드 칸 목록. 미분류가 맨 위(찾기 쉽게), 그다음 1~weekCount주차, 맨 아래 전체 참고자료.
 * 카드는 칸 안에서 파일 이름 순이다(서버 순서 그대로).
 */
export function buildBoard(review) {
  const weekCount = Math.max(1, review?.weekCount ?? 15);
  const groups = [{ key: UNASSIGNED_KEY, title: '미분류', week: null, cards: [] }];
  for (let w = 1; w <= weekCount; w += 1) groups.push({ key: weekKey(w), title: `${w}주차`, week: w, cards: [] });
  groups.push({ key: COURSE_KEY, title: '전체 참고자료', week: null, cards: [] });
  const byKey = new Map(groups.map((g) => [g.key, g]));
  (review?.items ?? []).forEach((item) => {
    placementsOf(item).forEach((p) => {
      // 서버가 weekCount를 넓혀 주지만, 그보다 뒤 주차가 오면 칸을 더 만든다(숨기지 않는다).
      if (!byKey.has(p.key)) {
        const extra = { key: p.key, title: `${p.week}주차`, week: p.week, cards: [] };
        groups.splice(groups.length - 1, 0, extra);
        byKey.set(p.key, extra);
      }
      byKey.get(p.key).cards.push({ item, key: p.key, week: p.week, state: p.state, id: `${item.materialId}:${p.key}` });
    });
  });
  return groups;
}

/** "추천대로 적용"에 실을 것: 확인 전이고 HIGH·MEDIUM인 추천만, 화면에 보인 그대로. */
export function bulkItems(review) {
  return (review?.items ?? [])
    .filter((i) => !i.assignment && i.suggestion?.bulkApplicable)
    .map((i) => ({ materialId: i.materialId, placement: i.suggestion.placement, week: i.suggestion.week ?? null }));
}

/** 카드의 상태 문구. "3주차 · AI 추천" / "3주차 · 확인됨" / "2주차 · 직접 지정". */
export function cardStatusText(card) {
  const { item, state, week } = card;
  const where = item.assignment
    ? placeLabel(item.assignment.placement, week)
    : placeLabel(item.suggestion?.placement, item.suggestion?.week);
  switch (state) {
    case CardState.SUGGESTED: return `${where} · AI 추천`;
    case CardState.CONFIRMED: return `${where} · 확인됨`;
    case CardState.USER: return `${where} · 직접 지정`;
    case CardState.DISMISSED: return '주차 없음 · 확인됨';
    default: return needsReviewText(item.suggestion);
  }
}

/** 미분류 카드의 한 줄: 약한 추천이면 "추천: 3주차", 충돌이면 후보들, 근거가 없으면 그렇다고. */
export function needsReviewText(suggestion) {
  if (!suggestion) return '추천 근거 없음';
  if (suggestion.confidence === 'CONFLICT') {
    return `확인 필요: ${(suggestion.options ?? []).map((o) => placeLabel(o.placement, o.week)).join(' 또는 ')}`;
  }
  return `약한 추천: ${placeLabel(suggestion.placement, suggestion.week)}`;
}

/** 보드에서 고를 수 있는 자리(선택 상자의 선택지 값). */
export function slotOptions(weekCount) {
  const options = [{ value: UNASSIGNED_KEY, label: '미분류(주차 없음)' }];
  for (let w = 1; w <= Math.max(1, weekCount ?? 15); w += 1) options.push({ value: weekKey(w), label: `${w}주차` });
  options.push({ value: COURSE_KEY, label: '전체 참고자료' });
  return options;
}

/**
 * 카드 하나를 다른 칸으로 옮길 때 서버에 보낼 자리.
 *
 * - 같은 칸: 추천 카드면 "확인"(source=SUGGESTION), 이미 확정된 카드면 바뀌는 것이 없다(null).
 * - 여러 주차에 놓인 자료의 카드 하나를 다른 주차로: <그 카드의 주차만> 바꾸고 나머지 주차는 둔다.
 * - 확인 전 자료를 추천 후보(충돌이면 후보 중 하나) 자리로: 추천 확인(SUGGESTION). 그 밖의 이동은 직접 지정(USER).
 *
 * @returns {{placement, weeks, source} | null}
 */
export function moveRequest(card, targetKey) {
  const { item } = card;
  const target = parseSlot(targetKey);
  if (!target) return null;
  if (card.key === targetKey) {
    return card.state === CardState.SUGGESTED ? toRequest(target, [], 'SUGGESTION') : null;
  }
  if (target.placement === Placement.WEEK && item.assignment?.placement === Placement.WEEK && card.week != null) {
    const rest = (item.assignment.weeks ?? []).filter((w) => w !== card.week);
    return toRequest(target, rest, 'USER');
  }
  const offered = !item.assignment && (item.suggestion?.options ?? []).some((o) => o.placement === target.placement
    && (o.placement !== Placement.WEEK || o.week === target.week));
  return toRequest(target, [], offered ? 'SUGGESTION' : 'USER');
}

/**
 * 자료 목록의 선택 상자가 가리키는 지금 자리. 확정 전이면 빈 값(추천은 선택된 값처럼 보이지 않게 한다).
 * 여러 주차면 첫 주차.
 */
export function currentSlotKey(item) {
  const a = item?.assignment;
  if (!a) return '';
  if (a.placement === Placement.WEEK) return (a.weeks ?? []).length > 0 ? weekKey(a.weeks[0]) : '';
  return a.placement === Placement.COURSE_WIDE ? COURSE_KEY : UNASSIGNED_KEY;
}

/**
 * 자료 목록에서 고른 자리 하나로 <통째로> 정한다(여러 주차였어도 하나로). 확인 전 자료를 추천 후보 자리로 고르면
 * 추천 확인(SUGGESTION)이고, 그 밖에는 직접 지정이다.
 */
export function slotRequest(item, key) {
  const target = parseSlot(key);
  if (!target) return null;
  const offered = !item.assignment && (item.suggestion?.options ?? []).some((o) => o.placement === target.placement
    && (o.placement !== Placement.WEEK || o.week === target.week));
  return toRequest(target, [], offered ? 'SUGGESTION' : 'USER');
}

/** 여러 주차 자료에 주차 하나를 더한다. */
export function addWeekRequest(item, week) {
  const weeks = [...new Set([...(item.assignment?.weeks ?? []), week])].sort((a, b) => a - b);
  return { placement: Placement.WEEK, weeks, source: 'USER' };
}

/** 추천(충돌이면 고른 후보)을 그대로 확인한다. */
export function acceptRequest(option) {
  return {
    placement: option.placement,
    weeks: option.placement === Placement.WEEK ? [option.week] : [],
    source: 'SUGGESTION',
  };
}

function parseSlot(key) {
  if (key === UNASSIGNED_KEY) return { placement: Placement.UNASSIGNED, week: null };
  if (key === COURSE_KEY) return { placement: Placement.COURSE_WIDE, week: null };
  const m = /^w(\d{1,2})$/.exec(String(key));
  return m ? { placement: Placement.WEEK, week: Number(m[1]) } : null;
}

function toRequest(target, keepWeeks, source) {
  if (target.placement !== Placement.WEEK) return { placement: target.placement, weeks: [], source };
  const weeks = [...new Set([...keepWeeks, target.week])].sort((a, b) => a - b);
  return { placement: Placement.WEEK, weeks, source };
}

/** 자료 목록 한 줄에 붙일 짧은 주차 표시. */
export function materialWeekChip(item) {
  if (!item) return null;
  const a = item.assignment;
  if (a) {
    const where = a.placement === Placement.WEEK ? (a.weeks ?? []).map((w) => `${w}주차`).join('·')
      : placeLabel(a.placement);
    return { text: `${where} · ${a.source === 'SUGGESTION' ? '확인됨' : '직접 지정'}`, tone: 'ok' };
  }
  const s = item.suggestion;
  if (s?.bulkApplicable) return { text: `${placeLabel(s.placement, s.week)} · AI 추천`, tone: 'suggested' };
  return { text: '주차 확인 필요', tone: 'warn' };
}
