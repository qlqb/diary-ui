/**
 * 요일 표기를 한 곳에 둔다.
 *
 * 서버는 DayOfWeek 전체 이름('MONDAY')만 주고받는다. 화면은 한 글자('월')로 보여준다.
 * 이 변환이 컴포넌트마다 흩어지면 순서가 갈리기 쉬워서(목록은 월요일 시작, 폼은 일요일 시작
 * 같은 식) 배열 하나를 공유한다.
 */

export const WEEKDAYS = [
  { value: 'MONDAY', label: '월' },
  { value: 'TUESDAY', label: '화' },
  { value: 'WEDNESDAY', label: '수' },
  { value: 'THURSDAY', label: '목' },
  { value: 'FRIDAY', label: '금' },
  { value: 'SATURDAY', label: '토' },
  { value: 'SUNDAY', label: '일' },
];

const LABEL_BY_VALUE = Object.fromEntries(WEEKDAYS.map((d) => [d.value, d.label]));

/** ['THURSDAY', 'MONDAY'] -> '월·목'. 서버가 준 순서와 무관하게 월요일부터 정렬한다. */
export function formatDays(daysOfWeek) {
  if (!daysOfWeek?.length) return '';
  return WEEKDAYS.filter((d) => daysOfWeek.includes(d.value))
    .map((d) => d.label)
    .join('·');
}

/** 'YYYY-MM-DD'의 요일을 서버 표기로. 예외 날짜가 그 루틴의 요일인지 화면에서 미리 보여줄 때 쓴다. */
export function dayOfWeekOf(dateString) {
  if (!dateString) return null;
  const [y, m, d] = dateString.split('-').map(Number);
  const index = new Date(y, m - 1, d).getDay(); // 0=일
  return WEEKDAYS[(index + 6) % 7].value;
}

export { LABEL_BY_VALUE };
