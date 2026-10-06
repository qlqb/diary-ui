import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProjectWorkspace from './ProjectWorkspace.jsx';
import {
  analysisBatchAPI, courseAPI, courseNoteAPI, executionItemAPI, materialAPI, materialStoreAPI,
  planAPI, topicAPI,
} from '../../api/api.js';
import { createFakeBatchApi } from '../../testing/fakeAnalysisBatch.js';

vi.mock('../../api/api.js', () => ({
  structureAPI: { corrections: vi.fn(() => Promise.resolve({ classProgress: [], exclusions: [] })), manual: vi.fn(), request: vi.fn(), removeExclusion: vi.fn() },
  textbookAPI: { get: vi.fn(() => Promise.resolve(null)), apply: vi.fn() },
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
}));

const MATERIAL = {
  materialId: 4,
  courseId: 6,
  materialType: 'OTHER',
  originalFilename: '자료구조.pdf',
  extractionStatus: 'SUCCESS',
};

function renderWorkspace() {
  return render(
    <ProjectWorkspace
      courseId={6}
      onBack={vi.fn()}
      onAsk={vi.fn()}
      draft={null}
      onPatchCard={vi.fn()}
      onToggleExclude={vi.fn()}
      onProjectsChanged={vi.fn()}
    />,
  );
}

describe('프로젝트의 연결된 자료', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 업로드는 서버 묶음을 먼저 열고 자리마다 올린다. 화면 테스트는 그 계약만 흉내 낸다.
    const fakeBatch = createFakeBatchApi();
    analysisBatchAPI.estimate.mockImplementation(fakeBatch.estimate);
    analysisBatchAPI.create.mockImplementation(fakeBatch.create);
    analysisBatchAPI.get.mockImplementation(fakeBatch.get);
    analysisBatchAPI.listOpen.mockImplementation(fakeBatch.listOpen);
    analysisBatchAPI.listOpenPage.mockImplementation(fakeBatch.listOpenPage);
    planAPI.findCoveringDate.mockResolvedValue([]);
    executionItemAPI.getByDateRange.mockResolvedValue([]);
    courseAPI.get.mockResolvedValue({ courseId: 6, title: '자료구조', status: 'ACTIVE' });
    materialAPI.listByCourse.mockResolvedValue([MATERIAL]);
    materialAPI.upload.mockResolvedValue({});
    topicAPI.getTree.mockResolvedValue([]);
    courseNoteAPI.list.mockResolvedValue([]);
    executionItemAPI.getByCourse.mockResolvedValue([]);
    materialStoreAPI.updateLinkType.mockResolvedValue({});
  });

  it('업로드할 때 고른 역할이 그대로 올라간다 — 묻지 않고 OTHER로 확정하지 않는다', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(await screen.findByRole('button', { name: /새 자료 업로드/ }));
    await user.upload(
      screen.getByLabelText('새 자료 파일'),
      new File(['%PDF-1.4'], '강의계획서.pdf', { type: 'application/pdf' }),
    );
    await user.selectOptions(screen.getByLabelText('자료 역할'), 'SYLLABUS');
    await user.click(screen.getByRole('button', { name: '분석 시작' }));

    // 네 번째 인자는 묶음 자리 번호다 — 진행 상태의 원본이 서버에 생긴다.
    await screen.findByRole('region', { name: /자료 분석/ });
    expect(materialAPI.upload)
      .toHaveBeenCalledWith(6, 'SYLLABUS', expect.any(File), expect.any(Number));
  });

  it('목록에서 역할을 바꾸면 연결을 끊지 않고 그 링크만 고친다', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.selectOptions(
      await screen.findByLabelText('자료구조.pdf의 자료 역할'),
      'PROFESSOR_SLIDE',
    );

    expect(materialStoreAPI.updateLinkType).toHaveBeenCalledWith(4, 6, 'PROFESSOR_SLIDE');
    expect(materialStoreAPI.removeLink).not.toHaveBeenCalled();
  });
});
