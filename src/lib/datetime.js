/**
 * 날짜/시각 도우미.
 *
 * 전부 로컬 기준으로 계산한다 — toISOString()은 UTC로 바꾸면서 하루가 밀릴 수 있어 쓰지 않는다.
 */

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

export function toDateString(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function todayString() {
  return toDateString(new Date());
}

export function parseDateString(dateString) {
  const [y, m, d] = dateString.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function shiftDate(dateString, days) {
  const d = parseDateString(dateString);
  return toDateString(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days));
}

/** "8월 15일 (금)" */
export function formatDateKo(dateString) {
  if (!dateString) return '';
  const d = parseDateString(dateString);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY_KO[d.getDay()]})`;
}

/** "8/15" */
export function formatDateShort(dateString) {
  if (!dateString) return '';
  const d = parseDateString(dateString);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function weekdayKo(dateString) {
  if (!dateString) return '';
  return WEEKDAY_KO[parseDateString(dateString).getDay()];
}

/**
 * ISO datetime('2026-10-01T10:00:00'), 'HH:mm:ss', 'HH:mm' 어느 쪽이든 'HH:mm'만 뽑는다.
 *
 * 서버의 LocalTime은 초까지 실려 온다('10:00:00'). 자리 수로만 갈라 slice(11, 16)을 하면
 * 빈 문자열이 나오므로 'T'가 있는지로 구분한다.
 */
export function toHHmm(value) {
  if (!value) return null;
  const s = String(value);
  if (s.length <= 5) return s;
  return s.includes('T') ? s.slice(11, 16) : s.slice(0, 5);
}

export function minutesOf(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function hhmmOf(minutes) {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

/** 현재 시각을 분 단위로. "지금"을 판단하는 기준. */
export function nowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/** 다음 step 분 경계로 올림. "지금부터 바로"를 어중간한 15:43이 아니라 15:45로 잡는다. */
export function ceilToStep(minutes, step = 5) {
  return Math.ceil(minutes / step) * step;
}

/** 하루(24시간) 안으로 자른다. 자정을 넘겨서 오늘 안에 잡는 일이 없어야 한다. */
export function clampToDay(minutes) {
  return Math.max(0, Math.min(24 * 60, Math.round(minutes)));
}

/** 월요일 시작 7일. offset은 이번 주 기준 주 단위 이동량. */
export function weekDates(offset = 0, base = new Date()) {
  const day = base.getDay(); // 0=일
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(base.getFullYear(), base.getMonth(), base.getDate() + mondayOffset + offset * 7);
  return Array.from({ length: 7 }, (_, i) =>
    toDateString(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)),
  );
}

/** 그 날짜가 속한 주의 월요일. */
export function mondayOf(dateString) {
  const d = parseDateString(dateString);
  const day = d.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  return toDateString(new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset));
}

/** 이번 주(오늘 기준) 대비 그 날짜가 몇 주 뒤인지. 지난 주면 음수. */
export function weekOffsetOf(dateString, base = new Date()) {
  const from = parseDateString(mondayOf(toDateString(base)));
  const to = parseDateString(mondayOf(dateString));
  return Math.round((to - from) / (7 * 24 * 60 * 60 * 1000));
}

/** "1시간 30분" / "40분" */
export function formatMinutes(minutes) {
  if (minutes == null) return '';
  if (minutes < 60) return `${minutes}분`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}
