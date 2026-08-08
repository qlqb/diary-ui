import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RecommendationPanel from './RecommendationPanel.jsx';
import { learningRecommendationAPI, planningAPI } from '../../api/api.js';

vi.mock('../../api/api.js', () => ({
  learningRecommendationAPI: {
    recommend: vi.fn(),
  },
  planningAPI: {
    createDraft: vi.fn(),
    apply: vi.fn(),
  },
}));

const recommendation = {
  recommendationId: 10,
  topicId: 2,
  topicTitle: '이중 연결 리스트',
  activityType: 'NEW_LEARNING',
  recommendedMinutesIdeal: 45,
  reason: '단순/원형을 이미 마쳤으니 다음 단계로 적절합니다.',
};

const draft = {
  recommendationId: 10,
  proposalId: 99,
  horizonStart: '2026-08-09',
  horizonEnd: '2026-08-15',
  preview: {
    placedItems: [
      {
        proposalItemId: 1,
        title: '이중 연결 리스트 학습',
        scheduledDate: '2026-08-09',
        scheduledStartAt: '2026-08-09T10:00:00',
        scheduledEndAt: '2026-08-09T10:45:00',
        reason: '구체적인 근거가 없어 기본 활동 시간대에 배치했어요',
      },
    ],
    unplacedItems: [],
  },
};

describe('RecommendationPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('WHAT과 WHEN을 분리한다 — 추천만 받았을 때는 아직 계획 초안을 만들지 않는다', async () => {
    const user = userEvent.setup();
    learningRecommendationAPI.recommend.mockResolvedValue(recommendation);

    render(<RecommendationPanel courseId={1} onApplied={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '다음 학습 추천 받기' }));

    expect(await screen.findByText('이중 연결 리스트')).toBeInTheDocument();
    expect(planningAPI.createDraft).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '이번 주로 계획하기' })).toBeInTheDocument();
  });

  it('추천 -> 계획 초안 -> Apply 흐름에서 Apply를 누르기 전까지는 적용되지 않는다', async () => {
    const user = userEvent.setup();
    learningRecommendationAPI.recommend.mockResolvedValue(recommendation);
    planningAPI.createDraft.mockResolvedValue(draft);
    const onApplied = vi.fn().mockResolvedValue(undefined);

    render(<RecommendationPanel courseId={1} onApplied={onApplied} />);

    await user.click(screen.getByRole('button', { name: '다음 학습 추천 받기' }));
    await screen.findByText('이중 연결 리스트');

    await user.click(screen.getByRole('button', { name: '이번 주로 계획하기' }));
    expect(await screen.findByText(/계획 초안/)).toBeInTheDocument();
    expect(planningAPI.apply).not.toHaveBeenCalled();
    expect(onApplied).not.toHaveBeenCalled();

    planningAPI.apply.mockResolvedValue({});
    const originalAlert = window.alert;
    window.alert = vi.fn();
    await user.click(screen.getByRole('button', { name: '이 계획 적용하기' }));

    expect(planningAPI.apply).toHaveBeenCalledWith(99);
    expect(onApplied).toHaveBeenCalled();
    window.alert = originalAlert;
  });

  it('사용자가 입력한 자연어 지시를 계획 생성 요청에 그대로 전달한다', async () => {
    const user = userEvent.setup();
    learningRecommendationAPI.recommend.mockResolvedValue(recommendation);
    planningAPI.createDraft.mockResolvedValue(draft);

    render(<RecommendationPanel courseId={1} onApplied={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '다음 학습 추천 받기' }));
    await screen.findByText('이중 연결 리스트');

    await user.type(
      screen.getByPlaceholderText(/이번 주에 공부하게 계획해줘/),
      '이번 주에 공부하게 계획해줘',
    );
    await user.click(screen.getByRole('button', { name: '이번 주로 계획하기' }));

    expect(planningAPI.createDraft).toHaveBeenCalledWith(10, '이번 주에 공부하게 계획해줘');
  });
});
