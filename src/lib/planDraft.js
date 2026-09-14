/**
 * 계획 초안 검토에서 쓰는 순수 함수. 컴포넌트 파일에서 분리한 이유는 Fast Refresh가 컴포넌트만
 * export하는 파일을 요구하기 때문이다.
 */

import { addDays } from './planTime.js';

export const UNGROUPED_KEY = '__other__';

/** courseId가 없는 항목은 "기타"로 묶는다. "미분류"라고 쓰지 않는다. */
export function groupItems(items, projectTitles) {
  const map = new Map();
  for (const item of items ?? []) {
    const key = item.courseId != null ? String(item.courseId) : UNGROUPED_KEY;
    if (!map.has(key)) {
      map.set(key, {
        key,
        title: item.courseId != null ? (projectTitles?.[item.courseId] || '프로젝트') : '기타',
        items: [],
      });
    }
    map.get(key).items.push(item);
  }
  return [...map.values()].sort((a, b) => {
    if (a.key === UNGROUPED_KEY) return 1;
    if (b.key === UNGROUPED_KEY) return -1;
    return a.title.localeCompare(b.title, 'ko');
  });
}

/**
 * 8일 이상 계획은 오늘부터 7일 안에 걸치는 항목이 있는 그룹만 펼치고 나머지는 접는다.
 * "이번 주 8개 + 나머지 22개 접힘"이면 지금 판단할 것만 보인다.
 */
export function initialCollapsed(draft, projectTitles, todayIso) {
  if (!draft || (draft.days ?? 0) <= 7 || !todayIso) return new Set();
  const soonEnd = addDays(todayIso, 6);
  const collapsed = new Set();
  for (const group of groupItems(draft.proposal?.items ?? [], projectTitles)) {
    const hasSoon = group.items.some(
      (item) => item.placementType === 'UNSCHEDULED' || !item.targetDate
        || (item.targetDate >= todayIso && item.targetDate <= soonEnd),
    );
    if (!hasSoon) collapsed.add(group.key);
  }
  return collapsed;
}

/**
 * 미리보기가 배치한 항목을 확정 요청의 editedItems로 옮긴다. 배치 안 된 항목은 넣지 않는다 —
 * 원본(미배치) 그대로 확정되고 롤링 배치가 나중에 시각을 정한다.
 */
export function placementsToEditedItems(selectedItems, placedById) {
  return (selectedItems ?? [])
    .map((item) => placedById.get(item.proposalItemId))
    .filter(Boolean)
    .map((placed) => ({
      proposalItemId: placed.proposalItemId,
      placementType: 'TIME_FIXED',
      scheduledDate: placed.scheduledDate,
      scheduledStartAt: placed.scheduledStartAt,
      scheduledEndAt: placed.scheduledEndAt,
    }));
}
