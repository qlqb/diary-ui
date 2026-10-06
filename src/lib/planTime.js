/**
 * 계획 화면의 시간 표시.
 *
 * 분을 그대로 보여주면 "600분"이 얼마나 큰지 감이 안 온다. 사용자가 조정하는 대상이
 * 개수가 아니라 부하이므로, 그 부하를 읽을 수 있는 단위로 바꾼다.
 */

/** 750 → "12h 30m", 40 → "40m", 120 → "2h" */
export function formatMinutes(minutes) {
  if (minutes == null) return '-';
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** 문장 안에 넣을 때. 750 → "12시간 30분" */
export function formatMinutesKo(minutes) {
  if (minutes == null) return '-';
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

/** YYYY-MM-DD → "8월 24일" */
export function formatDateKo(iso) {
  if (!iso) return '';
  const [, month, day] = iso.split('-');
  return `${Number(month)}월 ${Number(day)}일`;
}

export function toIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

export function daysBetween(startIso, endIso) {
  const a = new Date(`${startIso}T00:00:00`);
  const b = new Date(`${endIso}T00:00:00`);
  return Math.round((b - a) / 86400000) + 1;
}

/**
 * 기간 프리셋. 화면이 날짜로 변환해서 보낸다 — 서버는 프리셋 이름을 저장하지 않는다.
 * 같은 날짜 범위를 어떤 버튼으로 골랐는지는 계획의 성질을 바꾸지 않는다.
 */
export function periodPresets(todayIso) {
  const today = new Date(`${todayIso}T00:00:00`);
  const dow = today.getDay();
  // 이번 주는 월요일 시작.
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = addDays(todayIso, mondayOffset);
  const monthStart = `${todayIso.slice(0, 7)}-01`;
  const monthEndDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  return [
    { key: 'today', label: '오늘', startDate: todayIso, endDate: todayIso },
    { key: 'tomorrow', label: '내일', startDate: addDays(todayIso, 1), endDate: addDays(todayIso, 1) },
    { key: 'next7', label: '앞으로 7일', startDate: todayIso, endDate: addDays(todayIso, 6) },
    { key: 'thisWeek', label: '이번 주', startDate: monday, endDate: addDays(monday, 6) },
    { key: 'thisMonth', label: '이번 달', startDate: monthStart, endDate: toIsoDate(monthEndDate) },
  ];
}
