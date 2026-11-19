/** 못 넣은 항목 묶음(UnplacedTray)이 쓰는 시각 표기·계산. */

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DDTHH:mm(:ss)' 그대로 읽는다 — Date로 바꾸면 시간대가 끼어든다. */
export function slotParts(iso) {
  const [date, time = ''] = String(iso).split('T');
  const [y, m, d] = date.split('-').map(Number);
  const weekday = WEEKDAY_KO[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return { date, label: `${m}/${d}(${weekday})`, time: time.slice(0, 5) };
}

export function formatSlot(start, end) {
  const s = slotParts(start);
  const e = end ? slotParts(end) : null;
  if (!e) return `${s.label} ${s.time}`;
  return e.date === s.date ? `${s.label} ${s.time}~${e.time}` : `${s.label} ${s.time}~${e.label} ${e.time}`;
}

/** 날짜·시작 시각·길이(분) → ISO 시작·끝(초 포함, 시간대 없음). */
export function slotOf(date, startTime, minutes) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = startTime.split(':').map(Number);
  const end = new Date(Date.UTC(y, m - 1, d, hh, mm + minutes));
  const iso = (dt) => `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}:00`;
  return { start: `${date}T${pad(hh)}:${pad(mm)}:00`, end: iso(end) };
}

