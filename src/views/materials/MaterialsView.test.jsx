import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MaterialsView from './MaterialsView.jsx';
import { PENDING_DELETE_WINDOW_MS } from './usePendingDelete.js';
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
 * 자료 삭제는 실행 조각과 방향이 반대다. 되돌릴 수가 없어서(링크 물리 삭제 + 본문 제거 +
 * 원본 파일 삭제) 아예 늦게 지운다 — 되돌리기는 복구가 아니라 아직 보내지 않은 요청의 취소다.
 */
describe('자료 목록에서 바로 삭제', () => {
  const UNLINKED = {
    ...MATERIAL, materialId: 7, originalFilename: '네트워크.pdf', links: [],
  };
  const PROJECTS = [{ courseId: 6, title: '자료구조' }, { courseId: 9, title: '네트워크' }];

  let onProjectsChanged;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    onProjectsChanged = vi.fn();
    materialStoreAPI.list.mockResolvedValue([MATERIAL, UNLINKED]);
    materialStoreAPI.get.mockResolvedValue(DETAIL);
    materialStoreAPI.delete.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderList = async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<MaterialsView projects={PROJECTS} onProjectsChanged={onProjectsChanged} />);
    await screen.findByText('네트워크.pdf');
    return user;
  };

  const deleteButtons = () => screen.getAllByRole('button', { name: /^삭제$/ });

  const pressCtrlZ = () => document.body.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'z', ctrlKey: true, bubbles: true, cancelable: true,
  }));

  it('모든 행에 삭제 버튼이 있다', async () => {
    await renderList();
    expect(deleteButtons()).toHaveLength(2);
  });

  it('누르면 확인 없이 목록에서 사라지고 되돌리기 안내가 뜬다', async () => {
    const user = await renderList();

    await user.click(deleteButtons()[1]);

    // 안내에도 파일명이 있으므로 "목록에서" 사라졌는지를 본다.
    expect(screen.queryByRole('button', { name: /네트워크\.pdf/ })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('네트워크.pdf');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('되돌릴 수 있는 동안에는 서버를 아직 부르지 않는다 — 되돌리기가 복구가 아니라 취소다', async () => {
    const user = await renderList();

    await user.click(deleteButtons()[1]);

    expect(materialStoreAPI.delete).not.toHaveBeenCalled();
  });

  it('되돌리기를 누르면 자료가 목록으로 돌아오고 끝내 지워지지 않는다', async () => {
    const user = await renderList();

    await user.click(deleteButtons()[1]);
    await user.click(screen.getByRole('button', { name: /되돌리기/ }));

    expect(await screen.findByText('네트워크.pdf')).toBeInTheDocument();

    await act(async () => { vi.advanceTimersByTime(PENDING_DELETE_WINDOW_MS + 100); });
    expect(materialStoreAPI.delete).not.toHaveBeenCalled();
  });

  it('Ctrl+Z도 같은 일을 한다', async () => {
    const user = await renderList();

    await user.click(deleteButtons()[1]);
    await act(async () => { pressCtrlZ(); });

    expect(await screen.findByText('네트워크.pdf')).toBeInTheDocument();
  });

  it('창이 닫히면 그때 실제로 지운다', async () => {
    const user = await renderList();

    await user.click(deleteButtons()[1]);
    await act(async () => { vi.advanceTimersByTime(PENDING_DELETE_WINDOW_MS + 100); });

    expect(materialStoreAPI.delete).toHaveBeenCalledWith(7);
    // 프로젝트별 자료 수가 바뀌므로 사이드바에도 알린다.
    await waitFor(() => expect(onProjectsChanged).toHaveBeenCalled());
  });

  it('연달아 지워도 앞의 것을 서둘러 보내지 않는다 — 둘 다 되돌릴 수 있다', async () => {
    const user = await renderList();

    await user.click(deleteButtons()[1]);
    await user.click(deleteButtons()[0]);

    expect(materialStoreAPI.delete).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('자료구조.pdf 외 1개 지웠어요');
  });

  it('Ctrl+Z를 여러 번 누르면 마지막에 지운 것부터 하나씩 돌아온다', async () => {
    const user = await renderList();

    await user.click(deleteButtons()[1]);  // 네트워크.pdf
    await user.click(deleteButtons()[0]);  // 자료구조.pdf

    await act(async () => { pressCtrlZ(); });
    // 나중에 지운 것이 먼저 돌아온다.
    expect(await screen.findByRole('button', { name: /자료구조\.pdf/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /네트워크\.pdf/ })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('네트워크.pdf 지웠어요');

    await act(async () => { pressCtrlZ(); });
    expect(await screen.findByRole('button', { name: /네트워크\.pdf/ })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    await act(async () => { vi.advanceTimersByTime(PENDING_DELETE_WINDOW_MS + 100); });
    expect(materialStoreAPI.delete).not.toHaveBeenCalled();
  });

  it('되돌리지 않은 것들은 각자 자기 창이 닫힐 때 지워진다', async () => {
    const user = await renderList();

    await user.click(deleteButtons()[1]);
    await user.click(deleteButtons()[0]);
    await act(async () => { vi.advanceTimersByTime(PENDING_DELETE_WINDOW_MS + 100); });

    expect(materialStoreAPI.delete).toHaveBeenCalledWith(7);
    expect(materialStoreAPI.delete).toHaveBeenCalledWith(4);
  });

  it('지우지 못하면 목록을 다시 읽고 이유를 말한다', async () => {
    materialStoreAPI.delete.mockRejectedValue(new Error('삭제하지 못했습니다'));
    const user = await renderList();

    await user.click(deleteButtons()[1]);
    await act(async () => { vi.advanceTimersByTime(PENDING_DELETE_WINDOW_MS + 100); });

    expect(await screen.findByText('삭제하지 못했습니다')).toBeInTheDocument();
    expect(materialStoreAPI.list).toHaveBeenCalledTimes(2);
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

/**
 * 업로드가 끝났는데 화면이 안 바뀌는 것처럼 보이던 문제.
 *
 * 자동 연결 제안은 모델 호출이라 20~40초가 걸린다. 그걸 기다린 뒤에 업로드 대기열을
 * 비우게 해두면, 파일은 다 올라갔는데 대기열이 그대로 남아 "멈춘 것"처럼 보인다.
 */
describe('업로드 직후 대기열 정리', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    materialStoreAPI.list.mockResolvedValue([]);
    materialStoreAPI.get.mockResolvedValue(DETAIL);
    materialStoreAPI.upload.mockImplementation((file) => Promise.resolve({
      materialId: file.name.length,
      extractionStatus: 'SUCCESS',
    }));
  });

  const pdf = (name) => new File(['%PDF-1.4'], name, { type: 'application/pdf' });

  it('자동 제안을 기다리지 않고 대기열을 비운다', async () => {
    const user = userEvent.setup();
    // 모델 답이 오지 않는 상태를 만든다 — 예전에는 여기서 대기열이 계속 남아 있었다.
    materialStoreAPI.proposeLinks.mockReturnValue(new Promise(() => {}));

    const { container } = render(<MaterialsView projects={[]} onProjectsChanged={vi.fn()} />);
    const input = container.querySelector('input[type="file"]');

    await act(async () => {
      fireEvent.change(input, { target: { files: [pdf('가.pdf'), pdf('나.pdf')] } });
    });
    await user.click(screen.getByRole('button', { name: /2개 올리기/ }));

    await waitFor(() => expect(materialStoreAPI.upload).toHaveBeenCalledTimes(2));
    // 대기열이 비워졌다 = 올린 파일 줄이 남아 있지 않다.
    await waitFor(() => expect(screen.queryByText('가.pdf')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /개 올리기/ })).not.toBeInTheDocument();

    // 제안은 여전히 도는 중이다 — 기다리지 않았을 뿐 부르지 않은 것은 아니다.
    expect(materialStoreAPI.proposeLinks).toHaveBeenCalled();
  });

  it('목록 새로고침까지는 기다린다 — 파일이 위아래 어디에도 없는 순간을 만들지 않는다', async () => {
    const user = userEvent.setup();
    materialStoreAPI.proposeLinks.mockReturnValue(new Promise(() => {}));

    const { container } = render(<MaterialsView projects={[]} onProjectsChanged={vi.fn()} />);
    await waitFor(() => expect(materialStoreAPI.list).toHaveBeenCalledTimes(1));

    const input = container.querySelector('input[type="file"]');
    await act(async () => {
      fireEvent.change(input, { target: { files: [pdf('가.pdf'), pdf('나.pdf')] } });
    });
    await user.click(screen.getByRole('button', { name: /2개 올리기/ }));

    await waitFor(() => expect(materialStoreAPI.list).toHaveBeenCalledTimes(2));
  });
});
