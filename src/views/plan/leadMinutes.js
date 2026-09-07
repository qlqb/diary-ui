/**
 * 이동시간 질문 카드의 순수 함수. 컴포넌트 파일과 나눈 이유는 fast refresh 규칙(컴포넌트만
 * export)이고, 검증 규칙(0~480 정수)이 카드와 폼에서 같아야 하기 때문이다.
 */

import { LABEL_BY_VALUE } from '../schedule/routineDays.js';
import { toHHmm } from '../../lib/datetime.js';

/** 서버의 상한과 같다(RoutineService.MAX_LEAD_MINUTES). 8시간 — 그보다 길면 이동이 아니라 일정이다. */
export const LEAD_MINUTES_MAX = 480;

/** [{ dayOfWeek, startTime }] → "화 14:00, 수 09:00" */
export function formatSample(sample) {
  return (sample ?? [])
    .map((s) => `${LABEL_BY_VALUE[s.dayOfWeek] ?? s.dayOfWeek} ${toHHmm(s.startTime) ?? ''}`.trim())
    .join(', ');
}

/** 직접 입력값을 분으로. 정수 0~480만 허용하고 그 밖은 null이다. */
export function parseCustomMinutes(text) {
  if (text == null || String(text).trim() === '') return null;
  if (!/^\d+$/.test(String(text).trim())) return null;
  const value = Number(text);
  if (!Number.isInteger(value) || value < 0 || value > LEAD_MINUTES_MAX) return null;
  return value;
}

/** 60 → "1시간", 90 → "1시간 30분", 0 → "없음" */
export function formatLeadMinutes(minutes) {
  if (minutes == null) return '';
  if (minutes === 0) return '없음';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h > 0 ? `${h}시간` : '', m > 0 ? `${m}분` : ''].filter(Boolean).join(' ');
}
