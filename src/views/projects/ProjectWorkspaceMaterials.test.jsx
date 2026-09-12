import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProjectWorkspace from './ProjectWorkspace.jsx';
import {
  courseAPI, courseNoteAPI, executionItemAPI, materialAPI, materialStoreAPI, planAPI, topicAPI,
} from '../../api/api.js';

vi.mock('../../api/api.js', () => ({
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
    await user.click(screen.getByRole('button', { name: '업로드' }));

    expect(materialAPI.upload).toHaveBeenCalledWith(6, 'SYLLABUS', expect.any(File));
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
