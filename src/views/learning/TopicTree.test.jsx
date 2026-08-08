import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TopicTree from './TopicTree.jsx';
import { topicAPI } from '../../api/api.js';

vi.mock('../../api/api.js', () => ({
  topicAPI: {
    updateProgress: vi.fn(),
  },
  learningConversationAPI: {
    create: vi.fn(),
    sendMessage: vi.fn(),
  },
}));

const topics = [
  {
    topicId: 1,
    parentTopicId: null,
    title: '연결 리스트',
    sourceType: 'SOURCE',
    sourceLocator: '3장',
    progressStatus: 'NOT_STARTED',
    reviewCount: 0,
    children: [
      {
        topicId: 2,
        parentTopicId: 1,
        title: '단순 연결 리스트',
        sourceType: 'AI_DERIVED',
        sourceLocator: null,
        progressStatus: 'IN_PROGRESS',
        reviewCount: 0,
        children: [],
      },
    ],
  },
];

describe('TopicTree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders source/AI_DERIVED badges and progress status for each node', () => {
    render(<TopicTree topics={topics} onProgressChanged={vi.fn()} />);

    expect(screen.getByText('연결 리스트')).toBeInTheDocument();
    expect(screen.getByText('단순 연결 리스트')).toBeInTheDocument();
    expect(screen.getAllByText('원문 근거')).toHaveLength(1);
    expect(screen.getAllByText('AI 세분화')).toHaveLength(1);
    expect(screen.getByText('아직 안 함')).toBeInTheDocument();
    expect(screen.getByText('학습 중')).toBeInTheDocument();
  });

  it('advances NOT_STARTED -> IN_PROGRESS when the user explicitly clicks the action button', async () => {
    const user = userEvent.setup();
    const onProgressChanged = vi.fn().mockResolvedValue(undefined);
    render(<TopicTree topics={topics} onProgressChanged={onProgressChanged} />);

    const rootRow = screen.getByText('연결 리스트').closest('.learning-topic-row');
    await user.click(within(rootRow).getByRole('button', { name: '학습 시작' }));

    expect(topicAPI.updateProgress).toHaveBeenCalledWith(1, 'IN_PROGRESS');
    expect(onProgressChanged).toHaveBeenCalled();
  });

  it('offers "학습 완료 처리" (not skipping straight to re-learn) for an IN_PROGRESS topic', () => {
    render(<TopicTree topics={topics} onProgressChanged={vi.fn()} />);

    const childRow = screen.getByText('단순 연결 리스트').closest('.learning-topic-row');
    expect(within(childRow).getByRole('button', { name: '학습 완료 처리' })).toBeInTheDocument();
  });

  it('opens the tutor chat panel for a topic when the question button is clicked', async () => {
    const user = userEvent.setup();
    render(<TopicTree topics={topics} onProgressChanged={vi.fn()} />);

    expect(screen.queryByPlaceholderText(/prev 포인터/)).not.toBeInTheDocument();

    const rootRow = screen.getByText('연결 리스트').closest('.learning-topic-row');
    await user.click(within(rootRow).getByRole('button', { name: '이 주제에 대해 질문하기' }));

    expect(screen.getByText('연결 리스트에 대해 궁금한 걸 물어보세요.')).toBeInTheDocument();
  });
});
