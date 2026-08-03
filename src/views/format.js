/**
 * 표시용 문자열 변환.
 *
 * 컴포넌트 파일과 분리해 둔다. (react-refresh 는 컴포넌트만 export 하는 파일을 기대한다)
 */

import { PlacementType } from '../types/execution.js';

/** 배치 정보를 사람이 읽는 형태로. */
export function placementLabel(item) {
  if (item.placementType === PlacementType.TIME_FIXED && item.startTime) {
    return item.endTime ? `${item.startTime} – ${item.endTime}` : item.startTime;
  }
  if (item.placementType === PlacementType.DATE_ONLY) {
    return item.estimatedMinutes ? `${item.estimatedMinutes}분 예상` : '시간 미정';
  }
  return '날짜 미정';
}
