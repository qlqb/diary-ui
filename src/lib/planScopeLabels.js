/**
 * "말한 범위"(PlanScopeReport)가 쓰는 시간 문구. 컴포넌트 파일이 컴포넌트만 내보내야 fast refresh가 돌아서
 * (react-refresh/only-export-components) 여기로 뺐다.
 */

/** 확인된 쓸 수 있는 시간을 한 줄로. 예: "~16:00", "20:00~24:00", "하루 60분". */
export function studyTimeLabel(time) {
  if (!time) return null;
  const parts = [];
  if (time.minutes != null) parts.push(`${time.perDay ? '하루 ' : '전체 '}${time.minutes}분`);
  if (time.from || time.until) parts.push(`${time.from ?? ''}~${time.until ?? ''}`);
  return parts.join(' · ');
}

const hhmm = (t) => (t ? String(t).slice(0, 5) : '');

/** 해석한 구간 하나. 자정을 넘으면 그렇게 말한다("22:00~다음 날 01:00", "~24:00"). */
export function rangeLabel(range) {
  if (!range) return '';
  const end = range.end == null ? '24:00'
    : range.endsNextDay ? (hhmm(range.end) === '00:00' ? '24:00' : `다음 날 ${hhmm(range.end)}`) : hhmm(range.end);
  return `${hhmm(range.start)}~${end}`;
}
