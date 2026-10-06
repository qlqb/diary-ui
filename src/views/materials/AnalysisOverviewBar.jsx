/**
 * 자료함 상단의 자동 분석 상태 한 줄. "분석 중 2 · 대기 5 · 완료 16" + [일시중지]/[재개].
 *
 * 설정 화면이 아니다 — 자동 분석은 기본 동작이고 여기서는 멈추거나 다시 켤 수만 있다.
 * 모델이 설정돼 있지 않으면 그 사실을 말한다(등록은 유지되고 처리만 멈춰 있다).
 *
 * 오늘 한도에 닿았으면 그 사실과 언제 이어지는지를 말한다. 한도 대기는 실패도 영구 정지도 아니라서
 * 경고 칩을 쓰지 않고, 기다리는 자료가 있는 동안에는 "승인 전에도 상담·계획은 된다"를 함께 적는다 —
 * 분석을 다 기다려야 시작할 수 있다고 읽히면 안 된다.
 */

import { Pause, Play } from 'lucide-react';
import { CONSULT_BEFORE_APPROVAL, dailyLimitCopy } from '../../lib/materialStages.js';
import '../../styles/material-status.css';

export default function AnalysisOverviewBar({ overview, error, onPause, onResume, busy = false }) {
  if (error) {
    return <p className="analysis-overview view-dim">{error}</p>;
  }
  if (!overview) return null;
  const parts = [];
  if (overview.running) parts.push(`분석 중 ${overview.running}`);
  if (overview.queued) parts.push(`대기 ${overview.queued}`);
  if (overview.partial) parts.push(`일부 완료 ${overview.partial}`);
  if (overview.done) parts.push(`완료 ${overview.done}`);
  if (overview.failed) parts.push(`다시 시도 필요 ${overview.failed}`);
  if (overview.unavailable) parts.push(`사용 불가 ${overview.unavailable}`);

  const limit = overview.limit ?? null;
  const limitReached = limit?.reached === true
    || (overview.materials ?? []).some((m) => m.waitingReason === 'DAILY_LIMIT');
  const hasUnfinished = Boolean(overview.running || overview.queued || limitReached);

  return (
    <div className="analysis-overview">
      <span className="analysis-overview-text">
        <strong>자동 분석</strong>
        {' · '}
        {parts.length > 0 ? parts.join(' · ') : '분석할 자료가 없어요'}
        {overview.paused && <span className="chip chip-status">일시중지됨 · 재개하면 이어서 처리해요</span>}
        {overview.serviceAvailable === false && (
          <span className="chip chip-warn">지금은 분석 서비스를 쓸 수 없어요 · 대기 목록은 유지돼요</span>
        )}
      </span>
      {overview.paused ? (
        <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={onResume}>
          <Play size={13} /> 재개
        </button>
      ) : (
        <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={onPause}>
          <Pause size={13} /> 일시중지
        </button>
      )}
      {limitReached && (
        <p className="analysis-waiting-note analysis-overview-limit" role="status">
          {dailyLimitCopy(limit?.resumesAt ?? null)}
          {limit?.contentLimit != null && ` (오늘 ${limit.contentUsed ?? 0}/${limit.contentLimit}개 분석)`}
        </p>
      )}
      {hasUnfinished && <p className="analysis-overview-consult">{CONSULT_BEFORE_APPROVAL}</p>}
    </div>
  );
}
