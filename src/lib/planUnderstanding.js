/**
 * 계획을 "이해할 수 있게" 만드는 요약. 모델을 다시 부르지 않는다 — 초안 판단(strategy), 그 회차에 실제로 준 정보
 * (provenance), 서버가 센 자료 읽기 결과(materialSelection), 항목 목록에서만 계산한다.
 *
 * 두 가지를 섞지 않는 것이 핵심이다.
 *   근거(grounding)  이 계획이 자료의 어디를 읽고 만들어졌는가. 원문을 읽었는지·일부만 읽었는지·못 읽었는지.
 *   적합성(fit)      이 분량·난이도가 이 사용자에게 맞는가. 자료를 읽었다고 사용자가 해낼 수 있다는 뜻이 아니다.
 *                    근거는 사용자 상태(직접 말함·자기평가·실제 수행 기록)뿐이고, 없으면 "추정"이라고 말한다.
 */

const READ_FULL = new Set(['FULL']);
const READ_PARTIAL = new Set(['PARTIAL', 'EXCERPT_ONLY']);
const NOT_READ = new Set(['NOT_RETRIEVED_BUDGET', 'DROPPED_CHANGED', 'DROPPED_DELETED']);

/** 사용자 상태의 근거 종류 → 짧은 이름. 서버 qualifier 문구("자기평가", "AI 추정, 확인 전")를 그대로 읽는다. */
function contextKind(line) {
  if (!line) return 'STATED';
  if (line.includes('AI 추정')) return 'INFERRED';
  if (line.includes('자기평가')) return 'SELF_REPORT';
  if (line.includes('관찰')) return 'OBSERVED';
  return 'STATED';
}

export const USER_STATE_KIND_LABEL = {
  STATED: '내가 말함',
  SELF_REPORT: '자기평가',
  OBSERVED: '앱이 기록에서 확인',
  INFERRED: 'AI 추정 · 확인 전',
};

function stripRef(line) {
  return String(line ?? '').replace(/\s*\[[a-z]+\d+\]\s*$/i, '').trim();
}

export function buildPlanUnderstanding({ strategy, provenance, selection, items = [], projectTitles = {} }) {
  const sources = provenance?.providedSources ?? [];
  const userState = sources
    .filter((s) => s.sourceType === 'USER_CONTEXT')
    .map((s) => {
      const line = stripRef(s.promptLine ?? s.providedValue?.content);
      return { text: s.providedValue?.content ?? line, kind: contextKind(line) };
    });
  const history = sources.filter((s) => s.sourceType === 'EXECUTION_HISTORY');
  const agreements = sources.filter((s) => s.sourceType === 'PLAN_BRIEF');

  const sections = selection?.sections ?? [];
  const read = sections.filter((s) => READ_FULL.has(s.outcome)).length;
  const partial = sections.filter((s) => READ_PARTIAL.has(s.outcome)).length;
  const notRead = sections.filter((s) => NOT_READ.has(s.outcome));
  const unreviewed = selection?.unreviewed ?? [];

  const skipped = (strategy?.topics ?? []).filter((t) => t.treatment === 'SKIP');
  const skippedIds = new Set(skipped.map((t) => t.topicId));
  const deferred = (strategy?.deferred ?? []).filter((d) => d.topicId == null || !skippedIds.has(d.topicId));
  const unread = strategy?.unreadNotes ?? [];

  const courses = strategy?.courses ?? [];
  const order = courses.length > 0
    ? courses.map((c) => ({ courseId: c.courseId, title: projectTitles[c.courseId] ?? '프로젝트', focus: c.focus, reason: c.reason }))
    : [];

  // 항목은 화면 순서 그대로 — 모델이 낸 순서가 곧 권하는 진행 순서다.
  const firstItems = items.slice(0, 3).map((it) => it.title);

  // 수행 기록이 하나도 없으면 난이도·분량은 추정이다. 기록이 있어도 "이 사용자가 해낼 수 있다"의 증거는 실제 수행뿐이다.
  const hasPerformance = history.length > 0;
  const hasSelfReport = userState.some((u) => u.kind === 'SELF_REPORT' || u.kind === 'STATED');

  return {
    goal: strategy?.goal ?? null,
    reach: strategy?.reach ?? null,
    why: strategy?.strategySummary ?? null,
    order,
    itemCount: items.length,
    firstItems,
    userState,
    historyCount: history.length,
    agreementCount: agreements.length,
    assumptions: strategy?.assumptions ?? [],
    questions: strategy?.openQuestions ?? [],
    skipped,
    deferred,
    unread,
    notRead,
    unreviewed,
    grounding: {
      sections: sections.length,
      read,
      partial,
      notRead: notRead.length,
      insufficient: !!selection?.insufficientEvidence,
      known: !!selection,
    },
    fit: hasPerformance ? 'RECORDED' : hasSelfReport ? 'SELF_REPORT' : 'UNKNOWN',
    changes: strategy?.changes ?? [],
    kept: strategy?.keptDecisions ?? [],
    existing: strategy?.existingDecisions ?? [],
  };
}

/** 자료 근거 한 줄. 읽지 않은 것을 읽은 것처럼, 일부만 읽은 것을 다 읽은 것처럼 말하지 않는다. */
export function groundingLine(g) {
  if (!g.known) return '자료를 어떻게 읽었는지 기록이 없어요.';
  if (g.sections === 0) return '이번 초안은 자료 원문 없이 학습 항목과 상담 내용만으로 만들었어요.';
  const parts = [];
  if (g.read > 0) parts.push(`원문 ${g.read}곳을 읽음`);
  if (g.partial > 0) parts.push(`${g.partial}곳은 일부·발췌만`);
  if (g.notRead > 0) parts.push(`${g.notRead}곳은 못 읽음`);
  return `${parts.join(' · ')}${g.insufficient ? ' — 근거가 부족하다고 판단했어요' : ''}`;
}

/** 적합성 한 줄. 자료를 읽은 것과 사용자가 해낼 수 있는 것을 구분한다. */
export function fitLine(fit) {
  if (fit === 'RECORDED') return '분량·난이도는 실제 수행 기록을 참고한 추정이에요. 한 번의 결과로 과목 전체를 판단하지 않아요.';
  if (fit === 'SELF_REPORT') return '분량·난이도는 내가 말한 상태를 참고한 추정이에요. 실제로 해 본 기록은 아직 없어요.';
  return '이 과목을 실제로 해 본 기록이 아직 없어 분량·난이도는 AI 추정이에요. 해 보면서 기록하면 다음 계획에서 조정돼요.';
}
