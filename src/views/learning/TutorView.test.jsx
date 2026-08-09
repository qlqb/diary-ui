import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TutorView from './TutorView.jsx';
import { topicAPI, materialAPI, learningConversationAPI } from '../../api/api.js';

vi.mock('../../api/api.js', () => ({
  topicAPI: { updateProgress: vi.fn() },
  materialAPI: { listByCourse: vi.fn() },
  learningConversationAPI: { create: vi.fn(), sendMessage: vi.fn() },
}));

const course = { courseId: 1, title: '자료구조' };
const topic = { topicId: 2, title: '알고리즘 복잡도 분석', sourceLocator: '3장' };

describe('TutorView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('진입 시 이미 과목/주제 context를 갖고 있어 대화를 보낼 때 topicId를 함께 보낸다 — 다시 묻지 않는다', async () => {
    const user = userEvent.setup();
    learningConversationAPI.create.mockResolvedValue({ conversationId: 9 });
    learningConversationAPI.sendMessage.mockResolvedValue({ reply: '알고리즘 복잡도는 입력 크기에 따른 증가 추세예요.' });

    render(<TutorView course={course} topic={topic} onExit={vi.fn()} />);

    expect(screen.getByText('자료구조')).toBeInTheDocument();
    expect(screen.getByText('알고리즘 복잡도 분석')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('궁금한 내용을 입력하세요'), '이게 왜 필요한지 모르겠어');
    await user.click(screen.getByRole('button', { name: '보내기' }));

    expect(learningConversationAPI.sendMessage).toHaveBeenCalledWith(9, 2, '이게 왜 필요한지 모르겠어');
    expect(await screen.findByText('알고리즘 복잡도는 입력 크기에 따른 증가 추세예요.')).toBeInTheDocument();
  });

  it('오늘은 여기까지를 누르면 진행 상태를 바꾸지 않고 나간다', async () => {
    const user = userEvent.setup();
    const onExit = vi.fn();
    render(<TutorView course={course} topic={topic} onExit={onExit} />);

    await user.click(screen.getByRole('button', { name: '오늘은 여기까지' }));

    expect(onExit).toHaveBeenCalledWith('PAUSED');
    expect(topicAPI.updateProgress).not.toHaveBeenCalled();
  });

  it('학습 완료는 사용자의 명시적 액션으로만 LEARNED를 반영한 뒤 나간다', async () => {
    const user = userEvent.setup();
    topicAPI.updateProgress.mockResolvedValue({});
    const onExit = vi.fn();
    render(<TutorView course={course} topic={topic} onExit={onExit} />);

    await user.click(screen.getByRole('button', { name: '학습 완료' }));

    expect(topicAPI.updateProgress).toHaveBeenCalledWith(2, 'LEARNED');
    expect(onExit).toHaveBeenCalledWith('COMPLETED');
  });

  it('자료 보기를 누르면 과목 자료 목록을 불러와 보여준다', async () => {
    const user = userEvent.setup();
    materialAPI.listByCourse.mockResolvedValue([
      { materialId: 1, originalFilename: '3주차 자료구조.pdf', materialType: 'PROFESSOR_SLIDE' },
    ]);

    render(<TutorView course={course} topic={topic} onExit={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /자료 보기/ }));

    expect(materialAPI.listByCourse).toHaveBeenCalledWith(1);
    expect(await screen.findByText('3주차 자료구조.pdf')).toBeInTheDocument();
  });
});
