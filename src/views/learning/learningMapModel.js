/**
 * 프로젝트 학습 지도의 화면 모델.
 *
 * 서버 계약(GET /courses/{id}/learning-map)을 그대로 쓰되, 모든 필드가 없을 수 있다고 본다.
 * 서버가 아직 이 경로를 모르면(404) 기존 API 셋 — topic 트리, 열린 변경안, 연결 자료 — 으로
 * 같은 모양을 여기서 조립한다. 화면은 어느 쪽에서 왔는지 몰라도 된다.
 *
 * ★ 주차는 서버가 준 `weeks`만 쓴다. 파일 이름의 숫자(01_intro.pdf)에서 주차를 짐작하지 않는다 —
 *   파일 번호는 올린 순서이거나 교재 장 번호일 뿐이고, 그걸 주차로 읽으면 없는 사실을 만들어 낸다.
 *   서버의 `weeks`는 사용자가 확인한 자료 ↔ 주차 관계로만 만들어진다(추천은 들어 있지 않다). 추천을 보고
 *   확인하는 곳은 자료 주차 확인 화면(MaterialWeekReview)이고, 여기는 `weekReview`로 "확인 필요 N개"만 안다.
 */

import {
  learningMapAPI, materialAPI, materialAnalysisStatusAPI, projectTidyAPI, topicAPI,
} from '../../api/api.js';

const EMPTY_STATE = Object.freeze({
  materials: 0, analysisPending: 0, analysisFailed: 0, linkWaiting: 0, openProposals: 0, topics: 0, hasRecords: false,
});

/** 자기평가 값 → 문구. 시험 결과가 아니라 사용자가 고른 느낌이다. */
export const SELF_CHECK_LABEL = Object.freeze({
  KNOW: '알아',
  UNSURE: '애매해',
  NEW: '처음 봐',
});

export const SELF_CHECK_LEVELS = Object.freeze(['KNOW', 'UNSURE', 'NEW']);

export function flattenTopics(topics) {
  const out = [];
  const walk = (nodes) => (nodes ?? []).forEach((n) => { out.push(n); walk(n.children); });
  walk(topics);
  return out;
}

/** 서버 응답을 빈 값에 안전한 모양으로. 없는 필드는 "없음"이지 0이나 거짓으로 단정하지 않는다. */
export function normalizeLearningMap(raw, courseId) {
  const topics = raw?.topics ?? [];
  const flat = flattenTopics(topics);
  const state = { ...EMPTY_STATE, ...(raw?.state ?? {}) };
  if (raw?.state?.topics == null) state.topics = flat.length;
  if (raw?.state?.openProposals == null) state.openProposals = (raw?.proposed ?? []).length;
  return {
    courseId: raw?.courseId ?? courseId,
    title: raw?.title ?? null,
    treeVersion: raw?.treeVersion ?? null,
    state,
    topics,
    proposed: raw?.proposed ?? [],
    unlinked: raw?.unlinked ?? [],
    weeks: (raw?.weeks ?? []).filter((w) => w && w.label),
    weekReview: raw?.weekReview ?? null,
    source: 'server',
  };
}

/**
 * 프로젝트 정리안을 지도 위의 "승인 전" 미리보기 묶음으로. 0개나 1개다.
 *
 * 서버가 이미 사람이 읽을 문장(change.text)과 근거 구간을 만들어 주므로 여기서는 트리 자리만
 * 정한다 — 같은 문장을 두 곳에서 다르게 만들지 않는다.
 */
export function tidyToOverlayList(view) {
  if (!view?.proposalId || view.status !== 'PROPOSED') return [];
  const changeById = {};
  (view.changes ?? []).forEach((c) => { changeById[c.changeId] = c; });

  const nodes = [];
  // 트리 자리는 묶음(영향을 받는 항목)이 알고 있다 — 변경 하나하나가 아니라.
  (view.groups ?? []).forEach((group) => {
    (group.changeIds ?? []).forEach((changeId) => {
      const change = changeById[changeId];
      if (!change) return;
      nodes.push({
        tempId: `p${view.proposalId}:${changeId}`,
        title: change.op === 'ADD' ? (change.title ?? change.text) : change.text,
        parentTempId: null,
        parentTopicId: group.topicId ?? null,
        op: change.op,
        sections: (change.sections ?? []).map((s) => ({
          sectionId: s.sectionId, title: s.title, locator: s.locator ?? null,
        })),
      });
    });
  });
  if (nodes.length === 0) return [];
  return [{
    proposalId: view.proposalId,
    materialId: null,
    filename: (view.scope?.reviewed ?? []).length === 1
      ? view.scope.reviewed[0].filename
      : `자료 ${(view.scope?.reviewed ?? []).length}개`,
    summary: view.summary ?? null,
    nodes,
  }];
}

const PENDING_STATES = new Set(['NONE', 'QUEUED', 'RUNNING', 'PAUSED']);
const FAILED_STATES = new Set(['FAILED', 'UNAVAILABLE']);

/** 404일 때의 조립. 부분 실패는 그 부분만 비운다 — 트리를 못 읽은 것만 전체 실패다. */
async function buildFallback(courseId) {
  const [topics, tidyResult, materialsResult, overviewResult] = await Promise.all([
    topicAPI.getTree(courseId),
    // 검토 중인 정리안은 프로젝트당 하나다(예전에는 자료마다 하나였다).
    Promise.resolve().then(() => projectTidyAPI.get(courseId)).catch(() => null),
    Promise.resolve().then(() => materialAPI.listByCourse(courseId)).catch(() => []),
    Promise.resolve().then(() => materialAnalysisStatusAPI.overview()).catch(() => null),
  ]);
  const tree = topics ?? [];
  const flat = flattenTopics(tree);
  const proposals = tidyToOverlayList(tidyResult);
  const materials = materialsResult ?? [];
  const statusById = new Map();
  (overviewResult?.materials ?? []).forEach((m) => statusById.set(m.materialId, m));

  const mine = materials.map((m) => ({ ...m, analysisState: statusById.get(m.materialId)?.state ?? null }));
  const proposalMaterialIds = new Set(
    (tidyResult?.scope?.reviewed ?? []).map((r) => r.materialId));
  /*
   * 어느 자료가 topic에 연결됐는지는 옛 API로 알 수 없다. 확실한 것만 "미연결"로 본다:
   * 지도에 항목이 하나도 없으면 전부, 아니면 아직 변경안이 열려 있는 자료.
   */
  const unlinked = mine
    .filter((m) => flat.length === 0 || proposalMaterialIds.has(m.materialId))
    .map((m) => ({ materialId: m.materialId, filename: m.originalFilename, analysisState: m.analysisState, sections: [] }));

  return {
    courseId,
    title: null,
    treeVersion: null,
    state: {
      materials: mine.length,
      analysisPending: mine.filter((m) => PENDING_STATES.has(m.analysisState)).length,
      analysisFailed: mine.filter((m) => FAILED_STATES.has(m.analysisState)).length,
      linkWaiting: 0,
      openProposals: proposals.length,
      topics: flat.length,
      hasRecords: flat.some((t) => t.progressStatus && t.progressStatus !== 'NOT_STARTED'),
    },
    topics: tree,
    proposed: proposals,
    unlinked,
    weeks: [],
    weekReview: null,
    source: 'fallback',
  };
}

export async function loadLearningMap(courseId) {
  // api 모듈을 통째로 바꿔 끼운 환경(테스트)에서는 없는 export를 읽는 것만으로 예외가 난다.
  let api = null;
  try { api = learningMapAPI ?? null; } catch { api = null; }
  if (!api?.get) return buildFallback(courseId);
  try {
    return normalizeLearningMap(await api.get(courseId), courseId);
  } catch (err) {
    // 서버가 아직 이 경로를 모른다. 다른 오류(500·권한)는 숨기지 않고 그대로 올린다.
    if (err?.status === 404) return buildFallback(courseId);
    throw err;
  }
}

/**
 * 지금 지도가 어떤 상태인지. 여러 개가 동시에 참일 수 있어서 목록으로 돌려준다(앞쪽이 더 급하다).
 *   NO_MATERIAL / PROPOSAL_WAITING / ANALYSIS_PENDING / ANALYSIS_FAILED / NO_RECORDS
 */
export function mapStates(model) {
  const s = model?.state ?? EMPTY_STATE;
  const topicCount = s.topics ?? 0;
  if ((s.materials ?? 0) === 0 && topicCount === 0 && (model?.proposed ?? []).length === 0) return ['NO_MATERIAL'];
  const out = [];
  if ((s.openProposals ?? 0) > 0 || (model?.proposed ?? []).length > 0) out.push('PROPOSAL_WAITING');
  if ((s.analysisPending ?? 0) > 0) out.push('ANALYSIS_PENDING');
  if ((s.analysisFailed ?? 0) > 0) out.push('ANALYSIS_FAILED');
  if (topicCount > 0 && !s.hasRecords) out.push('NO_RECORDS');
  return out;
}

/** 검색어에 맞는 topic과, 그 topic이 보이도록 펼쳐야 하는 조상. */
export function searchTopics(topics, proposedByTopic, query) {
  const q = String(query ?? '').trim().toLowerCase();
  const matched = new Set();
  const ancestors = new Set();
  if (!q) return { matched, ancestors, active: false };
  const hit = (text) => String(text ?? '').toLowerCase().includes(q);
  const walk = (nodes, path) => {
    let any = false;
    (nodes ?? []).forEach((node) => {
      const self = hit(node.title)
        || (node.materials ?? []).some((m) => hit(m.filename))
        || (proposedByTopic?.get(node.topicId) ?? []).some((p) => hit(p.title));
      const below = walk(node.children, [...path, node.topicId]);
      if (self) matched.add(node.topicId);
      if (self || below) { path.forEach((id) => ancestors.add(id)); any = true; }
      // 제안 노드가 맞았으면 그 부모(이 topic)도 펼쳐야 제안이 보인다.
      if ((proposedByTopic?.get(node.topicId) ?? []).some((p) => hit(p.title))) ancestors.add(node.topicId);
      if (below) ancestors.add(node.topicId);
    });
    return any;
  };
  walk(topics, []);
  return { matched, ancestors, active: true };
}

export function ancestorIdsOf(topics, targetId, path = []) {
  for (const node of topics ?? []) {
    if (node.topicId === targetId) return path;
    const found = ancestorIdsOf(node.children, targetId, [...path, node.topicId]);
    if (found) return found;
  }
  return null;
}

/** 한 번에 묻는 개수의 상한. 길어지면 점검이 숙제가 된다. */
const MAX_ITEMS = 12;

/** 묶음 안에서 물어볼 항목: 맨 아래 항목들. 하위가 없으면 묶음 자신. */
export function selfCheckItemsOf(group) {
  const leaves = [];
  const walk = (node) => {
    const children = node.children ?? [];
    if (children.length === 0) leaves.push(node);
    else children.forEach(walk);
  };
  walk(group);
  return leaves.slice(0, MAX_ITEMS).map((t) => ({
    key: `topic-${t.topicId}`, label: t.title, topicId: t.topicId, sectionId: null,
  }));
}
