import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProposalCard from './ProposalCard.jsx';
import { materialStoreAPI } from '../../api/api.js';

vi.mock('../../api/api.js', () => ({
  materialStoreAPI: { applyLinkProposal: vi.fn() },
}));

const verifiedMember = (materialId, filename) => ({
  materialId,
  originalFilename: filename,
  materialType: 'SYLLABUS',
  evidence: '운영체제',
  evidenceSource: 'CONTENT',
  evidenceVerified: true,
});

const proposal = {
  status: 'GENERATED',
  remainingMaterialIds: [],
  groups: [
    {
      groupId: 'g1',
      action: 'CREATE_AND_LINK',
      existingCourseId: null,
      existingCourseTitle: null,
      proposedTitle: '운영체제',
      reason: '두 자료 모두 첫 페이지에 "운영체제"가 적혀 있어요',
      defaultSelected: true,
      notices: [],
      matchingProjects: [],
      members: [verifiedMember(101, 'os_syllabus.pdf'), verifiedMember(102, 'os_toc.pdf')],
    },
    {
      groupId: 'g2',
      action: 'CREATE_AND_LINK',
      existingCourseId: null,
      existingCourseTitle: null,
      proposedTitle: '자료구조',
      reason: '파일명에 자료구조가 있어요',
      defaultSelected: false,
      notices: ['같은 이름의 프로젝트가 이미 있어요. 새로 만들지, 기존 것에 붙일지 골라 주세요.'],
      matchingProjects: [{ courseId: 55, title: '자료구조' }],
      members: [{
        materialId: 103,
        originalFilename: 'ds.pdf',
        materialType: 'SYLLABUS',
        evidence: 'ds',
        evidenceSource: 'FILENAME_ONLY',
        evidenceVerified: false,
      }],
    },
    {
      groupId: 'leave',
      action: 'LEAVE',
      reason: '',
      defaultSelected: false,
      notices: [],
      matchingProjects: [],
      members: [{
        materialId: 104,
        originalFilename: 'scan_0412.pdf',
        materialType: 'OTHER',
        evidence: '',
        evidenceSource: null,
        evidenceVerified: false,
      }],
    },
  ],
};

describe('ProposalCard - 자료 연결 제안 검토', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    materialStoreAPI.applyLinkProposal.mockResolvedValue({ createdProjects: [], linkedMaterialCount: 0 });
  });

  it('체크 초기값은 서버의 defaultSelected를 그대로 쓴다 — 프론트가 재계산하지 않는다', () => {
    render(<ProposalCard proposal={proposal} onApplied={vi.fn()} onClose={vi.fn()} />);

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2); // LEAVE 묶음에는 체크박스가 없다
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
    expect(screen.getByRole('button', { name: /1개 프로젝트 정리/ })).toBeEnabled();
  });

  it('판단하지 못한 자료를 숨기지 않는다 — LEAVE 묶음으로 접어서 보여준다', async () => {
    const user = userEvent.setup();
    render(<ProposalCard proposal={proposal} onApplied={vi.fn()} onClose={vi.fn()} />);

    const toggle = screen.getByRole('button', { name: /지금은 그냥 둘 자료 1개/ });
    expect(screen.queryByText('scan_0412.pdf')).not.toBeInTheDocument();

    await user.click(toggle);
    expect(screen.getByText('scan_0412.pdf')).toBeInTheDocument();
  });

  it('켜진 묶음만 적용하고, 편집한 제목이 그대로 나간다', async () => {
    const user = userEvent.setup();
    render(<ProposalCard proposal={proposal} onApplied={vi.fn()} onClose={vi.fn()} />);

    const titleInput = screen.getByDisplayValue('운영체제');
    await user.clear(titleInput);
    await user.type(titleInput, '운영체제 2026');

    await user.click(screen.getByRole('button', { name: /1개 프로젝트 정리/ }));

    expect(materialStoreAPI.applyLinkProposal).toHaveBeenCalledWith([
      {
        action: 'CREATE_AND_LINK',
        title: '운영체제 2026',
        members: [
          { materialId: 101, materialType: 'SYLLABUS' },
          { materialId: 102, materialType: 'SYLLABUS' },
        ],
      },
    ]);
  });

  it('동명 경고에서 기존 프로젝트를 고르면 LINK_EXISTING으로 바뀌어 나간다', async () => {
    const user = userEvent.setup();
    render(<ProposalCard proposal={proposal} onApplied={vi.fn()} onClose={vi.fn()} />);

    // 근거가 약해 꺼진 채로 왔으므로 사용자가 직접 켠다.
    await user.click(screen.getAllByRole('checkbox')[1]);
    await user.click(screen.getByRole('radio', { name: /기존 “자료구조”에 붙이기/ }));
    await user.click(screen.getAllByRole('checkbox')[0]); // 첫 묶음은 이번엔 끈다

    await user.click(screen.getByRole('button', { name: /1개 프로젝트 정리/ }));

    expect(materialStoreAPI.applyLinkProposal).toHaveBeenCalledWith([
      {
        action: 'LINK_EXISTING',
        existingCourseId: 55,
        members: [{ materialId: 103, materialType: 'SYLLABUS' }],
      },
    ]);
  });

  it('근거가 약한 자료에는 실패 프레이밍 대신 확신도를 적는다', () => {
    render(<ProposalCard proposal={proposal} onApplied={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByText('파일명만 보고 고른 이름이에요')).toBeInTheDocument();
    expect(screen.queryByText(/실패|부족|미분류/)).not.toBeInTheDocument();
  });

  it('아무것도 켜지 않으면 적용 버튼이 비활성이다', async () => {
    const user = userEvent.setup();
    render(<ProposalCard proposal={proposal} onApplied={vi.fn()} onClose={vi.fn()} />);

    await user.click(screen.getAllByRole('checkbox')[0]);

    expect(screen.getByRole('button', { name: /0개 프로젝트 정리/ })).toBeDisabled();
  });
});
