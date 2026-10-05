import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TextbookPanel from './TextbookPanel.jsx';
import { textbookAPI } from '../../api/api.js';
import { countBelow, tocTree } from '../../lib/tocTree.js';

vi.mock('../../api/api.js', () => ({
  textbookAPI: {
    get: vi.fn(), apply: vi.fn(), applyClue: vi.fn(), choose: vi.fn(), retry: vi.fn(), link: vi.fn(),
    setEnabled: vi.fn(), linkToc: vi.fn(),
  },
  courseAPI: { update: vi.fn() },
}));

/**
 * 교재 목차는 하위항목까지 다 보이되 접어서 보인다: 장만 펼쳐져 있고, 장을 누르면 절·실습·요약·연습문제가 나온다.
 * 깊이 단계를 자르지 않는다. 목차로 읽지 못한 줄이 있으면 그 수를 말한다(조용히 버리지 않는다). 목차는 합성이다.
 */
const ENTRIES = [
  { level: 1, number: 'Chapter 01', title: '첫째 장', page: null, unit: 1 },
  { level: 2, number: '01', title: '가람 개요', page: null, unit: 2 },
  { level: 3, number: '1.1.1', title: '깊은 소절', page: null, unit: 3 },
  { level: 4, number: '1.1.1.1', title: '더 깊은 항목', page: null, unit: 4 },
  { level: 2, number: '실습 1-1', title: '가람 프로그램', page: null, unit: 5 },
  { level: 2, number: null, title: '연습문제', page: null, unit: 6 },
  { level: 1, number: 'Chapter 02', title: '둘째 장', page: null, unit: 7 },
  { level: 1, number: '부록 A', title: '설치하기', page: null, unit: 8 },
];

const REVIEW = {
  courseId: 3,
  current: { title: '합성 교재', source: 'WEB', version: 2 },
  candidates: [],
  toc: { status: 'FOUND', entryCount: ENTRIES.length, kind: 'WEB', label: '웹 목차(예스24 · 페이지에 실린 목차 전체)',
    coverage: 'PARTIAL', unread: 2, entries: ENTRIES },
  state: 'TOC_FOUND', nextAction: '목차와 지금 학습 구조를 비교해요.', topicCount: 3, pending: 0,
  syllabusClues: [], lookup: null, unlinkedTocs: [], webLookupEnabled: true,
};

beforeEach(() => vi.clearAllMocks());

describe('교재 목차 트리', () => {
  it('평평한 목차를 깊이대로 묶고 단계를 자르지 않는다', () => {
    const roots = tocTree(ENTRIES);
    expect(roots.map((n) => n.entry.title)).toEqual(['첫째 장', '둘째 장', '설치하기']);
    expect(roots[0].children.map((n) => n.entry.title)).toEqual(['가람 개요', '가람 프로그램', '연습문제']);
    expect(roots[0].children[0].children[0].children[0].entry.title).toBe('더 깊은 항목');
    expect(countBelow(roots[0])).toBe(5);
  });

  it('장만 보이고 누르면 하위항목이 펼쳐지며, 읽지 못한 줄 수를 말한다', async () => {
    textbookAPI.get.mockResolvedValue(REVIEW);
    render(<TextbookPanel courseId={3} />);

    expect(await screen.findByText(/목차로 읽지 못한 줄 2개/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /목차 보기/ }));

    const chapter = screen.getByRole('button', { name: /Chapter 01 첫째 장/ });
    expect(chapter).toHaveAttribute('aria-expanded', 'false');
    expect(within(chapter).getByText(/하위 5개/)).toBeInTheDocument();
    expect(screen.queryByText(/가람 프로그램/)).not.toBeInTheDocument();

    await userEvent.click(chapter);
    expect(screen.getByText(/실습 1-1 가람 프로그램/)).toBeInTheDocument();
    expect(screen.getByText('연습문제')).toBeInTheDocument();
    expect(screen.queryByText(/더 깊은 항목/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /01 가람 개요/ }));
    await userEvent.click(screen.getByRole('button', { name: /1\.1\.1 깊은 소절/ }));
    expect(screen.getByText(/1\.1\.1\.1 더 깊은 항목/)).toBeInTheDocument();
  });
});
