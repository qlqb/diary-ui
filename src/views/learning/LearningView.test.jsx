import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LearningView from './LearningView.jsx';
import { courseAPI, courseNoteAPI, topicAPI, materialAPI } from '../../api/api.js';

vi.mock('../../api/api.js', () => ({
  courseAPI: { list: vi.fn(), get: vi.fn(), create: vi.fn() },
  courseNoteAPI: { list: vi.fn() },
  topicAPI: { getTree: vi.fn(), updateProgress: vi.fn() },
  materialAPI: { listByCourse: vi.fn() },
  materialAnalysisAPI: { analyze: vi.fn(), edit: vi.fn(), apply: vi.fn(), dismiss: vi.fn() },
  learningRecommendationAPI: { recommend: vi.fn() },
  planningAPI: { createDraft: vi.fn(), apply: vi.fn() },
  learningConversationAPI: { create: vi.fn(), sendMessage: vi.fn() },
}));

const courses = [{ courseId: 1, title: '자료구조', topicCount: 3, textbookTitle: null }];

const topicsTree = [
  { topicId: 1, title: '자료구조 개요', progressStatus: 'LEARNED', children: [] },
  { topicId: 2, title: '알고리즘 복잡도 분석', progressStatus: 'IN_PROGRESS', children: [] },
  { topicId: 3, title: '시간 복잡도', progressStatus: 'NOT_STARTED', children: [] },
];

describe('LearningView - 학습 진입점', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    courseAPI.list.mockResolvedValue(courses);
    topicAPI.getTree.mockResolvedValue(topicsTree);
  });

  it('과목 목록이 아니라 진행률과 현재 학습 중인 topic을 먼저 보여준다', async () => {
    render(<LearningView />);

    expect(await screen.findByText('자료구조')).toBeInTheDocument();
    expect(screen.getByText('진행 33%')).toBeInTheDocument(); // 3개 중 1개 LEARNED
    expect(screen.getByText('현재 학습')).toBeInTheDocument();
    expect(screen.getByText('알고리즘 복잡도 분석')).toBeInTheDocument();
  });

  it('이어 학습을 누르면 과목 상세를 거치지 않고 바로 개인과외로 들어간다', async () => {
    const user = userEvent.setup();
    render(<LearningView />);

    await screen.findByText('자료구조');
    await user.click(screen.getByRole('button', { name: /이어 학습/ }));

    expect(await screen.findByText('AI 개인과외')).toBeInTheDocument();
    expect(screen.getByText('알고리즘 복잡도 분석')).toBeInTheDocument();
  });

  it('과목 보기를 누르면 과목 상세(학습 지도)로 들어간다', async () => {
    const user = userEvent.setup();
    courseAPI.get.mockResolvedValue({ courseId: 1, title: '자료구조', textbookTitle: null });
    materialAPI.listByCourse.mockResolvedValue([]);
    courseNoteAPI.list.mockResolvedValue([]);
    render(<LearningView />);

    await screen.findByText('자료구조');
    await user.click(screen.getByRole('button', { name: /과목 보기/ }));

    expect(await screen.findByRole('button', { name: '학습 지도' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '자료' })).toBeInTheDocument();
  });
});
