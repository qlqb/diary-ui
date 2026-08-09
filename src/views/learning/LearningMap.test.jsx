import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LearningMap from './LearningMap.jsx';

const topics = [
  {
    topicId: 1,
    title: '연결 리스트',
    progressStatus: 'IN_PROGRESS',
    children: [
      { topicId: 2, title: '단순 연결 리스트', progressStatus: 'LEARNED', children: [] },
      { topicId: 3, title: '원형 연결 리스트', progressStatus: 'NOT_STARTED', children: [] },
    ],
  },
];

describe('LearningMap', () => {
  it('평평한 카드 목록이 아니라 부모-자식 관계가 들여쓰기로 드러난다', () => {
    render(<LearningMap topics={topics} selectedTopicId={null} onSelectTopic={vi.fn()} />);

    expect(screen.getByText('연결 리스트')).toBeInTheDocument();
    expect(screen.getByText('단순 연결 리스트')).toBeInTheDocument();
    expect(screen.getByText('원형 연결 리스트')).toBeInTheDocument();
  });

  it('접기 버튼을 누르면 하위 항목이 숨겨진다', async () => {
    const user = userEvent.setup();
    render(<LearningMap topics={topics} selectedTopicId={null} onSelectTopic={vi.fn()} />);

    await user.click(screen.getByLabelText('접기'));

    expect(screen.queryByText('단순 연결 리스트')).not.toBeInTheDocument();
  });

  it('제목을 클릭하면 해당 topic으로 onSelectTopic이 호출된다', async () => {
    const user = userEvent.setup();
    const onSelectTopic = vi.fn();
    render(<LearningMap topics={topics} selectedTopicId={null} onSelectTopic={onSelectTopic} />);

    await user.click(screen.getByText('단순 연결 리스트'));

    expect(onSelectTopic).toHaveBeenCalledWith(expect.objectContaining({ topicId: 2, title: '단순 연결 리스트' }));
  });

  it('selectedTopicId와 일치하는 행만 선택 표시를 한다', () => {
    render(<LearningMap topics={topics} selectedTopicId={2} onSelectTopic={vi.fn()} />);

    expect(screen.getByText('단순 연결 리스트').closest('.learning-map-row')).toHaveClass('selected');
    expect(screen.getByText('연결 리스트').closest('.learning-map-row')).not.toHaveClass('selected');
  });
});
