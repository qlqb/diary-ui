/**
 * 업로드·분석 묶음의 문구와 계산. 순수 함수만 둔다.
 *
 * ★ 진행률·남은 시간은 여기서 만들지 않는다. 전부 서버가 준 값을 <읽어서> 문장으로 바꿀 뿐이다.
 *   브라우저 타이머로 진행률을 올리면 실제로는 멈춰 있는데 화면만 차오르고, 탭을 옮기면
 *   그 숫자가 사라진다.
 */

/** 초 → "약 3~5분" / "1분 안쪽" / "약 40초~1분". 범위가 없으면 null. */
export function formatSecondsRange(minSeconds, maxSeconds) {
  if (minSeconds == null && maxSeconds == null) return null;
  const lo = Math.max(0, minSeconds ?? maxSeconds ?? 0);
  const hi = Math.max(lo, maxSeconds ?? minSeconds ?? 0);
  if (hi < 60) return '1분 안쪽';
  const loMin = Math.max(1, Math.round(lo / 60));
  const hiMin = Math.max(loMin, Math.round(hi / 60));
  return loMin === hiMin ? `약 ${loMin}분` : `약 ${loMin}~${hiMin}분`;
}

/** 바이트 → "1.2MB". 자료함 목록과 같은 규칙. */
export function formatBytes(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * 추정 근거 → 화면에 붙일 한마디.
 *
 * DEFAULT·PARTIAL_HISTORY일 때 "초기 추정"이라고 말하는 이유: 지난 실행이 몇 건뿐이면
 * 숫자가 실제와 꽤 다를 수 있다. 정밀해 보이는 숫자를 근거 없이 내밀지 않는다.
 */
export function estimateBasisNote(basis) {
  switch (basis) {
    case 'HISTORY':
      return null;
    case 'PARTIAL_HISTORY':
    case 'DEFAULT':
      return '아직 초기 추정이에요';
    default:
      return null;
  }
}

/** 시작 전 안내 한 줄. "자료 5개 · 예상 약 3~5분" — 숫자는 서버가 준 범위 그대로. */
export function describeEstimate(estimate) {
  if (!estimate) return null;
  const count = estimate.estimableCount + estimate.unestimableCount;
  const range = formatSecondsRange(estimate.minSeconds, estimate.maxSeconds);
  const parts = [`자료 ${count}개`];
  if (range) parts.push(`예상 분석 ${range}`);
  return parts.join(' · ');
}

/** 자리 하나의 단계 → 글자. 색과 무관하게 이 글자만으로 상태를 알 수 있어야 한다. */
export const BATCH_STAGE_LABEL = Object.freeze({
  STAGED: '대기',
  UPLOADING: '올리는 중',
  QUEUED: '차례 대기',
  ANALYZING: '내용 분석',
  DONE: '완료',
  PARTIAL: '일부 완료',
  FAILED: '안 됨',
  NO_TEXT: '본문을 읽지 못함',
  UNSUPPORTED: '분석할 수 없는 형식',
  UPLOAD_FAILED: '올리지 못함',
  PAUSED: '멈춤',
  CANCELLED: '취소됨',
});

/** 처리가 끝난 단계인가. 끝났다고 성공은 아니다. */
export function isSettledStage(stage) {
  return ['DONE', 'PARTIAL', 'FAILED', 'NO_TEXT', 'UNSUPPORTED', 'UPLOAD_FAILED', 'CANCELLED'].includes(stage);
}

/**
 * 묶음의 머리말.
 *
 * 끝났으면 "다 됐어요"가 아니라 <무엇이 됐고 무엇이 안 됐는지>를 말한다 — 100%는
 * "처리가 끝났다"는 뜻이지 "전부 성공했다"는 뜻이 아니다.
 */
export function describeBatch(batch) {
  if (!batch) return null;
  const { doneCount = 0, failedCount = 0, skippedCount = 0, runningCount = 0, waitingCount = 0 } = batch;
  if (batch.status === 'FINISHED') {
    const parts = [`처리 종료 · ${doneCount}개 성공`];
    if (failedCount > 0) parts.push(`${failedCount}개 실패`);
    if (skippedCount > 0) parts.push(`${skippedCount}개 제외`);
    return parts.join(' / ');
  }
  const parts = [`${batch.itemCount}개 중 ${doneCount}개 완료`];
  if (runningCount > 0) parts.push(`${runningCount}개 분석 중`);
  if (waitingCount > 0) parts.push(`${waitingCount}개 대기`);
  if (failedCount + skippedCount > 0) parts.push(`${failedCount + skippedCount}개 안 됨`);
  return parts.join(' · ');
}

/**
 * 남은 시간 한 줄. 기다리는 이유가 따로 있으면(한도·일시중지·연결) 시간 대신 그 이유를 말한다 —
 * 시간이 지났다는 이유만으로 끝난 것처럼 보이면 안 되기 때문이다.
 */
export function describeRemaining(batch, waitingCopyFn) {
  if (!batch || batch.status === 'FINISHED') return null;
  if (batch.waitingReason) {
    const copy = waitingCopyFn?.(batch.waitingReason, { resumesAt: batch.resumesAt });
    if (copy?.detail) return copy.detail;
  }
  const range = formatSecondsRange(batch.remainingMinSeconds, batch.remainingMaxSeconds);
  if (!range) return null;
  return `${range} 남음`;
}

/** 이 묶음이 아직 도는가. 폴링을 계속할지 정한다. */
export function isBatchOpen(batch) {
  return !!batch && batch.status !== 'FINISHED' && batch.status !== 'ABANDONED';
}

/** 업로드 시간은 예상에 들어 있지 않다. 어디서든 같은 문장을 쓴다. */
export const UPLOAD_TIME_NOTE = '올리는 데 걸리는 시간은 따로예요';

/** 분석 중에도 다른 화면으로 갈 수 있다는 말. */
export const LEAVE_OK_NOTE = '다른 화면으로 가도 분석은 계속돼요';
