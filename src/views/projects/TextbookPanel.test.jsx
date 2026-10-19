import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TextbookPanel from './TextbookPanel.jsx';
import { courseAPI, textbookAPI } from '../../api/api.js';

vi.mock('../../api/api.js', () => ({
  textbookAPI: {
    get: vi.fn(), apply: vi.fn(), applyClue: vi.fn(), choose: vi.fn(), retry: vi.fn(), link: vi.fn(),
    setEnabled: vi.fn(), linkToc: vi.fn(),
  },
  courseAPI: { update: vi.fn() },
}));

/**
 * 교재 구역이 약속하는 것:
 *  - 자료·웹에서 찾은 값은 후보다. 고른 것만 바뀌고, 바꾸는 요청에는 화면이 본 교재 판(expectedVersion)을 함께 보낸다.
 *  - 강의계획서의 교재와 지금 쓰는 교재를 따로 보인다.
 *  - 웹 조회 상태(찾는 중·판 확인 필요·못 찾음…)를 글자로 보이고, 찾는 동안 서버를 다시 본다. 끝나면 알린다.
 *  - 목차가 없으면 없다고 말하고, 계획·학습은 그대로라고 말한다.
 */
const FOUND = {
  courseId: 3,
  current: { title: 'C로 배우는 쉬운 자료구조', author: null, publisher: null, isbn: null, edition: '개정 3판', source: 'USER', version: 4 },
  candidates: [{
    materialId: 31, filename: '자료구조_앞부분.pdf', materialType: 'TEXTBOOK_TOC',
    fields: [
      { field: 'isbn', value: '9791156645672', unit: 2, quote: 'ISBN 979-11-5664-567-2 93000', current: null, same: false },
      { field: 'edition', value: '개정 4판', unit: 1, quote: '개정 4판', current: '개정 3판', same: false },
    ],
  }],
  toc: { status: 'FOUND', materialId: 31, filename: '자료구조_앞부분.pdf', entryCount: 10, fromUnit: 3, toUnit: 4,
    kind: 'MATERIAL', label: '「자료구조_앞부분.pdf」 목차',
    entries: [{ level: 1, number: 'CHAPTER 01', title: '자료구조와 알고리즘', page: 13, unit: 3 }] },
  state: 'TOC_FOUND',
  nextAction: '목차로 학습 구조의 첫 골격을 만들 수 있어요.',
  topicCount: 0,
  pending: 0,
  syllabusClues: [],
  lookup: null,
  unlinkedTocs: [],
  webLookupEnabled: true,
};

const SYLLABUS_ONLY = {
  ...FOUND,
  current: { title: null, author: null, publisher: null, isbn: null, edition: null, source: null, version: 0 },
  candidates: [],
  toc: { status: 'NOT_FOUND', entryCount: 0, entries: [] },
  state: 'TITLE_ONLY',
  syllabusClues: [{ materialId: 77, filename: '강의계획서.pdf', role: 'MAIN', title: 'NEW English Conversation Arts 1',
    author: 'Michael Putlack, 이현호', publisher: '형설출판사', unit: 1, quote: '주교재 …', source: 'RULE', sameAsCurrent: false }],
};

const EDITION_NEW = { key: '9788947288132', isbn13: '9788947288132', title: 'New English Conversation Arts 1',
  publisher: '형설출판사', publishedDate: '2026-01-30', bestRevisionId: 501, site: 'yes24',
  url: 'https://www.yes24.com/product/goods/175899340', tocCoverage: 'PAGE_FULL', tocEntryCount: 12,
  revisionIds: [501], sameTocAs: ['9788947281980'] };
const EDITION_OLD = { ...EDITION_NEW, key: '9788947281980', isbn13: '9788947281980', publishedDate: '2017-08-31',
  bestRevisionId: 502, url: 'https://www.yes24.com/product/goods/89873002', revisionIds: [502], sameTocAs: ['9788947288132'] };

const lookup = (status, extra = {}) => ({
  lookupId: 9, status, clueOrigin: 'SYLLABUS',
  query: { title: 'NEW English Conversation Arts 1', author: 'Michael Putlack, 이현호', publisher: '형설출판사' },
  editions: [], candidates: [], failures: [], clueOptions: [], note: null, ...extra,
});

beforeEach(() => vi.clearAllMocks());

describe('교재 구역', () => {
  it('빈 칸만 기본으로 고르고, 지금 값과 다른 칸은 두 값을 보여 준 채 고르지 않는다', async () => {
    textbookAPI.get.mockResolvedValue(FOUND);
    render(<TextbookPanel courseId={3} />);

    const isbn = await screen.findByRole('checkbox', { name: /ISBN 9791156645672/ });
    const edition = screen.getByRole('checkbox', { name: /판 개정 4판/ });
    expect(isbn).toBeChecked();
    expect(edition).not.toBeChecked();
    expect(screen.getByText(/지금 값 「개정 3판」과 달라요/)).toBeInTheDocument();
    expect(screen.getByText(/p\.2: “ISBN 979-11-5664-567-2 93000”/)).toBeInTheDocument();
    expect(screen.getByText(/「자료구조_앞부분\.pdf」 목차 · 항목 10개/)).toBeInTheDocument();
  });

  it('적용은 고른 칸과 화면이 본 지금 값·교재 판을 함께 보낸다', async () => {
    textbookAPI.get.mockResolvedValue(FOUND);
    textbookAPI.apply.mockResolvedValue({ ...FOUND, candidates: [] });
    render(<TextbookPanel courseId={3} />);
    await userEvent.click(await screen.findByRole('checkbox', { name: /판 개정 4판/ }));
    await userEvent.click(screen.getByRole('button', { name: /고른 칸 적용/ }));

    await waitFor(() => expect(textbookAPI.apply).toHaveBeenCalledWith(3, {
      materialId: 31,
      values: { isbn: '9791156645672', edition: '개정 4판' },
      expected: { isbn: null, edition: '개정 3판' },
      expectedVersion: 4,
    }));
  });

  it('그 사이 다른 곳에서 고쳤으면 멈추고 다시 읽는다', async () => {
    textbookAPI.get.mockResolvedValue(FOUND);
    textbookAPI.apply.mockRejectedValue(new Error('그 사이 교재 정보가 바뀌었어요. 지금 교재를 다시 확인한 뒤 골라 주세요'));
    render(<TextbookPanel courseId={3} />);
    await userEvent.click(await screen.findByRole('button', { name: /고른 칸 적용/ }));

    expect(await screen.findByText(/그 사이 교재 정보가 바뀌었어요/)).toBeInTheDocument();
    expect(textbookAPI.get).toHaveBeenCalledTimes(2);
  });

  it('강의계획서의 교재는 후보로 따로 보이고, 지금 교재로 정할 수 있다', async () => {
    textbookAPI.get.mockResolvedValue({ ...SYLLABUS_ONLY, lookup: lookup('NOT_FOUND', { note: '이 단서로 맞는 책 페이지를 찾지 못했어요.' }) });
    textbookAPI.applyClue.mockResolvedValue(SYLLABUS_ONLY);
    render(<TextbookPanel courseId={3} />);

    expect(await screen.findByText(/아직 정한 교재가 없어요/)).toBeInTheDocument();
    expect(screen.getByText(/강의계획서에 적힌 교재/)).toBeInTheDocument();
    expect(screen.getByText('NEW English Conversation Arts 1')).toBeInTheDocument();
    expect(screen.getByText('맞는 책을 찾지 못함')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ISBN·판 적기' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '이 교재로 정하기' }));
    await waitFor(() => expect(textbookAPI.applyClue).toHaveBeenCalledWith(3,
      { materialId: 77, title: 'NEW English Conversation Arts 1', expectedVersion: 0 }));
  });

  it('찾는 동안 서버를 다시 보고, 끝나면 알린다', async () => {
    const settled = vi.fn();
    textbookAPI.get
      .mockResolvedValueOnce({ ...SYLLABUS_ONLY, lookup: lookup('RUNNING') })
      .mockResolvedValue({ ...SYLLABUS_ONLY, lookup: lookup('FOUND', { editions: [EDITION_NEW] }) });
    render(<TextbookPanel courseId={3} onLookupSettled={settled} />);

    expect(await screen.findByText('찾는 중')).toBeInTheDocument();
    expect(screen.getByText(/보낸 정보: NEW English Conversation Arts 1 · Michael Putlack, 이현호 · 형설출판사/)).toBeInTheDocument();
    // 3초 간격으로 다시 본다(실제 시간).
    expect(await screen.findByText('책과 목차를 찾았어요', {}, { timeout: 6000 })).toBeInTheDocument();
    await waitFor(() => expect(settled).toHaveBeenCalledTimes(1));
  }, 10000);

  it('같은 제목의 판이 여럿이면 발행일·ISBN·목차가 같은지 보이고 고른 판만 보낸다', async () => {
    textbookAPI.get.mockResolvedValue({ ...SYLLABUS_ONLY,
      lookup: lookup('NEEDS_CHOICE', { editions: [EDITION_NEW, EDITION_OLD] }) });
    textbookAPI.choose.mockResolvedValue(SYLLABUS_ONLY);
    render(<TextbookPanel courseId={3} />);

    expect(await screen.findByText('판 확인 필요')).toBeInTheDocument();
    expect(screen.getByText(/같은 제목의 책이 2가지예요/)).toBeInTheDocument();
    expect(screen.getByText(/2026-01-30 발행 · ISBN 9788947288132/)).toBeInTheDocument();
    expect(screen.getAllByText(/목차는 .* 판과 같아요/)).toHaveLength(2);

    await userEvent.click(screen.getAllByRole('button', { name: '이 판으로 정하기' })[1]);
    await waitFor(() => expect(textbookAPI.choose).toHaveBeenCalledWith(3,
      { lookupId: 9, revisionId: 502, expectedVersion: 0 }));
  });

  it('실제 교재가 다르면 다섯 칸을 모두 보내고 본 교재 판을 함께 보낸다', async () => {
    textbookAPI.get.mockResolvedValue(FOUND);
    courseAPI.update.mockResolvedValue({ courseId: 3 });
    render(<TextbookPanel courseId={3} />);

    await userEvent.click(await screen.findByRole('button', { name: '실제 교재가 달라요' }));
    const title = screen.getByRole('textbox', { name: '교재명' });
    await userEvent.clear(title);
    await userEvent.type(title, 'B책');
    await userEvent.clear(screen.getByRole('textbox', { name: '교재 판' }));
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(courseAPI.update).toHaveBeenCalledWith(3, {
      textbookTitle: 'B책', textbookAuthor: null, textbookPublisher: null, textbookIsbn: null, textbookEdition: null,
      expectedTextbookVersion: 4,
    }));
  });

  it('어느 책인지 적혀 있지 않은 업로드 목차는 사용자가 이어야 쓴다', async () => {
    textbookAPI.get.mockResolvedValue({ ...FOUND, toc: { status: 'NOT_FOUND', entryCount: 0, entries: [] },
      state: 'TITLE_ONLY', candidates: [], unlinkedTocs: [{ materialId: 55, filename: '목차.pdf', entryCount: 12 }] });
    textbookAPI.linkToc.mockResolvedValue(FOUND);
    render(<TextbookPanel courseId={3} />);

    await userEvent.click(await screen.findByRole('button', { name: '이 교재 목차로 쓰기' }));
    await waitFor(() => expect(textbookAPI.linkToc).toHaveBeenCalledWith(3, { materialId: 55, expectedVersion: 4 }));
  });

  it('웹 검색을 끄면 보내지 않는다고 말하고 다시 찾기·링크를 숨긴다', async () => {
    textbookAPI.get.mockResolvedValue({ ...SYLLABUS_ONLY, webLookupEnabled: false });
    render(<TextbookPanel courseId={3} />);

    expect(await screen.findByText(/교재 웹 검색을 꺼 두었어요/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /상세 페이지 링크로 찾기/ })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /교재 이름으로 웹에서 목차 찾기/ })).not.toBeChecked();
  });
});
