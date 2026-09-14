/**
 * 자료함 상단의 자동 분석 상태 한 줄. "분석 중 2 · 대기 5 · 완료 16" + [일시중지]/[재개].
 *
 * 설정 화면이 아니다 — 자동 분석은 기본 동작이고 여기서는 멈추거나 다시 켤 수만 있다.
 * 모델이 설정돼 있지 않으면 그 사실을 말한다(등록은 유지되고 처리만 멈춰 있다).
 */

import { Pause, Play } from 'lucide-react';

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

  return (
    <div className="analysis-overview">
      <span className="analysis-overview-text">
        <strong>자동 분석</strong>
        {' · '}
        {parts.length > 0 ? parts.join(' · ') : '분석할 자료가 없어요'}
        {overview.paused && <span className="chip chip-status">일시중지됨</span>}
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
    </div>
  );
}
