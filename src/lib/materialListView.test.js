import { describe, it, expect } from 'vitest';
import { groupMaterialsByWeek, MaterialSort, materialSlot, sortMaterials } from './materialListView.js';

const m = (materialId, originalFilename, extra = {}) => ({
  materialId, originalFilename, materialType: 'OTHER', createdAt: '2026-09-01T10:00:00', ...extra,
});
const confirmedWeek = (materialId, week) => ({
  materialId, assignment: { placement: 'WEEK', weeks: [week], source: 'USER' }, suggestion: null,
});
const suggestedWeek = (materialId, week) => ({
  materialId, assignment: null,
  suggestion: { placement: 'WEEK', week, bulkApplicable: true, confidence: 'HIGH' },
});
const courseWide = (materialId) => ({
  materialId, assignment: { placement: 'COURSE_WIDE', weeks: [], source: 'USER' }, suggestion: null,
});
const weakOnly = (materialId) => ({
  materialId, assignment: null,
  suggestion: { placement: 'WEEK', week: 4, bulkApplicable: false, confidence: 'LOW' },
});

const materials = [
  m(1, '10주차_트리.pdf', { createdAt: '2026-09-03T10:00:00' }),
  m(2, '2주차_배열.pdf', { createdAt: '2026-09-05T10:00:00', materialType: 'PROFESSOR_SLIDE' }),
  m(3, '강의계획서.pdf', { createdAt: '2026-09-01T10:00:00', materialType: 'SYLLABUS' }),
  m(4, '메모.pdf', { createdAt: '2026-09-02T10:00:00' }),
];
const weeks = new Map([
  [1, confirmedWeek(1, 10)], [2, suggestedWeek(2, 2)], [3, courseWide(3)], [4, weakOnly(4)],
]);
const names = (list) => list.map((x) => x.originalFilename);

describe('materialListView', () => {
  it('약한 추천은 주차로 치지 않는다 — 주차 미정이다', () => {
    expect(materialSlot(weakOnly(4)).key).toBe('unplaced');
    expect(materialSlot(suggestedWeek(2, 2))).toMatchObject({ week: 2, suggested: true });
    expect(materialSlot(undefined).key).toBe('unplaced');
  });

  it('주차별로 묶으면 주차 → 전체 참고자료 → 주차 미정 순이고, 자료가 있는 주차만 나온다', () => {
    const groups = groupMaterialsByWeek(materials, MaterialSort.NAME, weeks);
    expect(groups.map((g) => g.title)).toEqual(['2주차', '10주차', '전체 참고자료', '주차 미정']);
    expect(groups[0].materials.map((x) => x.materialId)).toEqual([2]);
  });

  it('이름순은 숫자를 숫자로 비교한다(2주차가 10주차보다 앞)', () => {
    expect(names(sortMaterials(materials, MaterialSort.NAME, weeks)).slice(0, 2))
      .toEqual(['2주차_배열.pdf', '10주차_트리.pdf']);
  });

  it('주차순·최근 올린 순·역할순으로 정렬한다', () => {
    expect(sortMaterials(materials, MaterialSort.WEEK, weeks).map((x) => x.materialId)).toEqual([2, 1, 3, 4]);
    expect(sortMaterials(materials, MaterialSort.NEWEST, weeks).map((x) => x.materialId)).toEqual([2, 1, 4, 3]);
    expect(sortMaterials(materials, MaterialSort.OLDEST, weeks).map((x) => x.materialId)).toEqual([3, 4, 1, 2]);
    expect(sortMaterials(materials, MaterialSort.ROLE, weeks)[0].materialId).toBe(3);
  });

  it('원래 배열은 건드리지 않는다', () => {
    const copy = [...materials];
    sortMaterials(materials, MaterialSort.NAME, weeks);
    expect(materials).toEqual(copy);
  });
});
