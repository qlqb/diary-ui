/**
 * 수업 확인 화면의 순수 도움 함수. 서버 enum 원문을 화면에 내보내지 않는다.
 */

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 서버 상한(PUT /class-sessions): 회차당 원천 30, 요청당 회차 20. */
export const MAX_SOURCES = 30;
export const MAX_ITEMS = 20;

/**
 * "10/6(월) 09:00". 날짜·요일·시각은 실제로 열린 때(startAt — 보강이면 옮긴 날)다. sourceDate는 회차를 가리키는 열쇠로만 쓴다.
 */
export function sessionLabel(session) {
  const at = session?.startAt ?? (session?.sourceDate ? `${session.sourceDate}T` : null);
  if (!at) return '';
  const [y, m, d] = at.slice(0, 10).split('-').map(Number);
  const day = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  const time = session.startAt ? session.startAt.slice(11, 16) : '';
  return `${m}/${d}(${day})${time ? ` ${time}` : ''}${session.moved ? ' · 보강' : ''}`;
}

/** 회차·판·기본값이 바뀌면 새로 그리게 하는 key(옛 선택이 남지 않게). */
export function sessionViewKey(session) {
  return `${session.routineId}-${session.sourceDate}-${session.revision ?? 0}-${(session.defaults ?? []).map((d) => d.ref).join(',')}`;
}

/** "ch03.pdf · EC2와 SSH (12~25쪽)" */
export function optionLabel(option) {
  if (!option) return '';
  const pages = option.pageFrom != null
    ? ` (${option.pageFrom}${option.pageTo != null && option.pageTo !== option.pageFrom ? `~${option.pageTo}` : ''}쪽)`
    : '';
  const material = option.materialName ? `${option.materialName} · ` : '';
  return `${material}${option.title ?? ''}${pages}`;
}

export function sessionKey(courseId, session) {
  return `${courseId}:${session.routineId}:${session.sourceDate}`;
}

/** 확인 요청 항목. sources는 고른 구간 목록. */
export function confirmItem(session, action, options = []) {
  return {
    routineId: session.routineId,
    sourceDate: session.sourceDate,
    expectedRevision: session.revision ?? 0,
    action,
    sources: action === 'COVERED'
      ? options.map((o) => ({ kind: 'SECTION', ref: o.ref, from: null, to: null }))
      : [],
  };
}

const LATER_KEY = 'classCheck.laterUntil';

/** [나중에]로 접은 회차(하루, 다시 와도 유지). 저장소를 못 쓰면 저장소 쪽은 접지 않은 것으로 본다(화면은 따로 기억한다). */
export function isPostponed(key, now = Date.now()) {
  try {
    const map = JSON.parse(localStorage.getItem(LATER_KEY) ?? '{}');
    return typeof map[key] === 'number' && map[key] > now;
  } catch {
    return false;
  }
}

export function postpone(key, now = Date.now()) {
  try {
    const map = JSON.parse(localStorage.getItem(LATER_KEY) ?? '{}');
    for (const k of Object.keys(map)) if (map[k] <= now) delete map[k];
    map[key] = now + 24 * 60 * 60 * 1000;
    localStorage.setItem(LATER_KEY, JSON.stringify(map));
  } catch {
    // 저장소를 못 쓰면 이번 화면에서만 접힌다(TodayClassCheck가 따로 기억한다).
  }
}

/** 과목별 pending 응답들에서 가장 최근 회차 하나(접은 것 제외 — 저장소 + 이번 화면에서 접은 것). */
export function latestPending(viewsByCourse, now = Date.now(), skipped = new Set()) {
  let best = null;
  for (const [courseId, view] of Object.entries(viewsByCourse)) {
    for (const session of view?.sessions ?? []) {
      const key = sessionKey(courseId, session);
      if (skipped.has(key) || isPostponed(key, now)) continue;
      if (!best || (session.endAt ?? '') > (best.session.endAt ?? '')) {
        best = { courseId: Number(courseId), session, options: view.options ?? [] };
      }
    }
  }
  return best;
}
