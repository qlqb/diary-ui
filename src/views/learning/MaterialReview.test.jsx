import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MaterialReview from './MaterialReview.jsx';
import { materialAnalysisAPI } from '../../api/api.js';

vi.mock('../../api/api.js', () => ({
  materialAnalysisAPI: { edit: vi.fn(), apply: vi.fn() },
}));

const analysis = {
  analysisId: 7,
  status: 'DRAFT',
  payload: {
    summary: '목차를 찾았어요',
    courseFields: { textbookTitle: null, textbookAuthor: null, textbookPublisher: null, textbookIsbn: null },
    keyDates: [],
    topics: [
      {
        title: '연결 리스트',
        sourceType: 'SOURCE',
        sourceLocator: '3장',
        children: [
          { title: '단순 연결 리스트', sourceType: 'SOURCE', sourceLocator: '3.1', children: [] },
        ],
      },
    ],
  },
};

describe('MaterialReview - AI 분석 초안 편집', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    materialAnalysisAPI.edit.mockResolvedValue({});
    materialAnalysisAPI.apply.mockResolvedValue({});
  });

  it('잘못된 하위 항목을 제거하고 적용하면, 제거된 구조로 저장된다', async () => {
    const user = userEvent.setup();
    render(<MaterialReview analysis={analysis} onApplied={vi.fn()} onDismiss={vi.fn()} />);

    const removeButtons = screen.getAllByTitle('이 항목 제거');
    await user.click(removeButtons[1]); // 하위 항목(단순 연결 리스트) 제거

    await user.click(screen.getByRole('button', { name: '검토 완료 — 적용' }));

    expect(materialAnalysisAPI.edit).toHaveBeenCalledWith(7, expect.objectContaining({
      topics: [expect.objectContaining({ title: '연결 리스트', children: [] })],
    }));
  });

  it('제목을 고치면 sourceType은 그대로 유지된다(제목 수정과 근거 상실은 다른 일이다)', async () => {
    const user = userEvent.setup();
    render(<MaterialReview analysis={analysis} onApplied={vi.fn()} onDismiss={vi.fn()} />);

    const titleInput = screen.getByDisplayValue('연결 리스트');
    await user.clear(titleInput);
    await user.type(titleInput, '이중 연결 리스트');

    await user.click(screen.getByRole('button', { name: '검토 완료 — 적용' }));

    expect(materialAnalysisAPI.edit).toHaveBeenCalledWith(7, expect.objectContaining({
      topics: [expect.objectContaining({ title: '이중 연결 리스트', sourceType: 'SOURCE', sourceLocator: '3장' })],
    }));
  });

  it('최상위 항목을 추가하면 원문 근거가 없으므로 AI 세분화로 표시한다(provenance 보존)', async () => {
    const user = userEvent.setup();
    render(<MaterialReview analysis={analysis} onApplied={vi.fn()} onDismiss={vi.fn()} />);

    expect(screen.queryByText('AI 세분화')).not.toBeInTheDocument(); // 기존 두 항목은 모두 SOURCE

    await user.click(screen.getByRole('button', { name: /최상위 항목 추가/ }));

    expect(screen.getByText('AI 세분화')).toBeInTheDocument();
  });

  it('교재명을 입력하면 적용 시 courseFields에 반영된다', async () => {
    const user = userEvent.setup();
    render(<MaterialReview analysis={analysis} onApplied={vi.fn()} onDismiss={vi.fn()} />);

    const textbookInput = screen.getAllByPlaceholderText('미확인')[0];
    await user.type(textbookInput, '자료구조와 함께 배우는 알고리즘');

    await user.click(screen.getByRole('button', { name: '검토 완료 — 적용' }));

    expect(materialAnalysisAPI.edit).toHaveBeenCalledWith(7, expect.objectContaining({
      courseFields: expect.objectContaining({ textbookTitle: '자료구조와 함께 배우는 알고리즘' }),
    }));
  });

  it('적용을 누르면 edit 저장 이후 apply가 호출되고 onApplied가 불린다', async () => {
    const user = userEvent.setup();
    const onApplied = vi.fn();
    render(<MaterialReview analysis={analysis} onApplied={onApplied} onDismiss={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '검토 완료 — 적용' }));

    expect(materialAnalysisAPI.edit.mock.invocationCallOrder[0])
      .toBeLessThan(materialAnalysisAPI.apply.mock.invocationCallOrder[0]);
    expect(materialAnalysisAPI.apply).toHaveBeenCalledWith(7);
    expect(onApplied).toHaveBeenCalled();
  });
});
