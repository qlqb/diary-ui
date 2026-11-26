/**
 * 프로젝트 화면의 연결된 자료 목록 — 보기(전체 / 주차별)와 정렬.
 *
 * ★ 주차를 여기서 추측하지 않는다. 주차는 서버가 준 주차 확인 결과(placementsOf)를 그대로
 * 따른다: 확정된 자리, 아니면 한꺼번에 적용할 만한 AI 추천. 그 밖은 "주차 미정"이다.
 */

import { CardState, COURSE_KEY, placementsOf } from './materialWeeks.js';

export const MaterialView = Object.freeze({ ALL: 'all', WEEK: 'week' });

export const MaterialSort = Object.freeze({
  WEEK: 'week',
  NAME: 'name',
  NEWEST: 'newest',
  OLDEST: 'oldest',
  ROLE: 'role',
});

export const MATERIAL_SORT_LABEL = {
  [MaterialSort.WEEK]: '주차순',
  [MaterialSort.NAME]: '이름순',
  [MaterialSort.NEWEST]: '최근 올린 순',
  [MaterialSort.OLDEST]: '먼저 올린 순',
  [MaterialSort.ROLE]: '역할순',
};

const ROLE_ORDER = ['SYLLABUS', 'TEXTBOOK_TOC', 'PROFESSOR_SLIDE', 'OTHER'];
const UNPLACED = 'unplaced';

/** "2주차_자료.pdf"와 "10주차_자료.pdf"가 사람이 읽는 순서로 놓이게 숫자를 숫자로 비교한다. */
const nameCollator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });

/**
 * 자료 하나의 주차 자리. 여러 주차에 걸친 자료는 첫 주차에 둔다(목록에 두 번 그리지 않는다).
 * @returns {{ key: string, week: number|null, suggested: boolean }}
 */
export function materialSlot(weekItem) {
  if (!weekItem) return { key: UNPLACED, week: null, suggested: false };
  const first = placementsOf(weekItem)[0];
  if (!first || first.state === CardState.NEEDS_REVIEW || first.state === CardState.DISMISSED) {
    return { key: UNPLACED, week: null, suggested: false };
  }
  return { key: first.key, week: first.week, suggested: first.state === CardState.SUGGESTED };
}

/** 정렬용 주차 값: 1~N주차, 그다음 전체 참고자료, 맨 뒤 주차 미정. */
function weekRank(slot) {
  if (slot.week != null) return slot.week;
  if (slot.key === COURSE_KEY) return 10_000;
  return 20_000;
}

function time(m) {
  const t = Date.parse(m.createdAt ?? '');
  return Number.isNaN(t) ? 0 : t;
}

export function sortMaterials(materials, sort, weekItemById) {
  const byName = (a, b) => nameCollator.compare(a.originalFilename ?? '', b.originalFilename ?? '');
  const slotOf = (m) => materialSlot(weekItemById.get(m.materialId));
  const compare = {
    [MaterialSort.WEEK]: (a, b) => (weekRank(slotOf(a)) - weekRank(slotOf(b))) || byName(a, b),
    [MaterialSort.NAME]: byName,
    [MaterialSort.NEWEST]: (a, b) => (time(b) - time(a)) || byName(a, b),
    [MaterialSort.OLDEST]: (a, b) => (time(a) - time(b)) || byName(a, b),
    [MaterialSort.ROLE]: (a, b) => {
      const ra = ROLE_ORDER.indexOf(a.materialType ?? 'OTHER');
      const rb = ROLE_ORDER.indexOf(b.materialType ?? 'OTHER');
      return ((ra < 0 ? ROLE_ORDER.length : ra) - (rb < 0 ? ROLE_ORDER.length : rb)) || byName(a, b);
    },
  }[sort] ?? byName;
  return [...materials].sort(compare);
}

/**
 * 주차별 묶음. 자료가 있는 주차만 만든다(빈 15칸을 늘어놓지 않는다).
 * 순서: 1~N주차 → 전체 참고자료 → 주차 미정. 묶음 안의 순서는 고른 정렬을 따른다.
 */
export function groupMaterialsByWeek(materials, sort, weekItemById) {
  const sorted = sortMaterials(materials, sort, weekItemById);
  const groups = new Map();
  sorted.forEach((m) => {
    const slot = materialSlot(weekItemById.get(m.materialId));
    if (!groups.has(slot.key)) {
      const title = slot.week != null ? `${slot.week}주차`
        : slot.key === COURSE_KEY ? '전체 참고자료' : '주차 미정';
      groups.set(slot.key, { key: slot.key, title, rank: weekRank(slot), materials: [] });
    }
    groups.get(slot.key).materials.push(m);
  });
  return [...groups.values()].sort((a, b) => a.rank - b.rank);
}
