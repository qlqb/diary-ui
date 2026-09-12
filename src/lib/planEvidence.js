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
 * 같은 ref가 두 번 인용돼도 한 번만 센다.
 *
 * ★ 계층은 깊이에 제한이 없다. 인용된 항목은 몇 단계 아래에 있어도 기본 화면에 나온다 — 직계
 * 자식만 보여주면 3단계 항목이 소리 없이 사라진다. 순환·고아 관계에서도 인용된 항목을 잃지
 * 않는다.
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
  const linked = uniqueBy((item?.refIds ?? []).map((refId) => byRef.get(refId)).filter(Boolean), (s) => s.refId);

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
 *
 * 깊이 제한이 없다. A → B → C처럼 몇 단계든 인용된 항목은 전부 트리에 들어간다. 같은 항목
 * (sourceId)이 여러 ref로 인용돼도 한 번만 넣는다. 부모가 자기 자신이거나 서로를 가리키는
 * 순환은 스냅샷 오류지만, 그때도 항목을 잃지 않는다 — 걷지 못한 항목은 뿌리로 올린다.
 */
function groupTopics(topics, weekLabel) {
  const nodes = new Map();
  topics.forEach((topic) => {
    if (topic.sourceId == null || !nodes.has(topic.sourceId)) {
      nodes.set(topic.sourceId ?? `ref:${topic.refId}`, {
        refId: topic.refId,
        sourceId: topic.sourceId ?? null,
        title: textOf(topic.providedValue?.title) ?? stripRef(topic.promptLine),
        locator: locatorFor(topic, weekLabel),
        parentId: topic.parentSourceId ?? null,
        children: [],
      });
    }
  });

  const childrenOf = new Map();
  nodes.forEach((node, id) => {
    const parentId = node.parentId;
    if (parentId != null && parentId !== id && nodes.has(parentId)) {
      if (!childrenOf.has(parentId)) childrenOf.set(parentId, []);
      childrenOf.get(parentId).push(node);
    }
  });

  const visited = new Set();
  const build = (node) => {
    visited.add(node.sourceId ?? `ref:${node.refId}`);
    const children = (childrenOf.get(node.sourceId) ?? [])
      .filter((child) => !visited.has(child.sourceId ?? `ref:${child.refId}`))
      .map(build);
    return {
      refId: node.refId, sourceId: node.sourceId, title: node.title, locator: node.locator, children,
    };
  };

  const groups = [];
  nodes.forEach((node, id) => {
    const parentId = node.parentId;
    const hasLinkedParent = parentId != null && parentId !== id && nodes.has(parentId);
    if (!hasLinkedParent && !visited.has(id)) groups.push(build(node));
  });
  // 순환 때문에 뿌리가 없는 항목. 잃지 않고 뿌리로 올린다.
  nodes.forEach((node, id) => {
    if (!visited.has(id)) groups.push(build(node));
  });
  return groups;
}

/** 묶음 하나가 품은 항목 수(자기 자신 포함). 화면이 "몇 개를 묶었는지" 말할 때 쓴다. */
export function countScopeNodes(group) {
  return 1 + (group.children ?? []).reduce((sum, child) => sum + countScopeNodes(child), 0);
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
 * 자료 묶음. 같은 자료의 줄은 하나로 모으고 위치는 목록으로 둔다.
 *
 * 묶는 키는 (출처 종류, 당시 자료 id, 지금 열리는 자료 id, 상태)다. 당시 자료가 같아도 지금
 * 연결된 파일이나 상태(변경·재연결·삭제)가 다르면 다른 행이다 — 하나로 합치면 첫 줄의 링크와
 * 안내만 남아 "어느 주제가 어떤 현재 자료로 갔는지"가 사라진다. 접근할 수 없는 자료가 다른
 * 줄의 정상 링크를 물려받지도 않는다.
 *
 * id가 없는(찾을 수 없는) 자료는 줄마다 따로 둔다. 파일명으로는 묶지 않는다 — 이름이 같은
 * 다른 파일이 하나로 보일 수 있다.
 *
 * 순서는 인용 순서가 아니라 (당시 자료 id, 파일명, 지금 자료 id, 상태)다. 어느 순서로 인용됐든
 * 같은 집합이 같은 순서로 보인다.
 */
function buildMaterials(linked) {
  const groups = new Map();
  linked.forEach((source) => {
    const material = source.material;
    if (!material) return;
    const recordedId = material.recordedMaterialId ?? null;
    const currentId = material.materialId ?? null;
    const anchor = recordedId ?? currentId;
    const key = anchor != null
      ? `${material.origin}:${recordedId ?? '-'}:${currentId ?? '-'}:${material.state ?? '-'}`
      : `none:${source.refId}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        materialId: currentId,
        recordedMaterialId: recordedId,
        filename: material.filename ?? null,
        currentFilename: material.currentFilename ?? null,
        contentType: material.contentType ?? null,
        origin: material.origin,
        state: material.state,
        openMode: material.openMode,
        note: material.note ?? null,
        locators: [],
        refIds: [],
        topicTitles: [],
      });
    }
    const group = groups.get(key);
    const locator = textOf(material.locator);
    if (locator && !group.locators.includes(locator)) group.locators.push(locator);
    if (!group.refIds.includes(source.refId)) group.refIds.push(source.refId);
    const title = textOf(source.providedValue?.title);
    if (title && !group.topicTitles.includes(title)) group.topicTitles.push(title);
  });

  const list = [...groups.values()];
  // 같은 당시 자료가 여러 행으로 갈라졌으면 각 행이 어느 주제인지 말해야 한다.
  const rowsPerRecorded = new Map();
  list.forEach((group) => {
    const anchor = group.recordedMaterialId ?? group.materialId;
    if (anchor == null) return;
    rowsPerRecorded.set(anchor, (rowsPerRecorded.get(anchor) ?? 0) + 1);
  });
  list.forEach((group) => {
    const anchor = group.recordedMaterialId ?? group.materialId;
    group.split = anchor != null && (rowsPerRecorded.get(anchor) ?? 0) > 1;
  });

  const rank = (group) => [
    group.recordedMaterialId ?? group.materialId ?? Number.MAX_SAFE_INTEGER,
    group.filename ?? '',
    group.materialId ?? Number.MAX_SAFE_INTEGER,
    group.state ?? '',
    group.refIds[0] ?? '',
  ];
  list.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i += 1) {
      if (ra[i] < rb[i]) return -1;
      if (ra[i] > rb[i]) return 1;
    }
    return 0;
  });
  return list;
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

function uniqueBy(values, keyOf) {
  const seen = new Set();
  return values.filter((value) => {
    const key = keyOf(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function textOf(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}
