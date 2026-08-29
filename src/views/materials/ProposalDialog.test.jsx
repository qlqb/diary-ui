import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProposalDialog from './ProposalDialog.jsx';
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

describe('ProposalDialog - 자료 연결 제안 검토', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    materialStoreAPI.applyLinkProposal.mockResolvedValue({ createdProjects: [], linkedMaterialCount: 0 });
  });

  it('체크 초기값은 서버의 defaultSelected를 그대로 쓴다 — 프론트가 재계산하지 않는다', () => {
    render(<ProposalDialog proposal={proposal} onApplied={vi.fn()} onClose={vi.fn()} />);

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2); // LEAVE 묶음에는 체크박스가 없다
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
    expect(screen.getByRole('button', { name: /선택 항목 연결하기 \(1\)/ })).toBeEnabled();
  });

  it('판단하지 못한 자료를 숨기지 않는다 — LEAVE 묶음으로 접어서 보여준다', async () => {
    const user = userEvent.setup();
    render(<ProposalDialog proposal={proposal} onApplied={vi.fn()} onClose={vi.fn()} />);

    const toggle = screen.getByRole('button', { name: /지금은 그냥 둘 자료 1개/ });
    expect(screen.queryByText('scan_0412.pdf')).not.toBeInTheDocument();

    await user.click(toggle);
    expect(screen.getByText('scan_0412.pdf')).toBeInTheDocument();
  });

  it('켜진 묶음만 적용하고, 편집한 제목이 그대로 나간다', async () => {
    const user = userEvent.setup();
    render(<ProposalDialog proposal={proposal} onApplied={vi.fn()} onClose={vi.fn()} />);

    const titleInput = screen.getByDisplayValue('운영체제');
    await user.clear(titleInput);
    await user.type(titleInput, '운영체제 2026');

    await user.click(screen.getByRole('button', { name: /선택 항목 연결하기 \(1\)/ }));

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
    render(<ProposalDialog proposal={proposal} onApplied={vi.fn()} onClose={vi.fn()} />);

    // 근거가 약해 꺼진 채로 왔으므로 사용자가 직접 켠다.
    await user.click(screen.getAllByRole('checkbox')[1]);
    await user.click(screen.getByRole('radio', { name: /기존 “자료구조”에 붙이기/ }));
    await user.click(screen.getAllByRole('checkbox')[0]); // 첫 묶음은 이번엔 끈다

    await user.click(screen.getByRole('button', { name: /선택 항목 연결하기 \(1\)/ }));

    expect(materialStoreAPI.applyLinkProposal).toHaveBeenCalledWith([
      {
        action: 'LINK_EXISTING',
        existingCourseId: 55,
        members: [{ materialId: 103, materialType: 'SYLLABUS' }],
      },
    ]);
  });

  it('근거가 약한 자료에는 실패 프레이밍 대신 확신도를 적는다', () => {
    render(<ProposalDialog proposal={proposal} onApplied={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByText('파일명만 보고 고른 이름이에요')).toBeInTheDocument();
    expect(screen.queryByText(/실패|부족|미분류/)).not.toBeInTheDocument();
  });

  it('아무것도 켜지 않으면 적용 버튼이 비활성이다', async () => {
    const user = userEvent.setup();
    render(<ProposalDialog proposal={proposal} onApplied={vi.fn()} onClose={vi.fn()} />);

    await user.click(screen.getAllByRole('checkbox')[0]);

    expect(screen.getByRole('button', { name: /선택 항목 연결하기 \(0\)/ })).toBeDisabled();
  });
});

describe('ProposalDialog - 따로 나누기', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    materialStoreAPI.applyLinkProposal.mockResolvedValue({ createdProjects: [], linkedMaterialCount: 0 });
  });

  const splittable = {
    status: 'GENERATED',
    remainingMaterialIds: [],
    groups: [
      {
        groupId: 'g1',
        action: 'CREATE_AND_LINK',
        existingCourseId: null,
        proposedTitle: '웹응용소프트웨어공학과 과목',
        reason: '모두 같은 학과 소속이에요',
        defaultSelected: true,
        notices: [],
        matchingProjects: [],
        members: [
          verifiedMember(201, '스마트앱프로젝트.pdf'),
          verifiedMember(202, '웹서버프로그래밍.pdf'),
          verifiedMember(203, '빅데이터분석.pdf'),
        ],
      },
    ],
  };

  const single = (action, members, extra = {}) => ({
    status: 'GENERATED',
    remainingMaterialIds: [],
    groups: [{
      groupId: 'g1',
      action,
      existingCourseId: action === 'LINK_EXISTING' ? 55 : null,
      existingCourseTitle: action === 'LINK_EXISTING' ? '운영체제' : null,
      proposedTitle: action === 'CREATE_AND_LINK' ? '운영체제' : null,
      reason: '',
      defaultSelected: false,
      notices: [],
      matchingProjects: [],
      members,
      ...extra,
    }],
  });

  const splitButton = () => screen.queryByRole('button', { name: /따로 나누기/ });

  it('멤버가 둘 이상인 CREATE_AND_LINK에만 따로 나누기가 보인다', () => {
    render(<ProposalDialog proposal={splittable} onApplied={vi.fn()} onClose={vi.fn()} />);
    expect(splitButton()).toBeInTheDocument();
  });

  it('멤버가 하나면 따로 나누기가 없다 — 쪼갤 것이 없다', () => {
    render(<ProposalDialog proposal={single('CREATE_AND_LINK', [verifiedMember(201, 'a.pdf')])}
                         onApplied={vi.fn()} onClose={vi.fn()} />);
    expect(splitButton()).not.toBeInTheDocument();
  });

  it('LINK_EXISTING은 멤버가 여럿이어도 따로 나누기가 없다 — 쪼개도 같은 곳으로 간다', () => {
    render(<ProposalDialog proposal={single('LINK_EXISTING',
        [verifiedMember(201, 'a.pdf'), verifiedMember(202, 'b.pdf')])}
                         onApplied={vi.fn()} onClose={vi.fn()} />);
    expect(splitButton()).not.toBeInTheDocument();
  });

  it('LEAVE는 멤버가 여럿이어도 따로 나누기가 없다', () => {
    render(<ProposalDialog proposal={single('LEAVE',
        [verifiedMember(201, 'a.pdf'), verifiedMember(202, 'b.pdf')])}
                         onApplied={vi.fn()} onClose={vi.fn()} />);
    expect(splitButton()).not.toBeInTheDocument();
  });

  it('쪼개면 멤버 수만큼의 묶음이 되고, 제목은 파일명에서 오고, 전부 꺼진 채로 시작한다', async () => {
    const user = userEvent.setup();
    render(<ProposalDialog proposal={splittable} onApplied={vi.fn()} onClose={vi.fn()} />);

    await user.click(splitButton());

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(3);
    expect(checkboxes.every((box) => !box.checked)).toBe(true);
    expect(screen.getByDisplayValue('스마트앱프로젝트')).toBeInTheDocument();
    expect(screen.getByDisplayValue('웹서버프로그래밍')).toBeInTheDocument();
    expect(screen.getByDisplayValue('빅데이터분석')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /선택 항목 연결하기 \(0\)/ })).toBeDisabled();
  });

  it('쪼개기 전에 바꾼 자료 역할이 그대로 따라간다', async () => {
    const user = userEvent.setup();
    render(<ProposalDialog proposal={splittable} onApplied={vi.fn()} onClose={vi.fn()} />);

    await user.selectOptions(
        screen.getByLabelText('스마트앱프로젝트.pdf의 자료 역할'), 'TEXTBOOK_TOC');
    await user.click(splitButton());
    await user.click(screen.getAllByRole('checkbox')[0]);
    await user.click(screen.getByRole('button', { name: /선택 항목 연결하기 \(1\)/ }));

    expect(materialStoreAPI.applyLinkProposal).toHaveBeenCalledWith([
      {
        action: 'CREATE_AND_LINK',
        title: '스마트앱프로젝트',
        members: [{ materialId: 201, materialType: 'TEXTBOOK_TOC' }],
      },
    ]);
  });

  it('되돌리기를 누르면 원래 묶음이 돌아온다 — 모델을 다시 부르지 않는다', async () => {
    const user = userEvent.setup();
    render(<ProposalDialog proposal={splittable} onApplied={vi.fn()} onClose={vi.fn()} />);

    await user.click(splitButton());
    expect(screen.queryByDisplayValue('웹응용소프트웨어공학과 과목')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /되돌리기/ }));

    expect(screen.getByDisplayValue('웹응용소프트웨어공학과 과목')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(splitButton()).toBeInTheDocument();
  });

  it('켜진 묶음 둘이 같은 이름이면 안내만 하고 적용은 막지 않는다', async () => {
    const user = userEvent.setup();
    render(<ProposalDialog proposal={splittable} onApplied={vi.fn()} onClose={vi.fn()} />);

    await user.click(splitButton());
    const [first, second] = screen.getAllByRole('checkbox');
    await user.click(first);
    await user.click(second);

    const secondTitle = screen.getByDisplayValue('웹서버프로그래밍');
    await user.clear(secondTitle);
    await user.type(secondTitle, '스마트앱프로젝트');

    expect(screen.getByText('같은 이름의 프로젝트가 두 개 만들어져요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /선택 항목 연결하기 \(2\)/ })).toBeEnabled();
  });
});

/**
 * 다이얼로그 껍데기. 이건 이 기능 하나를 위한 비용이 아니다 — 검토 카드는 앞으로 더
 * 생기고(v6 §11), 그때 같은 껍데기를 쓴다.
 */
describe('ProposalDialog - 다이얼로그 동작', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    materialStoreAPI.applyLinkProposal.mockResolvedValue({ createdProjects: [], linkedMaterialCount: 0 });
  });

  it('열리면 제목에 포커스를 준다 — 첫 체크박스에 주지 않는다', () => {
    render(<ProposalDialog proposal={proposal} onApplied={vi.fn()} onClose={vi.fn()} />);

    // 체크박스에 포커스가 있으면 스페이스를 잘못 눌러 선택이 바뀐다.
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-labelledby', 'proposal-dialog-title');
    expect(document.getElementById('proposal-dialog-title')).toHaveFocus();
  });

  it('Esc로 닫는다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ProposalDialog proposal={proposal} onApplied={vi.fn()} onClose={onClose} />);

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });

  it('입력을 편집하다 Esc를 누르면 그 편집만 빠져나오고 다이얼로그는 열린 채다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ProposalDialog proposal={proposal} onApplied={vi.fn()} onClose={onClose} />);

    const titleInput = screen.getByDisplayValue('운영체제');
    await user.click(titleInput);
    await user.keyboard('{Escape}');

    // 제목을 고치다 Esc를 눌렀는데 작업 전체가 닫히면 그때까지 고른 것이 통째로 날아간다.
    expect(onClose).not.toHaveBeenCalled();
    expect(titleInput).not.toHaveFocus();
  });

  it('오버레이를 눌러도 닫히지 않는다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(
        <ProposalDialog proposal={proposal} onApplied={vi.fn()} onClose={onClose} />);

    await user.click(container.querySelector('.proposal-dialog-overlay'));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('열리면 body 스크롤을 잠그고 닫으면 되돌린다', () => {
    const { unmount } = render(
        <ProposalDialog proposal={proposal} onApplied={vi.fn()} onClose={vi.fn()} />);

    expect(document.body.style.overflow).toBe('hidden');

    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('적용에 실패해도 스크롤 잠금이 남지 않는다', async () => {
    const user = userEvent.setup();
    materialStoreAPI.applyLinkProposal.mockRejectedValue(new Error('적용하지 못했어요.'));
    const { unmount } = render(
        <ProposalDialog proposal={proposal} onApplied={vi.fn()} onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /선택 항목 연결하기 \(1\)/ }));
    expect(await screen.findByText('적용하지 못했어요.')).toBeInTheDocument();

    // 실패하면 다이얼로그가 열린 채로 남는다 — 잠금 해제를 cleanup에 두는 이유다.
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });
});
