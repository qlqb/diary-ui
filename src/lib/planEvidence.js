/**
 * 항목 하나의 근거를 <b>짧게 읽을 수 있는 모양</b>으로 묶는다. 순수 함수이고 새 문장을 만들지
 * 않는다 — 여기 나오는 글자는 전부 스냅샷에 저장된 항목명·파일명·위치·AI 판단이다.
 *
 * ★ 묶는 기준은 제목이 아니라 식별자다. 같은 자료 id끼리 묶고, 제목이 같아도 id가 다르면
 * 다른 자료다. 부모·자식은 스냅샷에 남은 당시 구조(parentSourceId)로만 잇고, 문자열이
 * 비슷하다고 계층을 만들지 않는다.
 *
 * ★ 위치는 목록으로 둔다. "3쪽"과 "9쪽"을 "3~9쪽"으로 만들지 않는다. 주차가 서로 다르면
 * 하나로 통일하지 않는다.
 *
 * ★ 이 항목에 실제로 연결된 ref만 본다. 회차에 제공된 나머지 정보는 이 항목의 근거가 아니다.
 */

/** 학습 범위로 읽는 종류. 나머지는 "참고한 일정·조건"이다. */
const STUDY_TYPES = new Set(['TOPIC']);

/** 기본 화면에 먼저 보여줄 자료 묶음 수. 나머지는 "자료 N개 더 보기"로 연다. */
export const MATERIALS_SHOWN_BY_DEFAULT = 2;

/**
 * @param {object} provenance 서버 응답(PlanProvenanceResponse). recorded=false여도 된다
 * @param {object} item       그 응답의 items[] 중 하나
 * @param {object} [projectTitles] courseId → 프로젝트 제목. 스냅샷에 프로젝트 줄이 없을 때만 쓴다
 */
export function buildEvidenceSummary(provenance, item, projectTitles = {}) {
  const sources = provenance?.providedSources ?? [];
  const byRef = new Map(sources.map((s) => [s.refId, s]));
  const linked = (item?.refIds ?? []).map((refId) => byRef.get(refId)).filter(Boolean);

  const topics = linked.filter((s) => STUDY_TYPES.has(s.sourceType));
  const conditions = linked.filter((s) => !STUDY_TYPES.has(s.sourceType) && s.sourceType !== 'COURSE');
  const courseSources = linked.filter((s) => s.sourceType === 'COURSE');

  return {
    recorded: Boolean(item?.recorded),
    flags: {
      evidenceStatus: item?.evidenceStatus ?? null,
      staleReasons: item?.staleReasons ?? [],
      afterApplyChanges: item?.afterApplyChanges ?? [],
      unknownRefCount: item?.unknownRefCount ?? 0,
    },
    scope: buildScope(topics, conditions, courseSources, sources, projectTitles),
    materials: buildMaterials(linked),
    ai: buildAi(item),
    calculations: (provenance?.serverCalculations ?? [])
      .filter((c) => (item?.serverCalculationIds ?? []).includes(c.calculationId)),
    linkedCount: linked.length,
  };
}

/**
 * 학습 범위. 프로젝트·주차는 모든 학습 항목이 같을 때만 한 번 적는다.
 *
 * kind: 'STUDY'(학습 항목이 있다) · 'CONDITIONS'(일정·조건만 있다) · 'NONE'(연결된 원본이 없다)
 */
function buildScope(topics, conditions, courseSources, allSources, projectTitles) {
  if (topics.length === 0 && conditions.length === 0) {
    return { kind: 'NONE', courseTitle: null, weekLabel: null, groups: [], conditions: [] };
  }
  if (topics.length === 0) {
    return {
      kind: 'CONDITIONS',
      courseTitle: courseTitleOf(courseSources, [], allSources, projectTitles),
      weekLabel: null,
      groups: [],
      conditions: conditions.map(conditionOf),
    };
  }

  const locators = topics.map((t) => textOf(t.providedValue?.sourceLocator)).filter(Boolean);
  const distinctLocators = [...new Set(locators)];
  // 전부 같은 위치일 때만 공통 정보로 올린다. 없거나 서로 다르면 항목 옆에 그대로 둔다.
  const weekLabel = distinctLocators.length === 1 && locators.length === topics.length ? distinctLocators[0] : null;

  return {
    kind: 'STUDY',
    courseTitle: courseTitleOf(courseSources, topics, allSources, projectTitles),
    weekLabel,
    groups: groupTopics(topics, weekLabel),
    conditions: conditions.map(conditionOf),
  };
}

/**
 * 부모·자식 묶기. 부모가 이 항목에 함께 연결돼 있을 때만 그 아래로 들어간다. 부모가 연결되지
 * 않은 자식은 그 자체로 한 묶음이다 — 연결되지 않은 부모를 화면에 끌어오면 "AI가 그 부모
 * 전체를 근거로 삼았다"가 된다.
 */
function groupTopics(topics, weekLabel) {
  const linkedIds = new Set(topics.map((t) => t.sourceId));
  const groups = [];
  const childrenOf = new Map();
  topics.forEach((topic) => {
    const parentId = topic.parentSourceId ?? null;
    if (parentId != null && linkedIds.has(parentId)) {
      if (!childrenOf.has(parentId)) childrenOf.set(parentId, []);
      childrenOf.get(parentId).push(topic);
    }
  });
  topics.forEach((topic) => {
    const parentId = topic.parentSourceId ?? null;
    if (parentId != null && linkedIds.has(parentId)) return; // 부모 아래에서 그려진다.
    groups.push({
      refId: topic.refId,
      sourceId: topic.sourceId,
      title: textOf(topic.providedValue?.title) ?? stripRef(topic.promptLine),
      locator: locatorFor(topic, weekLabel),
      children: (childrenOf.get(topic.sourceId) ?? []).map((child) => ({
        refId: child.refId,
        sourceId: child.sourceId,
        title: textOf(child.providedValue?.title) ?? stripRef(child.promptLine),
        locator: locatorFor(child, weekLabel),
      })),
    });
  });
  return groups;
}

/** 공통 주차로 이미 올라간 위치는 항목 옆에 반복하지 않는다. */
function locatorFor(topic, weekLabel) {
  const locator = textOf(topic.providedValue?.sourceLocator);
  return locator && locator !== weekLabel ? locator : null;
}

function courseTitleOf(courseSources, topics, allSources, projectTitles) {
  if (courseSources.length === 1) {
    return textOf(courseSources[0].providedValue?.title) ?? stripRef(courseSources[0].promptLine);
  }
  if (courseSources.length > 1) return null; // 여러 프로젝트가 섞였다 — 하나로 말하지 않는다.
  const courseIds = [...new Set(topics.map((t) => t.providedValue?.courseId).filter((id) => id != null))];
  if (courseIds.length !== 1) return null;
  const courseLine = allSources.find((s) => s.sourceType === 'COURSE' && s.sourceId === courseIds[0]);
  if (courseLine) return textOf(courseLine.providedValue?.title) ?? stripRef(courseLine.promptLine);
  return projectTitles?.[courseIds[0]] ?? null;
}

function conditionOf(source) {
  return {
    refId: source.refId,
    sourceType: source.sourceType,
    text: stripRef(source.promptLine),
    link: source.link ?? null,
    providedValue: source.providedValue ?? {},
  };
}

/**
 * 자료 묶음. 같은 자료(id)의 줄은 하나로 모으고 위치는 목록으로 둔다.
 *
 * 묶는 키는 (출처 종류, 자료 id)다. 당시 기록(RECORDED)은 당시 자료 id로, 현재 연결로만
 * 찾은 것(CURRENT_LINK)은 지금 자료 id로 묶는다. id가 없는(찾을 수 없는) 자료는 줄마다
 * 따로 둔다 — 이름이 같다고 합치면 서로 다른 파일이 하나로 보일 수 있다.
 */
function buildMaterials(linked) {
  const groups = new Map();
  linked.forEach((source) => {
    const material = source.material;
    if (!material) return;
    const id = material.recordedMaterialId ?? material.materialId ?? null;
    const key = id != null ? `${material.origin}:${id}` : `none:${source.refId}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        materialId: material.materialId ?? null,
        recordedMaterialId: material.recordedMaterialId ?? null,
        filename: material.filename ?? null,
        currentFilename: material.currentFilename ?? null,
        contentType: material.contentType ?? null,
        origin: material.origin,
        state: material.state,
        openMode: material.openMode,
        note: material.note ?? null,
        locators: [],
        refIds: [],
      });
    }
    const group = groups.get(key);
    const locator = textOf(material.locator);
    if (locator && !group.locators.includes(locator)) group.locators.push(locator);
    group.refIds.push(source.refId);
  });
  return [...groups.values()];
}

/**
 * AI의 판단. 이유와 추정이 같은 문장이면 한 번만 둔다 — 뜻은 바꾸지 않는다.
 */
function buildAi(item) {
  const reason = textOf(item?.reason);
  const estimates = [];
  (item?.aiEstimates ?? []).forEach((estimate) => {
    const text = textOf(estimate);
    if (!text || text === reason || estimates.includes(text)) return;
    estimates.push(text);
  });
  return { reason, estimates };
}

/** 자료 묶음의 열기 버튼 이름. 실제로 일어나는 일과 같아야 한다. */
export function materialActionLabel(material) {
  if (!material || material.openMode === 'NONE' || material.materialId == null) return null;
  if (material.openMode === 'DOWNLOAD') return '파일 내려받기';
  return '원본 자료 열기';
}

/** "2주차 확인"처럼 위치 안내를 만든다. 페이지 이동을 약속하지 않는다. */
export function locatorHint(locators) {
  if (!locators || locators.length === 0) return null;
  return `${locators.join(' · ')} 확인`;
}

/**
 * 프롬프트 줄 끝의 인용 번호를 뗀다. 그건 AI에게 줄을 가리키라고 붙인 표식이지
 * 사용자에게 보일 값이 아니다.
 */
export function stripRef(promptLine) {
  if (!promptLine) return '';
  return promptLine.replace(/\s*\[s\d+]\s*$/, '').replace(/^\s*-\s*/, '').trim();
}

function textOf(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}
