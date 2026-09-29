import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TextbookPanel from './TextbookPanel.jsx';
import { textbookAPI } from '../../api/api.js';

vi.mock('../../api/api.js', () => ({
  textbookAPI: { get: vi.fn(), apply: vi.fn() },
}));

/**
 * 교재 구역이 약속하는 것: 자료에서 찾은 값은 후보다. 비어 있는 칸만 기본으로 고르고, 지금 값과 다른 칸은 두 값을 나란히
 * 보이며 사용자가 골라야 바뀐다. 적용 요청에는 화면이 본 지금 값(expected)을 함께 보낸다. 목차가 없으면 없다고 말한다.
 */
const FOUND = {
  courseId: 3,
  current: { title: 'C로 배우는 쉬운 자료구조', author: null, publisher: null, isbn: null, edition: '개정 3판', source: 'USER' },
  candidates: [{
    materialId: 31, filename: '자료구조_앞부분.pdf', materialType: 'TEXTBOOK_TOC',
    fields: [
      { field: 'isbn', value: '9791156645672', unit: 2, quote: 'ISBN 979-11-5664-567-2 93000', current: null, same: false },
      { field: 'edition', value: '개정 4판', unit: 1, quote: '개정 4판', current: '개정 3판', same: false },
    ],
  }],
  toc: { status: 'FOUND', materialId: 31, filename: '자료구조_앞부분.pdf', entryCount: 10, fromUnit: 3, toUnit: 4,
    entries: [{ level: 1, number: 'CHAPTER 01', title: '자료구조와 알고리즘', page: 13, unit: 3 }] },
  state: 'TOC_FOUND',
  nextAction: '목차로 학습 구조의 첫 골격을 만들 수 있어요.',
  topicCount: 0,
  pending: 0,
};

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
    expect(screen.getByText(/목차 확보: 「자료구조_앞부분\.pdf」 p\.3~4 · 장·절 10개/)).toBeInTheDocument();
  });

  it('적용은 고른 칸과 화면이 본 지금 값을 함께 보낸다', async () => {
    textbookAPI.get.mockResolvedValue(FOUND);
    textbookAPI.apply.mockResolvedValue({ ...FOUND, candidates: [] });
    render(<TextbookPanel courseId={3} />);
    await userEvent.click(await screen.findByRole('checkbox', { name: /판 개정 4판/ }));
    await userEvent.click(screen.getByRole('button', { name: /고른 칸 적용/ }));

    await waitFor(() => expect(textbookAPI.apply).toHaveBeenCalledWith(3, {
      materialId: 31,
      values: { isbn: '9791156645672', edition: '개정 4판' },
      expected: { isbn: null, edition: '개정 3판' },
    }));
  });

  it('그 사이 다른 곳에서 고쳤으면 멈추고 다시 읽는다', async () => {
    textbookAPI.get.mockResolvedValue(FOUND);
    textbookAPI.apply.mockRejectedValue(new Error('그 사이 교재 정보가 바뀌었어요. 지금 값을 다시 보고 골라 주세요'));
    render(<TextbookPanel courseId={3} />);
    await userEvent.click(await screen.findByRole('button', { name: /고른 칸 적용/ }));

    expect(await screen.findByText(/그 사이 교재 정보가 바뀌었어요/)).toBeInTheDocument();
    expect(textbookAPI.get).toHaveBeenCalledTimes(2);
  });

  it('책 이름만 있으면 목차 미확보와 다음 행동을 말한다', async () => {
    textbookAPI.get.mockResolvedValue({
      ...FOUND, candidates: [], state: 'TITLE_ONLY',
      toc: { status: 'NOT_FOUND', entryCount: 0, entries: [] },
      nextAction: '교재 목차를 아직 확보하지 못했어요. 목차 쪽(사진·PDF)이나 본문을 올리면 범위를 확인할 수 있어요. 지금 자료로도 계획과 학습은 그대로 진행할 수 있어요.',
    });
    render(<TextbookPanel courseId={3} />);

    expect(await screen.findByText(/교재 목차를 아직 확보하지 못했어요/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /읽은 목차 보기/ })).not.toBeInTheDocument();
  });
});
