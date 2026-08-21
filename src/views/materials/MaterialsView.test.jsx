import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MaterialsView from './MaterialsView.jsx';
import { materialStoreAPI } from '../../api/api.js';

vi.mock('../../api/api.js', () => ({
  materialStoreAPI: {
    list: vi.fn(),
    get: vi.fn(),
    upload: vi.fn(),
    delete: vi.fn(),
    addLink: vi.fn(),
    updateLinkType: vi.fn(),
    removeLink: vi.fn(),
  },
}));

const MATERIAL = {
  materialId: 4,
  originalFilename: '자료구조.pdf',
  contentType: 'application/pdf',
  extractionStatus: 'SUCCESS',
  createdAt: '2026-08-09T05:29:00',
  links: [
    { courseId: 6, courseTitle: '자료구조', materialType: 'SYLLABUS', linkedAt: '2026-08-16T14:30:30' },
  ],
};

/**
 * 전역 자료 상세는 프로젝트 화면과 정반대 책임을 진다 — 맥락을 좁히지 않는 대신
 * 각 분석이 어느 프로젝트의 해석인지 말해야 한다.
 */
const DETAIL = {
  material: MATERIAL,
  analyses: [
    {
      analysisId: 21, courseId: 6, courseTitle: '자료구조', materialId: 4,
      status: 'APPLIED', payload: { summary: '목차를 찾았어요' }, createdAt: '2026-08-16T07:47:17',
    },
    {
      analysisId: 4, courseId: 2, courseTitle: '자료구조 2학기', materialId: 4,
      status: 'APPLIED', payload: { summary: '강의계획서를 읽었어요' }, createdAt: '2026-08-09T05:30:04',
    },
  ],
};

async function openDetail() {
  const user = userEvent.setup();
  render(<MaterialsView projects={[{ courseId: 6, title: '자료구조' }]} onProjectsChanged={vi.fn()} />);
  await user.click(await screen.findByRole('button', { name: /자료구조\.pdf/ }));
  return user;
}

describe('자료 상세', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    materialStoreAPI.list.mockResolvedValue([MATERIAL]);
    materialStoreAPI.get.mockResolvedValue(DETAIL);
    materialStoreAPI.updateLinkType.mockResolvedValue({});
  });

  it('분석 이력의 각 줄에 어느 프로젝트의 해석인지가 붙는다', async () => {
    await openDetail();

    // 프로젝트명이 없으면 "분석 2건"만 남아 어느 맥락의 것인지 알 수 없다.
    expect(await screen.findByText('자료구조 2학기')).toBeInTheDocument();
    expect(screen.getByText('목차를 찾았어요')).toBeInTheDocument();
    expect(screen.getByText('강의계획서를 읽었어요')).toBeInTheDocument();
  });

  it('연결된 프로젝트의 역할을 바꾸면 연결 해제 없이 그 링크만 수정된다', async () => {
    const user = await openDetail();

    const roleSelect = await screen.findByLabelText('자료구조에서의 자료 역할');
    await user.selectOptions(roleSelect, 'TEXTBOOK_TOC');

    expect(materialStoreAPI.updateLinkType).toHaveBeenCalledWith(4, 6, 'TEXTBOOK_TOC');
    // 예전 우회로(연결 해제 후 재연결)를 쓰지 않는다 — linked_at도 분석 이력도 그대로 남는다.
    expect(materialStoreAPI.removeLink).not.toHaveBeenCalled();
    expect(materialStoreAPI.addLink).not.toHaveBeenCalled();
  });
});
