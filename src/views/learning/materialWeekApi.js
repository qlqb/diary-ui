import { materialWeekAPI } from '../../api/api.js';

/**
 * 자료 주차 API. api 모듈을 통째로 바꿔 끼운 테스트에서는 없는 export를 읽는 것만으로 예외가 난다 — 그때는 null이고,
 * 부르는 쪽은 주차 표시 없이 나머지 화면을 그대로 그린다(learningMapModel의 loadLearningMap과 같은 방식).
 */
export function weekApi() {
  try { return materialWeekAPI ?? null; } catch { return null; }
}
