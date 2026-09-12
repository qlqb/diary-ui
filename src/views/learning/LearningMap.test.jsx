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

describe('LearningMap - 기본 펼침 규칙', () => {
  const multiChapterTopics = [
    {
      topicId: 1,
      title: '자료구조 기초',
      progressStatus: 'LEARNED',
      children: [
        { topicId: 2, title: 'ADT의 이해', progressStatus: 'LEARNED', children: [] },
      ],
    },
    {
      topicId: 10,
      title: '추상 자료형과 성능 분석',
      progressStatus: 'NOT_STARTED',
      children: [
        { topicId: 11, title: '알고리즘 복잡도', progressStatus: 'IN_PROGRESS', children: [] },
      ],
    },
    {
      topicId: 20,
      title: '재귀',
      progressStatus: 'NOT_STARTED',
      children: [
        { topicId: 21, title: '재귀 호출의 이해', progressStatus: 'NOT_STARTED', children: [] },
      ],
    },
  ];

  it('현재 학습 중(IN_PROGRESS)인 branch만 자동으로 펼치고, 나머지 chapter는 접힌 채로 시작한다', () => {
    render(<LearningMap topics={multiChapterTopics} selectedTopicId={null} onSelectTopic={vi.fn()} />);

    // "추상 자료형과 성능 분석" 안에 IN_PROGRESS인 "알고리즘 복잡도"가 있으므로 펼쳐진다.
    expect(screen.getByText('알고리즘 복잡도')).toBeInTheDocument();
    // "자료구조 기초"와 "재귀"는 현재 학습 중인 topic이 없으므로 접힌 채로 시작한다.
    expect(screen.queryByText('ADT의 이해')).not.toBeInTheDocument();
    expect(screen.queryByText('재귀 호출의 이해')).not.toBeInTheDocument();
  });

  it('selectedTopicId가 있는 branch도 자동으로 펼쳐진다', () => {
    render(<LearningMap topics={multiChapterTopics} selectedTopicId={21} onSelectTopic={vi.fn()} />);

    expect(screen.getByText('재귀 호출의 이해')).toBeInTheDocument();
    expect(screen.queryByText('ADT의 이해')).not.toBeInTheDocument();
  });

  it('사용자가 직접 접은 branch는 다른 topic을 선택해도 접힌 상태를 유지한다', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <LearningMap topics={multiChapterTopics} selectedTopicId={11} onSelectTopic={vi.fn()} />,
    );
    expect(screen.getByText('알고리즘 복잡도')).toBeInTheDocument();

    // 자동으로 펼쳐진 branch를 사용자가 직접 접는다.
    const row = screen.getByText('추상 자료형과 성능 분석').closest('.learning-map-row');
    await user.click(row.querySelector('.learning-map-toggle'));
    expect(screen.queryByText('알고리즘 복잡도')).not.toBeInTheDocument();

    // 다른 topic("재귀 호출의 이해")을 선택해도 방금 수동으로 접은 branch는 다시 펼쳐지지 않는다.
    rerender(<LearningMap topics={multiChapterTopics} selectedTopicId={21} onSelectTopic={vi.fn()} />);
    expect(screen.queryByText('알고리즘 복잡도')).not.toBeInTheDocument();
    expect(screen.getByText('재귀 호출의 이해')).toBeInTheDocument();
  });
});
