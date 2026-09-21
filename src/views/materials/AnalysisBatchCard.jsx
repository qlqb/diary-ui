/**
 * 분석 묶음 하나의 진행 카드.
 *
 * 화면이 지켜야 하는 것 넷:
 *  1. 진행률은 <처리> 진행률이다. 100%가 "전부 성공"이 아니라는 것을 글자로 말한다.
 *  2. 남은 시간은 갱신되지만, 시간이 지났다고 완료로 바뀌지 않는다. 기다리는 이유가 따로 있으면
 *     (한도·일시중지·연결) 시간 대신 그 이유를 보여준다.
 *  3. 실패한 자료만 다시 시도할 수 있다. 성공한 자료는 건드리지 않는다.
 *  4. 여기 머물러야 할 이유가 없다 — "다른 화면으로 가도 계속돼요"를 말하고 돌아가기를 준다.
 */

import { useState } from 'react';
import { CheckCircle2, Loader2, AlertCircle, Clock, RotateCcw, X } from 'lucide-react';
import { materialAnalysisStatusAPI } from '../../api/api.js';
import {
  BATCH_STAGE_LABEL, LEAVE_OK_NOTE, UPLOAD_TIME_NOTE,
  describeBatch, describeRemaining, formatBytes,
} from '../../lib/analysisBatch.js';
import { waitingCopy } from '../../lib/materialStages.js';

function StageIcon({ stage }) {
  if (stage === 'DONE') return <CheckCircle2 size={14} className="batch-item-icon is-done" />;
  if (stage === 'ANALYZING' || stage === 'UPLOADING') {
    return <Loader2 size={14} className="batch-item-icon spin" />;
  }
  if (['FAILED', 'UPLOAD_FAILED'].includes(stage)) {
    return <AlertCircle size={14} className="batch-item-icon is-problem" />;
  }
  return <Clock size={14} className="batch-item-icon" />;
}

export default function AnalysisBatchCard({
  batch, onRefresh = null, onDismiss = null, onAddMore = null, onBack = null, backLabel = '프로젝트로 돌아가기',
}) {
  const [retrying, setRetrying] = useState(null);
  const [error, setError] = useState(null);

  if (!batch) return null;

  const finished = batch.status === 'FINISHED';
  const remaining = describeRemaining(batch, (reason, ctx) => waitingCopy(reason, ctx));

  const retry = async (item) => {
    if (!item.materialId) return;
    setRetrying(item.itemId);
    setError(null);
    try {
      await materialAnalysisStatusAPI.retry(item.materialId);
      await onRefresh?.();
    } catch (err) {
      setError(err.message || '다시 시도하지 못했어요.');
    } finally {
      setRetrying(null);
    }
  };

  return (
    <section className={`analysis-batch${finished ? ' is-finished' : ''}`}
      aria-label={finished ? '자료 분석 결과' : '자료 분석 진행 상황'}>
      <div className="analysis-batch-head">
        <div>
          <p className="analysis-batch-title">
            {finished ? '자료 분석이 끝났어요' : '자료 분석 중'}
            <span className="analysis-batch-count"> · 처리 진행률 {batch.processedPercent}%</span>
          </p>
          <p className="analysis-batch-sub">{describeBatch(batch)}</p>
        </div>
        {onDismiss && finished && (
          <button type="button" className="batch-close" aria-label="이 결과 닫기"
            onClick={() => onDismiss(batch.batchId)}>
            <X size={15} />
          </button>
        )}
      </div>

      <div className="analysis-batch-bar" role="progressbar" aria-valuenow={batch.processedPercent}
        aria-valuemin={0} aria-valuemax={100}
        aria-label={`처리 진행률 ${batch.processedPercent}퍼센트`}>
        <span className="analysis-batch-bar-fill" style={{ width: `${batch.processedPercent}%` }} />
      </div>

      {!finished && (
        <p className="analysis-batch-meta">
          {batch.currentStage && <>현재 단계: {batch.currentStage}</>}
          {remaining && <> · {remaining}</>}
        </p>
      )}
      {!finished && <p className="analysis-batch-note">{LEAVE_OK_NOTE} · {UPLOAD_TIME_NOTE}</p>}

      <ul className="analysis-batch-list">
        {(batch.items ?? []).map((item) => (
          <li key={item.itemId} className={`batch-item is-${item.stage.toLowerCase()}`}>
            <StageIcon stage={item.stage} />
            <span className="batch-item-name" title={item.filename}>{item.filename}</span>
            <span className="batch-item-size">{formatBytes(item.sizeBytes)}</span>
            <span className="batch-item-stage">
              {BATCH_STAGE_LABEL[item.stage] ?? item.stage}
              {item.stage === 'ANALYZING' && item.totalChunks
                ? ` ${item.completedChunks ?? 0}/${item.totalChunks}` : ''}
            </span>
            {item.retryable && item.materialId && (
              <button type="button" className="btn-ghost btn-sm" disabled={retrying === item.itemId}
                onClick={() => retry(item)}>
                <RotateCcw size={12} /> 다시
              </button>
            )}
            {item.message && <p className="batch-item-message">{item.message}</p>}
          </li>
        ))}
      </ul>

      {error && <p className="view-error">{error}</p>}

      <div className="analysis-batch-actions">
        {onAddMore && (
          <button type="button" className="btn-ghost btn-sm" onClick={onAddMore}>새 자료 추가</button>
        )}
        {onBack && (
          <button type="button" className="btn-primary btn-sm" onClick={onBack}>{backLabel}</button>
        )}
      </div>
    </section>
  );
}
