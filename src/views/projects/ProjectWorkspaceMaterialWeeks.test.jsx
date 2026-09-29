import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProjectWorkspace from './ProjectWorkspace.jsx';
import {
  analysisBatchAPI, courseAPI, courseNoteAPI, executionItemAPI, materialAPI, materialWeekAPI, planAPI, topicAPI,
} from '../../api/api.js';

vi.mock('../../api/api.js', () => ({
  // 자동 분석·변경안·과제 — 이 테스트들의 관심사가 아니라 빈 값을 준다.
  materialAnalysisStatusAPI: {
    overview: vi.fn().mockResolvedValue({ materials: [], paused: false, serviceAvailable: true }),
    retry: vi.fn(), section: vi.fn(), sections: vi.fn().mockResolvedValue([]), status: vi.fn(),
  },
  projectTidyAPI: {
    get: vi.fn().mockResolvedValue({ courseId: 6, readyMaterialCount: 0, analyzingMaterialCount: 0, groups: [] }),
    request: vi.fn(), saveEdits: vi.fn(), apply: vi.fn(), dismiss: vi.fn(), history: vi.fn(),
  },
  analysisBatchAPI: {
    estimate: vi.fn(), create: vi.fn(), get: vi.fn(), listOpen: vi.fn().mockResolvedValue([]),
    listOpenPage: vi.fn().mockResolvedValue({ batches: [], nextCursor: null, totalOpen: 0 }),
  },
  zipImportAPI: { create: vi.fn(), get: vi.fn(), confirm: vi.fn(), retryEntry: vi.fn(), cancel: vi.fn() },
  assignmentAPI: {
    listByCourse: vi.fn().mockResolvedValue([]), listOpen: vi.fn().mockResolvedValue([]),
    answer: vi.fn(), setDue: vi.fn(), setCompleted: vi.fn(), rename: vi.fn(), create: vi.fn(),
  },
  courseAPI: { get: vi.fn(), update: vi.fn(), archive: vi.fn() },
  courseNoteAPI: { list: vi.fn() },
  executionItemAPI: { getByCourse: vi.fn(), getByDateRange: vi.fn() },
  materialAPI: { upload: vi.fn(), listByCourse: vi.fn() },
  materialAnalysisAPI: { analyze: vi.fn(), dismiss: vi.fn(), listByMaterial: vi.fn() },
  materialStoreAPI: { list: vi.fn(), addLink: vi.fn(), removeLink: vi.fn(), updateLinkType: vi.fn() },
  topicAPI: { getTree: vi.fn() },
  // 프로젝트 화면 상단이 대표 계획을 읽는다. 이 테스트의 관심사는 자료 연결이므로
  // 계획은 "없음"으로 두고 화면이 그래도 정상적으로 그려지는지만 보장한다.
  planAPI: { findCoveringDate: vi.fn() },
  materialWeekAPI: { review: vi.fn(), place: vi.fn(), applySuggestions: vi.fn() },
}));

/**
 * 프로젝트 자료 목록의 주차. 추천은 칩에만 적히고(선택 상자에 선택된 값처럼 보이지 않는다), 선택 상자로 고르면
 * 그 자리에서 저장된다. 한 화면 확인(드래그 포함)은 [자료 주차 확인]이 연다.
 */
const MATERIALS = [
  { materialId: 3, courseId: 6, materialType: 'PROFESSOR_SLIDE', originalFilename: '3.AWS_구성하기_SSH실습.pdf',
    extractionStatus: 'SUCCESS' },
  { materialId: 4, courseId: 6, materialType: 'SYLLABUS', originalFilename: '네트워크프로그래밍.pdf',
    extractionStatus: 'SUCCESS' },
];

const REVIEW = {
  courseId: 6, courseTitle: '네트워크프로그래밍', weekCount: 15, needsReview: 1,
  items: [
    { materialId: 3, filename: '3.AWS_구성하기_SSH실습.pdf', materialType: 'PROFESSOR_SLIDE', analysisState: 'DONE',
      assignment: null, suggestionDiffers: false,
      suggestion: { placement: 'WEEK', week: 3, confidence: 'HIGH', bulkApplicable: true,
        options: [{ placement: 'WEEK', week: 3 }], evidence: [] } },
    { materialId: 4, filename: '네트워크프로그래밍.pdf', materialType: 'SYLLABUS', analysisState: 'DONE',
      assignment: { placement: 'COURSE_WIDE', weeks: [], source: 'SUGGESTION' }, suggestionDiffers: false,
      suggestion: { placement: 'COURSE_WIDE', week: null, confidence: 'HIGH', bulkApplicable: true,
        options: [{ placement: 'COURSE_WIDE', week: null }], evidence: [] } },
  ],
};

function renderWorkspace() {
  return render(
    <ProjectWorkspace courseId={6} onBack={vi.fn()} onAsk={vi.fn()} draft={null}
      onPatchCard={vi.fn()} onToggleExclude={vi.fn()} onProjectsChanged={vi.fn()} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  analysisBatchAPI.listOpen.mockResolvedValue([]);
  analysisBatchAPI.listOpenPage.mockResolvedValue({ batches: [], nextCursor: null, totalOpen: 0 });
  planAPI.findCoveringDate.mockResolvedValue([]);
  executionItemAPI.getByDateRange.mockResolvedValue([]);
  courseAPI.get.mockResolvedValue({ courseId: 6, title: '네트워크프로그래밍', status: 'ACTIVE' });
  materialAPI.listByCourse.mockResolvedValue(MATERIALS);
  topicAPI.getTree.mockResolvedValue([]);
  courseNoteAPI.list.mockResolvedValue([]);
  executionItemAPI.getByCourse.mockResolvedValue([]);
  materialWeekAPI.review.mockResolvedValue(REVIEW);
});

describe('프로젝트 자료 목록의 주차', () => {
  it('확정 자리와 AI 추천을 구분해 보이고, 추천은 선택 상자에 선택되지 않는다', async () => {
    renderWorkspace();

    expect(await screen.findByText('3주차 · AI 추천')).toBeInTheDocument();
    expect(screen.getByText('전체 참고자료 · 확인됨')).toBeInTheDocument();
    expect(screen.getByText('주차 확인 필요 1개')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '3.AWS_구성하기_SSH실습.pdf의 주차' })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: '네트워크프로그래밍.pdf의 주차' })).toHaveValue('course');
  });

  it('선택 상자로 고르면 바로 저장된다 — 추천 주차를 고르면 추천 확인이다', async () => {
    const user = userEvent.setup();
    materialWeekAPI.place.mockResolvedValue({
      ...REVIEW, needsReview: 0,
      items: [{ ...REVIEW.items[0], assignment: { placement: 'WEEK', weeks: [3], source: 'SUGGESTION' } }, REVIEW.items[1]],
    });
    renderWorkspace();

    await user.selectOptions(await screen.findByRole('combobox', { name: '3.AWS_구성하기_SSH실습.pdf의 주차' }), 'w3');

    expect(materialWeekAPI.place).toHaveBeenCalledWith(6, 3, { placement: 'WEEK', weeks: [3], source: 'SUGGESTION' });
    expect(await screen.findByText('3주차 · 확인됨')).toBeInTheDocument();
    expect(screen.getByText('모든 자료의 주차를 확인했어요')).toBeInTheDocument();
  });

  it('[자료 주차 확인]이 한 화면 확인을 연다', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(await screen.findByRole('button', { name: '자료 주차 확인' }));

    const dialog = await screen.findByRole('dialog', { name: '자료 주차 확인' });
    expect(within(dialog).getByRole('button', { name: '추천대로 적용 (1)' })).toBeInTheDocument();
  });
});
