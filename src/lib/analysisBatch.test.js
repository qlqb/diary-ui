/**
 * 묶음 문구의 규칙.
 *
 * 가장 중요한 것: <처리 진행률 100%>는 "전부 성공"이 아니다. 끝났을 때의 문장이 성공/실패/제외를
 * 나눠 말하는지 여기서 고정한다 — 이것이 무너지면 사용자는 안 된 파일을 됐다고 믿는다.
 */
import { describe, it, expect } from 'vitest';
import {
  describeBatch, describeEstimate, describeRemaining, estimateBasisNote, formatBytes,
  formatSecondsRange, isBatchOpen, isSettledStage,
} from './analysisBatch.js';

describe('시간 문구', () => {
  it('분 단위 범위로 말하고 초 단위로 말하지 않는다', () => {
    expect(formatSecondsRange(180, 300)).toBe('약 3~5분');
    expect(formatSecondsRange(240, 240)).toBe('약 4분');
    expect(formatSecondsRange(20, 40)).toBe('1분 안쪽');
  });

  it('범위가 없으면 지어내지 않는다', () => {
    expect(formatSecondsRange(null, null)).toBeNull();
  });

  it('표본이 적으면 초기 추정이라고 붙일 수 있게 한다', () => {
    expect(estimateBasisNote('DEFAULT')).toBe('아직 초기 추정이에요');
    expect(estimateBasisNote('PARTIAL_HISTORY')).toBe('아직 초기 추정이에요');
    expect(estimateBasisNote('HISTORY')).toBeNull();
  });

  it('시작 전 안내는 개수와 범위를 함께 말한다', () => {
    expect(describeEstimate({
      estimableCount: 5, unestimableCount: 0, minSeconds: 180, maxSeconds: 300,
    })).toBe('자료 5개 · 예상 분석 약 3~5분');
  });

  it('추정할 수 없으면 개수만 말한다', () => {
    expect(describeEstimate({
      estimableCount: 0, unestimableCount: 1, minSeconds: null, maxSeconds: null,
    })).toBe('자료 1개');
  });
});

describe('묶음 요약', () => {
  it('끝났으면 성공과 안 된 것을 나눠 말한다 — "다 됐어요"가 아니다', () => {
    expect(describeBatch({
      status: 'FINISHED', itemCount: 5, doneCount: 4, failedCount: 1, skippedCount: 0,
    })).toBe('처리 종료 · 4개 성공 / 1개 실패');
  });

  it('제외된 것도 따로 센다', () => {
    expect(describeBatch({
      status: 'FINISHED', itemCount: 5, doneCount: 3, failedCount: 1, skippedCount: 1,
    })).toBe('처리 종료 · 3개 성공 / 1개 실패 / 1개 제외');
  });

  it('도는 중에는 몇 개가 어디 있는지 말한다', () => {
    expect(describeBatch({
      status: 'ANALYZING', itemCount: 5, doneCount: 3, runningCount: 1, waitingCount: 1,
      failedCount: 0, skippedCount: 0,
    })).toBe('5개 중 3개 완료 · 1개 분석 중 · 1개 대기');
  });
});

describe('남은 시간', () => {
  it('기다리는 이유가 따로 있으면 시간 대신 그 이유를 말한다', () => {
    const copy = () => ({ detail: '오늘 분석 한도에 닿아 대기 중이에요' });
    expect(describeRemaining(
      { status: 'ANALYZING', waitingReason: 'DAILY_LIMIT', remainingMinSeconds: 60 }, copy,
    )).toBe('오늘 분석 한도에 닿아 대기 중이에요');
  });

  it('끝난 묶음에는 남은 시간이 없다', () => {
    expect(describeRemaining({ status: 'FINISHED', remainingMinSeconds: 60 }, () => null)).toBeNull();
  });

  it('범위를 모르면 아무 말도 하지 않는다', () => {
    expect(describeRemaining({ status: 'ANALYZING' }, () => null)).toBeNull();
  });
});

describe('상태 판정', () => {
  it('끝난 단계는 성공이든 아니든 처리 완료로 본다', () => {
    expect(isSettledStage('DONE')).toBe(true);
    expect(isSettledStage('FAILED')).toBe(true);
    expect(isSettledStage('UNSUPPORTED')).toBe(true);
    expect(isSettledStage('ANALYZING')).toBe(false);
    expect(isSettledStage('QUEUED')).toBe(false);
  });

  it('끝난 묶음은 더 지켜보지 않는다', () => {
    expect(isBatchOpen({ status: 'ANALYZING' })).toBe(true);
    expect(isBatchOpen({ status: 'FINISHED' })).toBe(false);
    expect(isBatchOpen(null)).toBe(false);
  });
});

describe('크기 표시', () => {
  it('사람이 읽는 단위로', () => {
    expect(formatBytes(512)).toBe('512B');
    expect(formatBytes(2048)).toBe('2KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0MB');
  });
});

describe('확인하지 못한 묶음', () => {
  it('마지막으로 확인한 값이라고 말하고 끝났다고 하지 않는다', () => {
    const text = describeBatch({
      unknown: true, status: 'ANALYZING', itemCount: 5, doneCount: 2, processedPercent: 40,
    });
    expect(text).toContain('확인하지 못했어요');
    expect(text).toContain('마지막 확인');
    expect(text).not.toContain('처리 종료');
  });
});
