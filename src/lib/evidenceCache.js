/**
 * 적용된 조각의 근거 응답 캐시. 조각 id + version이 키다.
 *
 * 같은 조각·같은 version의 응답은 화면들 사이에서 다시 쓴다 — 오늘 화면에서 열어 본 것을
 * 계획 화면에서 또 부르지 않는다. 옮기거나 줄이면 version이 오르므로 자연히 새 키가 되고,
 * 옛 응답은 더 이상 읽히지 않는다. 실패한 요청은 넣지 않는다 — 다시 열면 다시 시도한다.
 */

const responseCache = new Map();
const CACHE_LIMIT = 200;

export function evidenceCacheKey(executionItemId, version) {
  return `${executionItemId}:${version ?? 'unknown'}`;
}

export function getCachedEvidence(key) {
  return responseCache.get(key) ?? null;
}

export function rememberEvidence(key, value) {
  if (responseCache.size >= CACHE_LIMIT) {
    responseCache.delete(responseCache.keys().next().value);
  }
  responseCache.set(key, value);
}

/** 조각 하나만 비우거나(재생성·원본 접근 실패 뒤) 전부 비운다. */
export function forgetItemEvidence(executionItemId = null) {
  if (executionItemId == null) {
    responseCache.clear();
    return;
  }
  [...responseCache.keys()]
    .filter((key) => key.startsWith(`${executionItemId}:`))
    .forEach((key) => responseCache.delete(key));
}
