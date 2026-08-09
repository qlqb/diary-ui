import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CourseDetail from './CourseDetail.jsx';
import { courseAPI, materialAPI, materialAnalysisAPI, topicAPI } from '../../api/api.js';

vi.mock('../../api/api.js', () => ({
  courseAPI: { get: vi.fn() },
  materialAPI: { listByCourse: vi.fn(), upload: vi.fn() },
  materialAnalysisAPI: { analyze: vi.fn(), edit: vi.fn(), apply: vi.fn(), dismiss: vi.fn() },
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

async function openMaterialsTab(user) {
  await user.click(await screen.findByRole('button', { name: '자료' }));
}

describe('CourseDetail - Material Agent draft/편집/적용', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('분석 실행 후 draft 결과를 편집 가능한 초안으로 보여주고, 아직 적용 API는 부르지 않는다', async () => {
    const user = userEvent.setup();
    setupCommonMocks();
    materialAnalysisAPI.analyze.mockResolvedValue(draftAnalysis);

    render(<CourseDetail courseId={1} onBack={vi.fn()} />);
    await openMaterialsTab(user);

    await user.click(await screen.findByRole('button', { name: '분석하기' }));

    expect(await screen.findByText('목차를 찾았어요')).toBeInTheDocument();
    expect(screen.getByDisplayValue('연결 리스트')).toBeInTheDocument();
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
    await openMaterialsTab(user);
    await user.click(await screen.findByRole('button', { name: '분석하기' }));

    expect(await screen.findByText('목차 근거를 찾지 못했습니다')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '검토 완료 — 적용' })).toBeDisabled();
  });

  it('사용자가 항목 제목을 고친 뒤 적용하면, 고친 내용으로 edit을 먼저 저장하고 나서 apply를 호출한다', async () => {
    const user = userEvent.setup();
    setupCommonMocks();
    materialAnalysisAPI.analyze.mockResolvedValue(draftAnalysis);
    materialAnalysisAPI.edit.mockResolvedValue({});
    materialAnalysisAPI.apply.mockResolvedValue({});

    render(<CourseDetail courseId={1} onBack={vi.fn()} />);
    await openMaterialsTab(user);
    await user.click(await screen.findByRole('button', { name: '분석하기' }));

    const titleInput = await screen.findByDisplayValue('연결 리스트');
    await user.clear(titleInput);
    await user.type(titleInput, '이중 연결 리스트');

    await user.click(screen.getByRole('button', { name: '검토 완료 — 적용' }));

    expect(materialAnalysisAPI.edit).toHaveBeenCalledWith(5, expect.objectContaining({
      topics: [expect.objectContaining({ title: '이중 연결 리스트', sourceType: 'SOURCE', sourceLocator: '3장' })],
    }));
    expect(materialAnalysisAPI.apply).toHaveBeenCalledWith(5);
    expect(topicAPI.getTree).toHaveBeenCalledTimes(2); // 최초 로드 + 적용 후 새로고침
  });
});

describe('CourseDetail - 학습 지도 (LearningMap + TopicDetail)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const topics = [
    {
      topicId: 1,
      parentTopicId: null,
      title: '연결 리스트',
      sourceType: 'SOURCE',
      sourceLocator: '3장',
      progressStatus: 'NOT_STARTED',
      lastStudiedAt: null,
      reviewCount: 0,
      children: [],
    },
  ];

  it('topic을 선택하면 상세가 나타나고, AI 과외 시작을 누르면 course/topic을 함께 전달한다', async () => {
    const user = userEvent.setup();
    courseAPI.get.mockResolvedValue({ courseId: 1, title: '자료구조', textbookTitle: null });
    materialAPI.listByCourse.mockResolvedValue([]);
    topicAPI.getTree.mockResolvedValue(topics);
    const onStartTutor = vi.fn();

    render(<CourseDetail courseId={1} onBack={vi.fn()} onStartTutor={onStartTutor} />);

    expect(await screen.findByText('왼쪽 학습 지도에서 항목을 선택하면 상세 정보가 여기 나타나요.')).toBeInTheDocument();

    await user.click(await screen.findByText('연결 리스트'));
    expect(await screen.findByText('아직 안 함')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /AI 과외 시작/ }));

    expect(onStartTutor).toHaveBeenCalledWith(
      expect.objectContaining({ courseId: 1, title: '자료구조' }),
      expect.objectContaining({ topicId: 1, title: '연결 리스트' }),
    );
  });
});
