/**
 * 이번 계획 기간에 비어 있는 시간 — 날짜별 가로 막대.
 *
 * "세우기 전" 화면을 따로 두지 않고 "세우는 중" 미리보기에 흡수한 것이다
 * (handoff plan-experience-plan-2026-11-20 §1 3단계). 막대 길이 = 그날 비어 있는 시간,
 * 채운 부분 = 이번 초안이 그날 쓰는 시간.
 *
 * 숫자는 화면에서 다시 계산하지 않는다. 일정 미리보기 응답의 availabilityWindows가 배치기가 실제로 쓴
 * 가용 구간이다(AvailabilityEstimateService: 수업·약속·시각 정한 조각·대화에서 말한 안 되는 시간·지난 시각을 뺀
 * 하루 창). 화면이 따로 08~23시 같은 기준으로 세면 초안이 기대는 숫자와 어긋난다.
 */
import { formatDateShort, weekdayKo } from '../../lib/datetime.js';
import { formatMinutes } from '../../lib/planTime.js';
import { freeTimeByDay } from '../../lib/freeTime.js';

export default function FreeTimeBars({ preview, excluded }) {
  const rows = freeTimeByDay(preview, excluded);
  if (rows.length === 0) return null;
  const totalFree = rows.reduce((s, r) => s + r.free, 0);
  const totalUsed = rows.reduce((s, r) => s + r.used, 0);
  const max = Math.max(...rows.map((r) => Math.max(r.free, r.used)), 1);
  return (
    <section className="free-bars" aria-label="이번 기간 비어 있는 시간">
      <p className="free-bars-head">
        <span className="free-bars-title">비어 있는 시간</span>
        <span className="free-bars-sum">{formatMinutes(totalFree)} 중 이번 초안 {formatMinutes(totalUsed)}</span>
      </p>
      {rows.map((r) => (
        <div key={r.date} className="free-bar-row">
          <span className="free-bar-day">{weekdayKo(r.date)} {formatDateShort(r.date)}</span>
          <span className="free-bar" style={{ width: `${(Math.max(r.free, r.used) / max) * 100}%` }}>
            <span className="free-bar-used" style={{ width: `${r.free > 0 ? Math.min(100, (r.used / r.free) * 100) : 100}%` }} />
          </span>
          <span className="free-bar-num">{r.used > 0 ? `${formatMinutes(r.used)} / ` : ''}{formatMinutes(r.free)}</span>
        </div>
      ))}
    </section>
  );
}
