/**
 * 자료 하나의 자동 분석 상태 칩. 색만으로 전하지 않고 문구가 있다.
 *
 * 진행 중이면 "분석 중 2/5"처럼 청크 진행을 붙이고, 일부 완료면 어디까지 읽었는지(서버 메시지)를
 * title로 둔다. 다시 시도가 의미 있는 상태(다시 시도 필요·사용 불가·일부 완료)에서만 버튼을 보인다.
 */

import { Loader2, RotateCcw } from 'lucide-react';
import { analysisStateLabel } from '../lib/analysisLabels.js';

export default function AnalysisStatusChip({ status, onRetry = null, busy = false }) {
  if (!status) return null;
  const { label, tone } = analysisStateLabel(status.state);
  const progress = status.state === 'RUNNING' && status.totalChunks
    ? ` ${status.completedChunks ?? 0}/${status.totalChunks}`
    : '';
  const retryable = ['FAILED', 'UNAVAILABLE', 'PARTIAL', 'CANCELLED'].includes(status.state);
  const detail = status.message
    || (status.state === 'DONE' && status.sectionCount != null ? `구간 ${status.sectionCount}개` : '');

  return (
    <span className="analysis-status">
      <span className={`chip chip-${tone}`} title={detail || undefined} aria-label={`분석 상태: ${label}${progress}`}>
        {status.state === 'RUNNING' && <Loader2 size={12} className="spin" />}
        {label}{progress}
      </span>
      {status.state === 'DONE' && status.sectionCount > 0 && (
        <span className="analysis-status-detail">구간 {status.sectionCount}개</span>
      )}
      {retryable && onRetry && (
        <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={onRetry}
          aria-label="분석 다시 시도">
          <RotateCcw size={12} /> 다시 시도
        </button>
      )}
    </span>
  );
}
