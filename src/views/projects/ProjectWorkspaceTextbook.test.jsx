import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProjectWorkspace from './ProjectWorkspace.jsx';
import {
  courseAPI, courseNoteAPI, executionItemAPI, materialAPI, planAPI, topicAPI,
} from '../../api/api.js';

vi.mock('../../api/api.js', () => ({
  courseAPI: { get: vi.fn(), update: vi.fn(), archive: vi.fn() },
  courseNoteAPI: { list: vi.fn() },
  executionItemAPI: { getByCourse: vi.fn(), getByDateRange: vi.fn() },
  materialAPI: { upload: vi.fn(), listByCourse: vi.fn() },
  materialAnalysisAPI: { analyze: vi.fn(), dismiss: vi.fn(), listByMaterial: vi.fn() },
  materialStoreAPI: { list: vi.fn(), addLink: vi.fn(), removeLink: vi.fn(), updateLinkType: vi.fn() },
  topicAPI: { getTree: vi.fn() },
  planAPI: { findCoveringDate: vi.fn() },
}));

const BASE = { courseId: 6, title: '빅데이터분석', status: 'ACTIVE' };

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

/**
 * 교재 정보는 어느 책인지 사람이 판정하기 위한 값이다. 제목만으로는 알 수 없다 —
 * `자료구조`, `운영체제` 같은 제목은 수십 종이고 판이 다르면 목차도 다르다.
 *
 * 지금까지 저자·출판사·ISBN은 자료 분석 검토 화면에서 한 번 스쳐 지나가고 다시 볼 데가
 * 없었다. 정작 확인이 필요해지는 것은 몇 주 뒤 이 화면에서다.
 */
describe('프로젝트의 교재 정보', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    planAPI.findCoveringDate.mockResolvedValue([]);
    executionItemAPI.getByDateRange.mockResolvedValue([]);
    materialAPI.listByCourse.mockResolvedValue([]);
    topicAPI.getTree.mockResolvedValue([]);
    courseNoteAPI.list.mockResolvedValue([]);
    executionItemAPI.getByCourse.mockResolvedValue([]);
  });

  it('저자와 출판사를 제목과 함께 보여준다', async () => {
    courseAPI.get.mockResolvedValue({
      ...BASE,
      textbookTitle: '데이터 분석을 위한 전처리와 시각화 with 파이썬',
      textbookAuthor: '오경선, 양숙희, 장은실',
      textbookPublisher: '길벗',
    });
    renderWorkspace();

    const line = await screen.findByText(/데이터 분석을 위한 전처리와 시각화 with 파이썬/);
    expect(line).toHaveTextContent('오경선, 양숙희, 장은실');
    expect(line).toHaveTextContent('길벗');
  });

  it('ISBN이 있으면 함께 보여준다 — 같은 제목의 책을 가르는 확정 값이다', async () => {
    courseAPI.get.mockResolvedValue({
      ...BASE, textbookTitle: '자료구조', textbookIsbn: '9788956746425',
    });
    renderWorkspace();

    expect(await screen.findByText(/ISBN 9788956746425/)).toBeInTheDocument();
  });

  it('비어 있는 항목은 자리를 만들지 않는다', async () => {
    courseAPI.get.mockResolvedValue({
      ...BASE, textbookTitle: '자료구조', textbookAuthor: null,
      textbookPublisher: null, textbookIsbn: null,
    });
    renderWorkspace();

    const line = await screen.findByText(/교재 자료구조/);
    // `미확인`을 줄줄이 세워봐야 읽을 것만 늘어난다.
    expect(line).not.toHaveTextContent('미확인');
    expect(line).not.toHaveTextContent('ISBN');
    expect(line.textContent.trim()).toBe('교재 자료구조');
  });

  it('교재가 없으면 줄 자체가 없다', async () => {
    courseAPI.get.mockResolvedValue({ ...BASE, textbookTitle: null });
    renderWorkspace();

    await screen.findByRole('heading', { name: '빅데이터분석' });
    expect(screen.queryByText(/교재/)).not.toBeInTheDocument();
  });
});

/**
 * 잘못 뽑힌 값을 고칠 수 있어야 확인이라는 행위가 성립한다. 지금까지 교재 정보를 채우는
 * 경로는 자료 분석 적용 하나뿐이었고, 사용자가 손댈 방법이 없었다.
 */
describe('교재 정보 수정', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    planAPI.findCoveringDate.mockResolvedValue([]);
    executionItemAPI.getByDateRange.mockResolvedValue([]);
    materialAPI.listByCourse.mockResolvedValue([]);
    topicAPI.getTree.mockResolvedValue([]);
    courseNoteAPI.list.mockResolvedValue([]);
    executionItemAPI.getByCourse.mockResolvedValue([]);
    courseAPI.update.mockResolvedValue({});
    courseAPI.get.mockResolvedValue({
      ...BASE,
      textbookTitle: '전처리와 시각화',
      textbookAuthor: '오경선',
      textbookPublisher: '길벗',
      textbookIsbn: null,
    });
  });

  const openEdit = async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(await screen.findByRole('button', { name: /이름.*분류 수정|이름\/분류 수정/ }));
    return user;
  };

  it('지금 저장된 교재 값이 폼에 채워져 있다', async () => {
    await openEdit();

    expect(screen.getByLabelText('교재명')).toHaveValue('전처리와 시각화');
    expect(screen.getByLabelText('교재 저자')).toHaveValue('오경선');
    expect(screen.getByLabelText('교재 출판사')).toHaveValue('길벗');
    expect(screen.getByLabelText('교재 ISBN')).toHaveValue('');
  });

  it('저자를 바로잡아 저장하면 그대로 나간다', async () => {
    const user = await openEdit();

    const author = screen.getByLabelText('교재 저자');
    await user.clear(author);
    await user.type(author, '오경선, 양숙희, 장은실');
    await user.click(screen.getByRole('button', { name: '저장' }));

    expect(courseAPI.update).toHaveBeenCalledWith(6, expect.objectContaining({
      textbookTitle: '전처리와 시각화',
      textbookAuthor: '오경선, 양숙희, 장은실',
      textbookPublisher: '길벗',
    }));
  });

  it('비우면 null로 나간다 — 사람이 지운 것은 "모른다"는 뜻이다', async () => {
    const user = await openEdit();

    await user.clear(screen.getByLabelText('교재 출판사'));
    await user.click(screen.getByRole('button', { name: '저장' }));

    expect(courseAPI.update).toHaveBeenCalledWith(6, expect.objectContaining({
      textbookPublisher: null,
    }));
  });
});
