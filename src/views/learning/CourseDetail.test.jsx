import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CourseDetail from './CourseDetail.jsx';
import { courseAPI, materialAPI, materialAnalysisAPI, topicAPI } from '../../api/api.js';

vi.mock('../../api/api.js', () => ({
  courseAPI: { get: vi.fn() },
  materialAPI: { listByCourse: vi.fn(), upload: vi.fn() },
  materialAnalysisAPI: { analyze: vi.fn(), apply: vi.fn(), dismiss: vi.fn() },
  topicAPI: { getTree: vi.fn(), updateProgress: vi.fn() },
  learningRecommendationAPI: { recommend: vi.fn() },
  planningAPI: { createDraft: vi.fn(), apply: vi.fn() },
  learningConversationAPI: { create: vi.fn(), sendMessage: vi.fn() },
}));

const material = {
  materialId: 1,
  courseId: 1,
  materialType: 'TEXTBOOK_TOC',
  originalFilename: 'toc.pdf',
  extractionStatus: 'SUCCESS',
  extractionError: null,
};

const draftAnalysis = {
  analysisId: 5,
  materialId: 1,
  status: 'DRAFT',
  failureReason: null,
  payload: {
    summary: '목차를 찾았어요',
    courseFields: { textbookTitle: null, textbookAuthor: null, textbookPublisher: null, textbookIsbn: null },
    keyDates: [],
    topics: [
      { title: '연결 리스트', sourceType: 'SOURCE', sourceLocator: '3장', children: [] },
    ],
  },
};

function setupCommonMocks() {
  courseAPI.get.mockResolvedValue({ courseId: 1, title: '자료구조', textbookTitle: null });
  materialAPI.listByCourse.mockResolvedValue([material]);
  topicAPI.getTree.mockResolvedValue([]);
}

describe('CourseDetail - Material Agent draft/review/apply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('분석 실행 후 draft 결과를 검토용으로 보여주고, 아직 적용 API는 부르지 않는다', async () => {
    const user = userEvent.setup();
    setupCommonMocks();
    materialAnalysisAPI.analyze.mockResolvedValue(draftAnalysis);

    render(<CourseDetail courseId={1} onBack={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: '분석하기' }));

    expect(await screen.findByText('목차를 찾았어요')).toBeInTheDocument();
    expect(screen.getByText('연결 리스트')).toBeInTheDocument();
    expect(screen.getByText('원문 근거')).toBeInTheDocument();
    expect(materialAnalysisAPI.apply).not.toHaveBeenCalled();
  });

  it('목차 근거를 찾지 못하면 빈 topics를 보여주고 적용 버튼을 비활성화한다(환각 방지)', async () => {
    const user = userEvent.setup();
    setupCommonMocks();
    materialAnalysisAPI.analyze.mockResolvedValue({
      ...draftAnalysis,
      payload: { ...draftAnalysis.payload, topics: [], summary: '목차 근거를 찾지 못했습니다' },
    });

    render(<CourseDetail courseId={1} onBack={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: '분석하기' }));

    expect(await screen.findByText('목차 근거를 찾지 못했습니다')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '검토 완료 — 적용' })).toBeDisabled();
  });

  it('검토 완료 — 적용을 눌러야만 apply API가 호출되고 목록이 새로고침된다', async () => {
    const user = userEvent.setup();
    setupCommonMocks();
    materialAnalysisAPI.analyze.mockResolvedValue(draftAnalysis);
    materialAnalysisAPI.apply.mockResolvedValue({});

    render(<CourseDetail courseId={1} onBack={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: '분석하기' }));
    await screen.findByText('연결 리스트');

    await user.click(screen.getByRole('button', { name: '검토 완료 — 적용' }));

    expect(materialAnalysisAPI.apply).toHaveBeenCalledWith(5);
    expect(topicAPI.getTree).toHaveBeenCalledTimes(2); // 최초 로드 + 적용 후 새로고침
  });
});
