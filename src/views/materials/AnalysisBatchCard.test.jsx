/**
 * 분석 진행 카드.
 *
 * 고정하는 것:
 *  - 100%는 "처리가 끝났다"이지 "전부 성공했다"가 아니다. 글자가 그 차이를 말한다.
 *  - 실패한 자료만 다시 시도할 수 있다. 성공한 자료에는 그 버튼이 없다.
 *  - 기다리는 이유가 따로 있으면(한도) 남은 시간 대신 그 이유를 보여준다.
 *  - 여기 머무를 필요가 없다는 것을 말하고, 돌아갈 길과 더 올릴 길을 준다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../api/api.js', () => ({
  materialAnalysisStatusAPI: { retry: vi.fn() },
}));

import AnalysisBatchCard from './AnalysisBatchCard.jsx';
import { materialAnalysisStatusAPI } from '../../api/api.js';

const item = (overrides) => ({
  itemId: 1, filename: 'a.pdf', sizeBytes: 1024, extension: 'pdf', materialId: 11,
  uploadState: 'UPLOADED', stage: 'QUEUED', stageLabel: '차례 대기',
  totalChunks: null, completedChunks: null, message: null, settled: false, retryable: false,
  ...overrides,
});

const batch = (overrides = {}) => ({
  batchId: 5, courseId: null, status: 'ANALYZING', itemCount: 2, processedPercent: 50,
  doneCount: 1, runningCount: 1, waitingCount: 0, failedCount: 0, skippedCount: 0,
  currentStage: '내용 분석', remainingMinSeconds: 60, remainingMaxSeconds: 180,
  estimateBasis: 'DEFAULT', uploadTimeExcluded: true, waitingReason: null, resumesAt: null,
  items: [item({ itemId: 1, stage: 'DONE', settled: true }), item({ itemId: 2, filename: 'b.pdf', stage: 'ANALYZING' })],
  ...overrides,
});

beforeEach(() => vi.clearAllMocks());

describe('진행 중', () => {
  it('처리 진행률과 단계·남은 시간을 보여 준다', () => {
    render(<AnalysisBatchCard batch={batch()} />);

    expect(screen.getByText(/처리 진행률 50%/)).toBeInTheDocument();
    expect(screen.getByText('2개 중 1개 완료 · 1개 분석 중')).toBeInTheDocument();
    expect(screen.getByText(/현재 단계: 내용 분석/)).toBeInTheDocument();
    expect(screen.getByText(/약 1~3분 남음/)).toBeInTheDocument();
  });

  it('여기 머물지 않아도 된다는 것과 전송 시간이 따로라는 것을 말한다', () => {
    render(<AnalysisBatchCard batch={batch()} />);

    expect(screen.getByText(/다른 화면으로 가도 분석은 계속돼요/)).toBeInTheDocument();
    expect(screen.getByText(/올리는 데 걸리는 시간은 따로예요/)).toBeInTheDocument();
  });

  it('한도로 기다리는 중이면 남은 시간 대신 그 이유를 보여 준다', () => {
    render(<AnalysisBatchCard batch={batch({ waitingReason: 'DAILY_LIMIT', resumesAt: null })} />);

    expect(screen.getByText(/오늘 분석 한도에 닿아 대기 중이에요/)).toBeInTheDocument();
    expect(screen.queryByText(/남음/)).not.toBeInTheDocument();
  });

  it('진행 막대에 접근 가능한 값이 실린다', () => {
    render(<AnalysisBatchCard batch={batch()} />);

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '50');
    expect(bar).toHaveAccessibleName('처리 진행률 50퍼센트');
  });
});

describe('끝난 뒤', () => {
  it('100%를 전부 성공으로 말하지 않는다', () => {
    render(<AnalysisBatchCard batch={batch({
      status: 'FINISHED', processedPercent: 100, doneCount: 1, failedCount: 1,
      currentStage: null, remainingMinSeconds: null, remainingMaxSeconds: null,
      items: [
        item({ itemId: 1, stage: 'DONE', settled: true }),
        item({ itemId: 2, filename: 'b.pdf', stage: 'FAILED', settled: true, retryable: true,
          message: '모델 호출에 실패했어요' }),
      ],
    })} />);

    expect(screen.getByText('처리 종료 · 1개 성공 / 1개 실패')).toBeInTheDocument();
    expect(screen.getByText('모델 호출에 실패했어요')).toBeInTheDocument();
    // 끝났으므로 남은 시간·단계는 말하지 않는다.
    expect(screen.queryByText(/현재 단계/)).not.toBeInTheDocument();
  });

  it('실패한 자료만 다시 시도할 수 있다', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    materialAnalysisStatusAPI.retry.mockResolvedValue({});
    render(<AnalysisBatchCard onRefresh={onRefresh} batch={batch({
      status: 'FINISHED', processedPercent: 100,
      items: [
        item({ itemId: 1, stage: 'DONE', settled: true }),
        item({ itemId: 2, materialId: 22, filename: 'b.pdf', stage: 'FAILED', settled: true, retryable: true }),
      ],
    })} />);

    const retries = screen.getAllByRole('button', { name: /다시/ });
    expect(retries).toHaveLength(1);
    await user.click(retries[0]);

    expect(materialAnalysisStatusAPI.retry).toHaveBeenCalledWith(22);
    expect(onRefresh).toHaveBeenCalled();
  });

  it('돌아가기와 새 자료 추가를 준다', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const onAddMore = vi.fn();
    render(<AnalysisBatchCard batch={batch()} onBack={onBack} onAddMore={onAddMore}
      backLabel="프로젝트로 돌아가기" />);

    await user.click(screen.getByRole('button', { name: '프로젝트로 돌아가기' }));
    await user.click(screen.getByRole('button', { name: '새 자료 추가' }));

    expect(onBack).toHaveBeenCalled();
    expect(onAddMore).toHaveBeenCalled();
  });

  it('본문을 못 읽은 파일은 실패가 아니라 제외로 센다', () => {
    render(<AnalysisBatchCard batch={batch({
      status: 'FINISHED', processedPercent: 100, doneCount: 1, failedCount: 0, skippedCount: 1,
      items: [
        item({ itemId: 1, stage: 'DONE', settled: true }),
        item({ itemId: 2, filename: '스캔본.pdf', uploadState: 'NO_TEXT', stage: 'NO_TEXT', settled: true }),
      ],
    })} />);

    expect(screen.getByText('처리 종료 · 1개 성공 / 1개 제외')).toBeInTheDocument();
    expect(screen.getByText('본문을 읽지 못함')).toBeInTheDocument();
  });
});
