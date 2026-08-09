import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TopicDetail from './TopicDetail.jsx';
import { topicAPI } from '../../api/api.js';

vi.mock('../../api/api.js', () => ({
  topicAPI: { updateProgress: vi.fn() },
}));

const topic = {
  topicId: 2,
  title: '단순 연결 리스트',
  sourceType: 'AI_DERIVED',
  sourceLocator: null,
  progressStatus: 'NOT_STARTED',
  lastStudiedAt: null,
  reviewCount: 0,
};

describe('TopicDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('topic이 선택되지 않았으면 안내 문구만 보여준다', () => {
    render(<TopicDetail courseTitle="자료구조" topic={null} onProgressChanged={vi.fn()} onStartTutor={vi.fn()} />);
    expect(screen.getByText(/항목을 선택하면/)).toBeInTheDocument();
  });

  it('상태와 출처(SOURCE/AI_DERIVED)를 보여준다', () => {
    render(<TopicDetail courseTitle="자료구조" topic={topic} onProgressChanged={vi.fn()} onStartTutor={vi.fn()} />);

    expect(screen.getByText('아직 안 함')).toBeInTheDocument();
    expect(screen.getByText('AI 세분화')).toBeInTheDocument();
  });

  it('학습 시작을 누르면 사용자가 명시적으로 진행 상태를 바꾼다', async () => {
    const user = userEvent.setup();
    const onProgressChanged = vi.fn().mockResolvedValue(undefined);
    render(<TopicDetail courseTitle="자료구조" topic={topic} onProgressChanged={onProgressChanged} onStartTutor={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /학습 시작/ }));

    expect(topicAPI.updateProgress).toHaveBeenCalledWith(2, 'IN_PROGRESS');
    expect(onProgressChanged).toHaveBeenCalled();
  });

  it('AI 과외 시작은 진행 상태를 바꾸지 않고 onStartTutor에 topic을 전달한다', async () => {
    const user = userEvent.setup();
    const onStartTutor = vi.fn();
    render(<TopicDetail courseTitle="자료구조" topic={topic} onProgressChanged={vi.fn()} onStartTutor={onStartTutor} />);

    await user.click(screen.getByRole('button', { name: /AI 과외 시작/ }));

    expect(onStartTutor).toHaveBeenCalledWith(topic);
    expect(topicAPI.updateProgress).not.toHaveBeenCalled();
  });
});
