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

  it('원본 자료가 남아 있으면 파일명을 그대로 보여준다', () => {
    render(
      <TopicDetail
        courseTitle="자료구조"
        topic={{ ...topic, sourceMaterialFilename: '강의계획서.pdf', sourceMaterialDeleted: false }}
        onProgressChanged={vi.fn()}
        onStartTutor={vi.fn()}
      />,
    );

    expect(screen.getByText('강의계획서.pdf')).toBeInTheDocument();
    expect(screen.queryByText(/원본 삭제됨/)).not.toBeInTheDocument();
  });

  it('원본을 삭제했어도 어디서 온 항목인지는 계속 보여준다', () => {
    // 확정된 학습 내용은 자료를 지워도 남는다. 출처 표시가 같이 사라지면
    // "이게 어디서 왔더라"를 영영 알 수 없게 된다.
    render(
      <TopicDetail
        courseTitle="자료구조"
        topic={{ ...topic, sourceMaterialFilename: '강의계획서.pdf', sourceMaterialDeleted: true }}
        onProgressChanged={vi.fn()}
        onStartTutor={vi.fn()}
      />,
    );

    expect(screen.getByText(/원본 삭제됨 · 강의계획서\.pdf/)).toBeInTheDocument();
  });

  it('연결된 원본 자료가 없으면 없다고 적는다', () => {
    render(<TopicDetail courseTitle="자료구조" topic={topic} onProgressChanged={vi.fn()} onStartTutor={vi.fn()} />);

    expect(screen.getByText('연결된 원본 자료가 없어요.')).toBeInTheDocument();
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

  it('계층 경로를 과목 이름부터 조상 topic까지 이어서 보여준다', () => {
    const ancestors = [
      { topicId: 100, title: '자료구조 기초', sourceLocator: null },
      { topicId: 101, title: '추상 자료형과 성능 분석', sourceLocator: '2장' },
    ];
    const { container } = render(
      <TopicDetail courseTitle="자료구조" ancestors={ancestors} topic={topic} onProgressChanged={vi.fn()} onStartTutor={vi.fn()} />,
    );

    const pathText = container.querySelector('.topic-detail-path').textContent;
    expect(pathText).toContain('자료구조');
    expect(pathText).toContain('자료구조 기초');
    expect(pathText).toContain('추상 자료형과 성능 분석');
  });

  it('별도 AI 호출 없이, 이미 저장된 하위 topic을 "이 주제에서 배울 내용"으로 보여준다', () => {
    const parentTopic = {
      ...topic,
      title: '알고리즘 복잡도 분석',
      children: [
        { topicId: 30, title: '시간 복잡도' },
        { topicId: 31, title: '공간 복잡도' },
      ],
    };
    render(<TopicDetail courseTitle="자료구조" topic={parentTopic} onProgressChanged={vi.fn()} onStartTutor={vi.fn()} />);

    expect(screen.getByText('이 주제에서 배울 내용')).toBeInTheDocument();
    expect(screen.getByText('시간 복잡도')).toBeInTheDocument();
    expect(screen.getByText('공간 복잡도')).toBeInTheDocument();
  });

  it('하위 topic이 없으면 "이 주제에서 배울 내용" 섹션을 보여주지 않는다', () => {
    render(<TopicDetail courseTitle="자료구조" topic={{ ...topic, children: [] }} onProgressChanged={vi.fn()} onStartTutor={vi.fn()} />);

    expect(screen.queryByText('이 주제에서 배울 내용')).not.toBeInTheDocument();
  });

  it('AI_DERIVED topic은 원문 근거 대신 상위 근거를 보여준다', () => {
    const ancestors = [{ topicId: 100, title: '연결 리스트', sourceLocator: '3장' }];
    render(
      <TopicDetail courseTitle="자료구조" ancestors={ancestors} topic={topic} onProgressChanged={vi.fn()} onStartTutor={vi.fn()} />,
    );

    expect(screen.getByText(/상위 근거: 연결 리스트/)).toBeInTheDocument();
  });
});
