/**
 * 항목의 "할 일"과 "완료 기준"을 나눠 읽는다.
 *
 * 서버는 실행 조각에 설명(description) 한 칸만 남기므로 생성 결과를 "행동 · 완료: 기준"으로 합쳐 저장한다
 * (PlanResultNormalizer). 완료 기준이 따로 있을 때 설명 전체를 숨기면 행동이 사라지고, 그대로 보이면 기준이 두 번
 * 보인다. 그래서 설명에서 "· 완료: …" 꼬리만 떼어 행동으로 쓴다. 떼고 남는 것이 없으면 행동이 없는 것이다.
 */
const DONE_TAIL = /\s*[·•-]?\s*완료\s*[:：]\s*[\s\S]*$/;

export function actionOf(description, doneCriteria) {
  if (!description) return null;
  let text = String(description);
  if (DONE_TAIL.test(text)) {
    text = text.replace(DONE_TAIL, '');
  } else if (doneCriteria && text.trim() === String(doneCriteria).trim()) {
    return null;
  }
  text = text.trim().replace(/[·•,]\s*$/, '').trim();
  return text.length > 0 ? text : null;
}

/** 설명에 붙은 완료 기준. 항목에 따로 있으면 그것을 쓴다. */
export function doneCriteriaOf(description, doneCriteria) {
  if (doneCriteria) return doneCriteria;
  const m = description ? String(description).match(/완료\s*[:：]\s*([\s\S]+)$/) : null;
  return m ? m[1].trim() : null;
}

/** 시작 자료 한 줄. 쪽으로 곧장 갈 수 있으면 그렇게, 아니면 위치를 글로. */
export function startSourceLine(source) {
  if (!source) return null;
  const where = [source.filename, source.locator].filter(Boolean).join(' · ');
  if (source.state === 'DELETED') return `${where} — 자료가 지워졌어요`;
  if (source.state === 'CHANGED') return `${where} — 계획을 만든 뒤 파일이 바뀌었어요. 위치를 다시 확인해 주세요`;
  return where;
}
