import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
    proposeLinks: vi.fn(),
    applyLinkProposal: vi.fn(),
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

/**
 * `프로젝트로 정리하기`는 세 탭 모두에 있어야 한다 — 방금 자료를 올린 사람이 이 버튼을
 * 찾으려고 필터를 먼저 바꿔야 한다는 것을 알 이유가 없다.
 */
describe('프로젝트로 정리하기 버튼', () => {
  const UNLINKED = { ...MATERIAL, materialId: 7, originalFilename: '네트워크.pdf', links: [] };

  beforeEach(() => {
    vi.clearAllMocks();
    materialStoreAPI.get.mockResolvedValue(DETAIL);
  });

  const tidyButton = () => screen.queryByRole('button', { name: /프로젝트로 정리하기/ });

  it('미연결 자료가 있으면 전체 탭에서도 보인다', async () => {
    materialStoreAPI.list.mockResolvedValue([MATERIAL, UNLINKED]);
    render(<MaterialsView projects={[]} onProjectsChanged={vi.fn()} />);

    expect(await screen.findByText('네트워크.pdf')).toBeInTheDocument();
    expect(tidyButton()).toBeInTheDocument();
  });

  it('최근 추가 탭으로 옮겨도 그대로 있다', async () => {
    const user = userEvent.setup();
    materialStoreAPI.list.mockResolvedValue([MATERIAL, UNLINKED]);
    render(<MaterialsView projects={[]} onProjectsChanged={vi.fn()} />);

    await user.click(await screen.findByRole('tab', { name: '최근 추가' }));
    expect(tidyButton()).toBeInTheDocument();
  });

  it('미연결 자료가 하나도 없으면 숨긴다 — 눌러도 정리할 게 없다', async () => {
    materialStoreAPI.list.mockResolvedValue([MATERIAL]);
    render(<MaterialsView projects={[]} onProjectsChanged={vi.fn()} />);

    expect(await screen.findByText('자료구조.pdf')).toBeInTheDocument();
    expect(tidyButton()).not.toBeInTheDocument();
  });
});

/**
 * 목록에서 바로 연결하기. 행 전체가 <button>이던 것을 갈랐으므로 클릭이 새지 않는지가
 * 특히 중요하다 — 연결 버튼을 눌렀는데 상세로 넘어가면 두 조작이 겹친 것이다.
 */
describe('자료 목록에서 바로 프로젝트 연결', () => {
  const LINKED = MATERIAL;
  const UNLINKED = {
    ...MATERIAL, materialId: 7, originalFilename: '네트워크.pdf', links: [],
  };
  const PROJECTS = [
    { courseId: 6, title: '자료구조' },
    { courseId: 9, title: '네트워크' },
  ];

  let onProjectsChanged;

  beforeEach(() => {
    vi.clearAllMocks();
    onProjectsChanged = vi.fn();
    materialStoreAPI.list.mockResolvedValue([LINKED, UNLINKED]);
    materialStoreAPI.get.mockResolvedValue(DETAIL);
    materialStoreAPI.addLink.mockResolvedValue({});
  });

  const renderList = async (projects = PROJECTS) => {
    const user = userEvent.setup();
    render(<MaterialsView projects={projects} onProjectsChanged={onProjectsChanged} />);
    await screen.findByText('네트워크.pdf');
    return user;
  };

  const linkButtons = () => screen.getAllByRole('button', { name: /프로젝트 연결/ });

  it('미연결 자료 행에 프로젝트 연결 버튼이 있다', async () => {
    await renderList();
    expect(linkButtons()).toHaveLength(2);
  });

  it('연결된 자료 행에는 프로젝트 이름과 연결 버튼이 함께 있다', async () => {
    await renderList();

    expect(screen.getByText('연결')).toBeInTheDocument();
    expect(screen.getByText('자료구조')).toBeInTheDocument();
    expect(linkButtons()[0]).toBeEnabled();
  });

  it('연결 안 된 자료 회색 문구는 행에서 사라졌다 — 필터 라벨은 남는다', async () => {
    await renderList();

    // 탭 라벨은 그대로 있고, 행 안의 상태 문구만 없다.
    expect(screen.getByRole('tab', { name: '연결 안 된 자료' })).toBeInTheDocument();
    expect(screen.queryByText((_, el) =>
        el?.className === 'view-sub-dim' && el?.textContent === '연결 안 된 자료')).toBeNull();
  });

  it('버튼을 누르면 그 행 아래에 폼이 열리고 aria-expanded가 켜진다', async () => {
    const user = await renderList();

    const button = linkButtons()[1];
    expect(button).toHaveAttribute('aria-expanded', 'false');

    await user.click(button);

    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('연결할 프로젝트')).toBeInTheDocument();
  });

  it('다른 행의 버튼을 누르면 이전 폼이 닫히고 새 폼만 열린다', async () => {
    const user = await renderList();

    await user.click(linkButtons()[1]);
    await user.click(linkButtons()[0]);

    expect(screen.getAllByLabelText('연결할 프로젝트')).toHaveLength(1);
    expect(linkButtons()[0]).toHaveAttribute('aria-expanded', 'true');
    expect(linkButtons()[1]).toHaveAttribute('aria-expanded', 'false');
  });

  it('같은 버튼을 다시 누르면 닫힌다', async () => {
    const user = await renderList();

    await user.click(linkButtons()[1]);
    await user.click(linkButtons()[1]);

    expect(screen.queryByLabelText('연결할 프로젝트')).not.toBeInTheDocument();
  });

  it('이미 연결된 프로젝트는 고를 수 없다', async () => {
    const user = await renderList();

    // 첫 행(자료구조.pdf)은 이미 자료구조(6)에 연결돼 있다.
    await user.click(linkButtons()[0]);

    // 폼에는 select가 둘이다(프로젝트 / 자료 역할) — 프로젝트 쪽만 본다.
    const options = within(screen.getByLabelText('연결할 프로젝트'))
        .getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['네트워크']);
  });

  it('연결할 수 있는 프로젝트가 없으면 버튼이 비활성이다', async () => {
    await renderList([]);

    expect(linkButtons()[0]).toBeDisabled();
    expect(linkButtons()[0]).toHaveAttribute('title', '연결할 수 있는 프로젝트가 없어요');
  });

  it('연결에 성공하면 폼이 닫히고 목록과 사이드바가 갱신된다', async () => {
    const user = await renderList();

    await user.click(linkButtons()[1]);
    await user.selectOptions(screen.getByLabelText('연결할 프로젝트'), '9');
    await user.selectOptions(screen.getByLabelText('자료 역할'), 'SYLLABUS');
    await user.click(screen.getByRole('button', { name: '연결' }));

    expect(materialStoreAPI.addLink).toHaveBeenCalledWith(7, 9, 'SYLLABUS');
    expect(screen.queryByLabelText('연결할 프로젝트')).not.toBeInTheDocument();
    // 사이드바의 프로젝트별 자료 수가 바뀌므로 알려야 한다.
    expect(onProjectsChanged).toHaveBeenCalled();
    expect(materialStoreAPI.list).toHaveBeenCalledTimes(2);
  });

  it('연결에 실패하면 폼이 열린 채로 그 행에 이유가 뜬다', async () => {
    materialStoreAPI.addLink.mockRejectedValue(new Error('이미 이 프로젝트에 연결된 자료입니다'));
    const user = await renderList();

    await user.click(linkButtons()[1]);
    await user.click(screen.getByRole('button', { name: '연결' }));

    expect(await screen.findByText('이미 이 프로젝트에 연결된 자료입니다')).toBeInTheDocument();
    expect(screen.getByLabelText('연결할 프로젝트')).toBeInTheDocument();
  });

  it('연결 버튼 클릭은 상세로 새지 않는다 — 제목을 눌렀을 때만 상세로 간다', async () => {
    const user = await renderList();

    await user.click(linkButtons()[1]);
    expect(materialStoreAPI.get).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /자료구조\.pdf/ }));
    expect(materialStoreAPI.get).toHaveBeenCalledWith(4);
  });
});

/**
 * 삭제는 목록 행에서 한다. 상세에는 조작 버튼이 남지 않는다 — 같은 조작이 두 곳에 있으면
 * 어느 쪽이 정본인지 흐려진다.
 */
describe('자료 목록에서 바로 삭제', () => {
  const UNLINKED = {
    ...MATERIAL, materialId: 7, originalFilename: '네트워크.pdf', links: [],
  };
  const TWO_LINKS = {
    ...MATERIAL,
    materialId: 8,
    originalFilename: '공용.pdf',
    links: [
      { courseId: 6, courseTitle: '자료구조', materialType: 'SYLLABUS', linkedAt: '2026-08-16T14:30:30' },
      { courseId: 9, courseTitle: '네트워크', materialType: 'OTHER', linkedAt: '2026-08-17T14:30:30' },
    ],
  };
  const PROJECTS = [{ courseId: 6, title: '자료구조' }, { courseId: 9, title: '네트워크' }];

  let onProjectsChanged;

  beforeEach(() => {
    vi.clearAllMocks();
    onProjectsChanged = vi.fn();
    materialStoreAPI.list.mockResolvedValue([MATERIAL, UNLINKED]);
    materialStoreAPI.get.mockResolvedValue(DETAIL);
    materialStoreAPI.delete.mockResolvedValue(undefined);
  });

  const renderList = async () => {
    const user = userEvent.setup();
    render(<MaterialsView projects={PROJECTS} onProjectsChanged={onProjectsChanged} />);
    await screen.findByText('네트워크.pdf');
    return user;
  };

  const deleteButtons = () => screen.getAllByRole('button', { name: /^삭제$/ });

  it('모든 행에 삭제 버튼이 있다', async () => {
    await renderList();
    expect(deleteButtons()).toHaveLength(2);
  });

  it('삭제 버튼을 누르면 확인 모달이 뜬다 — 바로 지우지 않는다', async () => {
    const user = await renderList();

    await user.click(deleteButtons()[1]);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('이 자료를 삭제할까요?')).toBeInTheDocument();
    expect(materialStoreAPI.delete).not.toHaveBeenCalled();
  });

  it('모달이 어느 자료를 지우는지 말한다 — 행에서 떨어져 나왔으므로 필요하다', async () => {
    const user = await renderList();

    await user.click(deleteButtons()[1]);

    expect(within(screen.getByRole('dialog')).getByText('네트워크.pdf')).toBeInTheDocument();
  });

  it('열리자마자 포커스는 취소에 있다 — Enter로 지워버리지 않는다', async () => {
    const user = await renderList();

    await user.click(deleteButtons()[1]);

    expect(screen.getByRole('button', { name: '취소' })).toHaveFocus();
  });

  it('Esc로 닫으면 아무것도 지우지 않는다', async () => {
    const user = await renderList();

    await user.click(deleteButtons()[1]);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(materialStoreAPI.delete).not.toHaveBeenCalled();
  });

  it('몇 곳에서 참고할 수 없게 되는지, 무엇이 남는지 한 줄로 말한다', async () => {
    materialStoreAPI.list.mockResolvedValue([TWO_LINKS]);
    const user = userEvent.setup();
    render(<MaterialsView projects={PROJECTS} onProjectsChanged={onProjectsChanged} />);
    await screen.findByText('공용.pdf');

    await user.click(deleteButtons()[0]);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('2개 프로젝트에서 더 이상 참고할 수 없어요.');
    // 짧게 만들되 남는 것에 대한 약속은 그대로 남긴다.
    expect(dialog).toHaveTextContent('이미 적용한 학습 내용은 그대로 남아요.');
  });

  it('확인하면 지우고 목록과 사이드바를 갱신한다', async () => {
    const user = await renderList();

    await user.click(deleteButtons()[1]);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' }));

    expect(materialStoreAPI.delete).toHaveBeenCalledWith(7);
    expect(onProjectsChanged).toHaveBeenCalled();
    expect(materialStoreAPI.list).toHaveBeenCalledTimes(2);
  });

  it('취소하면 아무것도 지우지 않고 확인 문구가 닫힌다', async () => {
    const user = await renderList();

    await user.click(deleteButtons()[1]);
    await user.click(screen.getByRole('button', { name: '취소' }));

    expect(materialStoreAPI.delete).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // 포커스는 그 행의 삭제 버튼으로 돌아온다.
    expect(deleteButtons()[1]).toHaveFocus();
  });

  it('실패하면 알림이 열린 채로 이유가 뜬다', async () => {
    materialStoreAPI.delete.mockRejectedValue(new Error('삭제하지 못했습니다'));
    const user = await renderList();

    await user.click(deleteButtons()[1]);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' }));

    expect(await screen.findByText('삭제하지 못했습니다')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('삭제 모달을 열면 열려 있던 연결 폼이 닫힌다', async () => {
    const user = await renderList();

    await user.click(screen.getAllByRole('button', { name: /프로젝트 연결/ })[1]);
    expect(screen.getByLabelText('연결할 프로젝트')).toBeInTheDocument();

    await user.click(deleteButtons()[1]);

    expect(screen.queryByLabelText('연결할 프로젝트')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('상세에는 연결·삭제 버튼이 남지 않는다', async () => {
    const user = await renderList();

    await user.click(screen.getByRole('button', { name: /자료구조\.pdf/ }));
    await screen.findByRole('heading', { name: '자료구조.pdf' });

    expect(screen.queryByRole('button', { name: /프로젝트 연결/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /자료 삭제/ })).not.toBeInTheDocument();
    // 연결 해제와 역할 바꾸기는 상세에 그대로 남는다.
    expect(screen.getByLabelText('자료구조에서의 자료 역할')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /연결 해제/ })).toBeInTheDocument();
  });
});
