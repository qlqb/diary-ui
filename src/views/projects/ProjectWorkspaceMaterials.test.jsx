import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProjectWorkspace from './ProjectWorkspace.jsx';
import {
  courseAPI, courseNoteAPI, executionItemAPI, materialAPI, materialStoreAPI, topicAPI,
} from '../../api/api.js';

vi.mock('../../api/api.js', () => ({
  courseAPI: { get: vi.fn(), update: vi.fn(), archive: vi.fn() },
  courseNoteAPI: { list: vi.fn() },
  executionItemAPI: { getByCourse: vi.fn() },
  materialAPI: { upload: vi.fn(), listByCourse: vi.fn() },
  materialAnalysisAPI: { analyze: vi.fn(), dismiss: vi.fn() },
  materialStoreAPI: { list: vi.fn(), addLink: vi.fn(), removeLink: vi.fn(), updateLinkType: vi.fn() },
  topicAPI: { getTree: vi.fn() },
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
