/**
 * 프로젝트 전체 학습 지도.
 *
 * 자료 파일이 아니라 주제(topic)가 뿌리다. 같은 주제를 여러 자료가 다루고, 같은 주제가 여러 주차에
 * 걸쳐 나올 수 있어서 — 파일을 뿌리로 두면 같은 내용이 파일 수만큼 흩어진다. 자료는 각 주제 줄에
 * "어디에 나오는지(위치)"로 붙는다.
 *
 * 보기는 둘이다: 주제별(기본) / 주차별. 둘은 같은 학습 항목을 다르게 늘어놓은 것일 뿐이라, 한 항목이
 * 여러 주차에 나타나도 진도·자기평가는 하나다. 주차는 서버가 준 것만 쓴다(learningMapModel 참고) — 사용자가
 * 확인한 자료의 주차다. 확인 전 추천은 지도에 없고, "자료 주차 확인"(MaterialWeekReview)에서 확인한다.
 *
 * "자동 분석 제안(승인 전)"은 아직 지도에 없는 것이다. 지도 안에 겹쳐 보여 주되 읽기 전용이고, 진도
 * 표시·조작이 없고, 글자 라벨로 구분한다. 적용은 기존 변경안 카드가 한다.
 *
 * ★ 지도 정리는 선택이다. 이 화면이 어떤 상태든 상담·계획으로 가는 길이 보여야 한다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2, ChevronDown, ChevronRight, Circle, CircleDot, FileText, Search, Sparkles, X,
} from 'lucide-react';
import { materialAnalysisStatusAPI, structureAPI } from '../../api/api.js';
import { TOPIC_PROGRESS_STATUS_LABEL, TopicProgressStatus } from '../../types/learning.js';
import { CHANGE_OP_LABEL, analysisStateLabel, sectionRoleLabel } from '../../lib/analysisLabels.js';
import TopicDetail from './TopicDetail.jsx';
import SelfCheckActivity from './SelfCheckActivity.jsx';
import StructureEditor from './StructureEditor.jsx';
import MaterialWeekReview from './MaterialWeekReview.jsx';
import {
  SELF_CHECK_LABEL, ancestorIdsOf, flattenTopics, loadLearningMap, mapStates, searchTopics,
} from './learningMapModel.js';
import '../../styles/learning-map.css';
import '../../styles/material-weeks.css';

const STATUS_ICON = {
  [TopicProgressStatus.LEARNED]: CheckCircle2,
  [TopicProgressStatus.IN_PROGRESS]: CircleDot,
  [TopicProgressStatus.NOT_STARTED]: Circle,
};

/** 한 단계에 한 번에 그리는 형제 수. 넘으면 "더 보기"로 나눈다 — 수백 개를 첫 화면에 다 그리지 않는다. */
const SIBLING_PAGE = 60;

const UNCONFIRMED_WEEK_NOTE = '확인 전 주차 — 실제 수업 진행과 다를 수 있어요';
const STRUCTURAL_NOTE = '병합·분할해도 완료 표시는 자동으로 옮겨지지 않아요. 주차를 옮겨도 이미 완료한 기록은 취소되지 않아요.';

function prefersReducedMotion() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 검색어와 맞은 부분을 <mark>로. 색만이 아니라 요소 자체가 강조를 뜻한다. */
function Highlight({ text, query }) {
  const value = String(text ?? '');
  const q = String(query ?? '').trim();
  if (!q) return value;
  const at = value.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0) return value;
  return (
    <>
      {value.slice(0, at)}
      <mark className="lm-mark">{value.slice(at, at + q.length)}</mark>
      {value.slice(at + q.length)}
    </>
  );
}

export default function ProjectLearningMap({
  courseId,
  courseTitle = null,
  refreshToken = 0,
  onOpenConsult = null,
  onReviewProposals = null,
  onOpenMaterials = null,
  onAsk = null,
  onMarkTopic = null,
  onChanged = null,
  onStructureSent = null,
}) {
  const [model, setModel] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('topic'); // 'topic' | 'week'
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());
  /** 검색 중에 자동으로 펼쳐진 것을 사용자가 접은 경우. 검색어가 바뀌면 비운다. */
  const [forceCollapsed, setForceCollapsed] = useState(() => new Set());
  const [showProposed, setShowProposed] = useState(true);
  const [selectedTopicId, setSelectedTopicId] = useState(null);
  const [selfCheckOpen, setSelfCheckOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const [weekReviewOpen, setWeekReviewOpen] = useState(false);
  const ticket = useRef(0);
  const rowRefs = useRef(new Map());
  const initializedFor = useRef(null);

  const load = useCallback(async () => {
    const mine = ticket.current + 1;
    ticket.current = mine;
    try {
      const next = await loadLearningMap(courseId);
      if (ticket.current !== mine) return;
      setModel(next);
      setError(null);
      // 처음 읽었을 때만 첫 단계를 펼친다. 다시 읽을 때는 사용자가 만든 펼침 상태를 지킨다.
      if (initializedFor.current !== courseId) {
        initializedFor.current = courseId;
        setExpanded(new Set((next.topics ?? []).map((t) => `topic:${t.topicId}`)));
      }
    } catch (err) {
      if (ticket.current === mine) setError(err.message || '학습 지도를 불러오지 못했어요.');
    } finally {
      if (ticket.current === mine) setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    (async () => { await load(); })();
    return () => { ticket.current += 1; };
  }, [load, refreshToken]);

  const topics = useMemo(() => model?.topics ?? [], [model]);
  const flat = useMemo(() => flattenTopics(topics), [topics]);
  const topicById = useMemo(() => new Map(flat.map((t) => [t.topicId, t])), [flat]);
  const weeks = model?.weeks ?? [];
  const hasWeeks = weeks.length > 0;
  const activeView = hasWeeks ? view : 'topic';

  /**
   * 제안 노드를 붙을 자리별로 나눈다. 기존 항목 아래(byTopic) / 다른 제안 아래(byTemp) / 맨 위(roots).
   * 가리키는 기존 항목이 지도에 없으면(그 사이 구조가 바뀜) 맨 위로 보낸다 — 숨기지 않는다.
   */
  const overlay = useMemo(() => {
    const byTopic = new Map();
    const byTemp = new Map();
    const roots = [];
    (model?.proposed ?? []).forEach((proposal) => {
      (proposal.nodes ?? []).forEach((node) => {
        const entry = { ...node, proposalId: proposal.proposalId, filename: proposal.filename ?? null };
        if (node.parentTempId != null) {
          const list = byTemp.get(node.parentTempId) ?? [];
          list.push(entry);
          byTemp.set(node.parentTempId, list);
        } else if (node.parentTopicId != null && topicById.has(node.parentTopicId)) {
          const list = byTopic.get(node.parentTopicId) ?? [];
          list.push(entry);
          byTopic.set(node.parentTopicId, list);
        } else {
          roots.push(entry);
        }
      });
    });
    return { byTopic, byTemp, roots };
  }, [model, topicById]);

  const search = useMemo(
    () => searchTopics(topics, showProposed ? overlay.byTopic : null, query),
    [topics, overlay, showProposed, query],
  );

  const isExpanded = (key, topicId) => {
    if (forceCollapsed.has(key)) return false;
    if (expanded.has(key)) return true;
    return search.active && search.ancestors.has(topicId);
  };

  const toggle = (key, topicId) => {
    const open = isExpanded(key, topicId);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (open) next.delete(key); else next.add(key);
      return next;
    });
    setForceCollapsed((prev) => {
      const next = new Set(prev);
      if (open) next.add(key); else next.delete(key);
      return next;
    });
  };

  const expandAll = () => {
    const scopes = activeView === 'week' ? weeks.map((_, i) => `w${i}`) : ['topic'];
    const next = new Set();
    scopes.forEach((scope) => flat.forEach((t) => next.add(`${scope}:${t.topicId}`)));
    setExpanded(next);
    setForceCollapsed(new Set());
  };

  const collapseAll = () => {
    setExpanded(new Set());
    setForceCollapsed(new Set(search.active ? [...search.ancestors].map((id) => `topic:${id}`) : []));
  };

  const changeQuery = (value) => {
    setQuery(value);
    setForceCollapsed(new Set());
  };

  /** 선택한 항목이 보이도록 조상을 펼치고, 그 줄로 스크롤한 뒤 포커스를 준다. */
  const jumpToSelected = () => {
    if (selectedTopicId == null) return;
    const path = ancestorIdsOf(topics, selectedTopicId) ?? [];
    setView('topic');
    setQuery('');
    setForceCollapsed(new Set());
    setExpanded((prev) => {
      const next = new Set(prev);
      path.forEach((id) => next.add(`topic:${id}`));
      return next;
    });
    // 펼친 결과가 그려진 다음에 찾는다.
    setTimeout(() => {
      const el = rowRefs.current.get(`topic:${selectedTopicId}`);
      if (!el) return;
      el.scrollIntoView?.({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      el.focus?.();
    }, 0);
  };

  const retryFailed = async () => {
    const failed = (model?.unlinked ?? []).filter((m) => ['FAILED', 'UNAVAILABLE'].includes(m.analysisState));
    if (failed.length === 0) { onOpenMaterials?.(); return; }
    setRetrying(true);
    try {
      for (const m of failed) await materialAnalysisStatusAPI.retry(m.materialId);
      setNotice('다시 분석을 시작했어요. 끝나면 여기에 나타나요.');
      await load();
    } catch (err) {
      setError(err.message || '다시 시도하지 못했어요.');
    } finally {
      setRetrying(false);
    }
  };

  const states = model ? mapStates(model) : [];
  const selectedTopic = selectedTopicId != null ? topicById.get(selectedTopicId) ?? null : null;
  const proposedCount = (model?.proposed ?? []).reduce((sum, p) => sum + (p.nodes ?? []).length, 0);

  const shared = {
    overlay, showProposed, search, query, isExpanded, toggle, rowRefs, selectedTopicId, onMarkTopic,
    onSelect: (topic) => setSelectedTopicId(topic.topicId),
    onReviewProposals,
  };

  return (
    <section className="view-section lm" aria-label="학습 지도">
      <div className="lm-head">
        <h2 className="section-title">학습 지도</h2>
        <span className="view-dim">
          {flat.length > 0 ? `주제 ${flat.length}개` : '아직 항목 없음'}
          {proposedCount > 0 && ` · 승인 전 제안 ${proposedCount}개`}
        </span>
      </div>

      {model?.textbook && (
        <p className="view-sub-dim lm-textbook">지금 교재: {model.textbook}</p>
      )}

      {/* 지도 상태와 무관하게 늘 보인다. 지도를 정리해야 상담할 수 있다는 인상을 주지 않는다. */}
      <p className="lm-optional">
        지도를 정리하지 않아도 상담과 계획은 바로 할 수 있어요.
        {onOpenConsult && (
          <button type="button" className="btn-primary btn-sm" onClick={() => onOpenConsult(courseId)}>
            <Sparkles size={13} aria-hidden="true" /> 이 프로젝트로 상담하기
          </button>
        )}
      </p>

      {loading && !model && <p className="view-dim" role="status">학습 지도를 불러오는 중...</p>}
      {error && (
        <p className="view-error" role="alert">
          {error}{' '}
          <button type="button" className="btn-ghost btn-sm" onClick={load}>다시 불러오기</button>
        </p>
      )}
      {notice && <p className="hint" role="status">{notice}</p>}

      {model && (
        <MapStateNotices
          states={states}
          model={model}
          retrying={retrying}
          onRetryFailed={retryFailed}
          onReload={load}
          onReviewProposals={onReviewProposals}
          onOpenMaterials={onOpenMaterials}
          onStartSelfCheck={topics.length > 0 ? () => setSelfCheckOpen(true) : null}
        />
      )}

      {model && (model.state?.materials ?? 0) > 0 && model.weekReview && (
        <WeekReviewNotice review={model.weekReview} hasWeeks={hasWeeks} onOpen={() => setWeekReviewOpen(true)} />
      )}

      {model && topics.length > 0 && (
        <MapCorrections courseId={courseId} refreshKey={model} onChanged={async () => { await load(); await onChanged?.(); }} />
      )}

      {model && (topics.length > 0 || overlay.roots.length > 0) && (
        <>
          <div className="lm-toolbar">
            {hasWeeks && (
              <div className="lm-tabs" role="tablist" aria-label="학습 지도 보기">
                <button type="button" role="tab" aria-selected={activeView === 'topic'}
                  className={`lm-tab${activeView === 'topic' ? ' is-active' : ''}`} onClick={() => setView('topic')}>
                  주제별
                </button>
                <button type="button" role="tab" aria-selected={activeView === 'week'}
                  className={`lm-tab${activeView === 'week' ? ' is-active' : ''}`} onClick={() => setView('week')}>
                  주차별
                </button>
              </div>
            )}
            <label className="lm-search">
              <Search size={13} aria-hidden="true" />
              <input type="search" value={query} placeholder="주제·자료 이름 찾기" aria-label="학습 지도에서 찾기"
                onChange={(e) => changeQuery(e.target.value)} />
              {query && (
                <button type="button" className="icon-btn" aria-label="검색어 지우기" onClick={() => changeQuery('')}>
                  <X size={13} />
                </button>
              )}
            </label>
            <div className="lm-toolbar-actions">
              <button type="button" className="btn-ghost btn-sm" onClick={expandAll}>모두 펼치기</button>
              <button type="button" className="btn-ghost btn-sm" onClick={collapseAll}>모두 접기</button>
              <button type="button" className="btn-ghost btn-sm" disabled={selectedTopicId == null}
                onClick={jumpToSelected}>
                선택한 항목으로 이동
              </button>
            </div>
            {proposedCount > 0 && (
              <label className="lm-overlay-toggle">
                <input type="checkbox" checked={showProposed} onChange={(e) => setShowProposed(e.target.checked)} />
                <span>자동 분석 제안 함께 보기</span>
              </label>
            )}
          </div>

          {search.active && (
            <p className="lm-search-result" role="status">
              {search.matched.size > 0
                ? `"${query.trim()}"에 맞는 항목 ${search.matched.size}개 — 있는 자리까지 펼쳤어요`
                : `"${query.trim()}"에 맞는 항목이 없어요`}
            </p>
          )}

          <div className="lm-body">
            <div className="lm-tree-pane">
              {activeView === 'topic' ? (
                <>
                  <TopicList nodes={topics} scope="topic" depth={0} insideMatch={false} shared={shared} />
                  {showProposed && overlay.roots.length > 0 && (
                    <div className="lm-proposed-roots">
                      <p className="lm-proposed-roots-title">맨 위에 새로 생길 항목</p>
                      <ul className="lm-tree">
                        {overlay.roots.map((node) => (
                          <ProposedNode key={`${node.proposalId}-${node.tempId}`} node={node} depth={0} shared={shared} />
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <WeekView weeks={weeks} topics={topics} topicById={topicById} model={model} shared={shared}
                  onOpenReview={() => setWeekReviewOpen(true)} />
              )}
            </div>

            {selectedTopic && (
              <div className="lm-detail-pane">
                <TopicDetail
                  courseTitle={courseTitle ?? model.title}
                  ancestors={(ancestorIdsOf(topics, selectedTopic.topicId) ?? [])
                    .map((id) => ({ topicId: id, title: topicById.get(id)?.title }))}
                  topic={selectedTopic}
                  onProgressChanged={async () => { await load(); await onChanged?.(); }}
                  onStartTutor={onAsk ? (topic) => onAsk(`${topic.title}에 대해 알려줘.`) : undefined}
                />
                <StructureEditor
                  key={selectedTopic.topicId}
                  courseId={courseId}
                  topic={selectedTopic}
                  topics={flat}
                  onSent={async (result) => {
                    setNotice(`변경 ${result?.added ?? 0}개를 검토 목록에 더했어요. 아래 정리 구역에서 전후 구조를 보고 적용하세요.`);
                    await onStructureSent?.();
                  }}
                />
              </div>
            )}
          </div>
        </>
      )}

      {model && (model.unlinked ?? []).length > 0 && <UnlinkedGroup unlinked={model.unlinked} query={query} />}

      {weekReviewOpen && (
        <MaterialWeekReview
          courseId={courseId}
          onClose={() => setWeekReviewOpen(false)}
          onChanged={async () => { await load(); await onChanged?.(); }}
        />
      )}

      {selfCheckOpen && topics.length > 0 && (
        <SelfCheckActivity
          courseId={courseId}
          groups={topics}
          onClose={() => setSelfCheckOpen(false)}
          onSubmitted={async (count) => {
            setSelfCheckOpen(false);
            setNotice(`${count}개를 자기평가로 저장했어요. 완료로 바뀌지는 않고, 다음 상담에 반영돼요.`);
            await load();
          }}
        />
      )}
      {model && topics.length > 0 && !selfCheckOpen && !states.includes('NO_RECORDS') && (
        <p className="lm-selfcheck-entry">
          <button type="button" className="btn-ghost btn-sm" onClick={() => setSelfCheckOpen(true)}>
            점검 활동 해보기 (선택)
          </button>
          <span className="view-dim">시험이 아니라 자기평가예요. 다음 상담에 반영돼요.</span>
        </p>
      )}
    </section>
  );
}

/**
 * 사용자가 정정한 실제 수업 진행과 범위 제외. 교재 구조와 따로 보인다 — 정정은 재분석·재정리에서도 유지된다.
 * 범위 제외는 여기서 바로 풀 수 있다(자기 정정을 되돌리는 것이라 검토를 거치지 않는다). 없으면 아무것도 그리지 않는다.
 */
function MapCorrections({ courseId, refreshKey, onChanged }) {
  const [view, setView] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const next = await structureAPI.corrections(courseId);
        if (alive) setView(next);
      } catch {
        // 정정 목록을 못 읽어도 지도는 그대로 보인다. 없는 정정을 있다고 하지 않을 뿐이다.
        if (alive) setView(null);
      }
    })();
    return () => { alive = false; };
  }, [courseId, refreshKey]);
  if (!view || ((view.classProgress ?? []).length === 0 && (view.exclusions ?? []).length === 0)) return null;
  const ordered = (view.classProgress ?? []).filter((c) => c.classSeq != null);
  const remove = async (exclusionId) => {
    setBusy(true);
    setError(null);
    try {
      setView(await structureAPI.removeExclusion(courseId, exclusionId));
      await onChanged?.();
    } catch (err) {
      setError(err.message || '풀지 못했어요.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="lm-corrections" aria-label="내가 정정한 실제 수업·범위">
      {ordered.length > 0 && (
        <p><span className="lm-corrections-label">실제 수업 순서</span>
          {ordered.map((c) => `${c.title}${c.weekNo ? `(${c.weekNo}주차)` : ''}`).join(' → ')}
        </p>
      )}
      {(view.exclusions ?? []).length > 0 && (
        <ul>
          {view.exclusions.map((e) => (
            <li key={e.exclusionId}>
              <span className="lm-corrections-label">{e.label || '이번 계획'} 범위에서 뺌</span> {e.title}
              <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => remove(e.exclusionId)}>풀기</button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="view-error">{error}</p>}
    </div>
  );
}

/**
 * 다섯 상태. 각자 다른 말과 다른 다음 행동을 갖는다 — "비어 있어요" 한 줄로 뭉개면 사용자는 기다려야
 * 하는지, 뭘 눌러야 하는지, 고장인지 알 수 없다.
 */
function MapStateNotices({
  states, model, retrying, onRetryFailed, onReload, onReviewProposals, onOpenMaterials, onStartSelfCheck,
}) {
  const s = model.state ?? {};
  const topicCount = s.topics ?? 0;
  if (states.length === 0 && topicCount === 0) {
    return (
      <div className="lm-state" data-state="EMPTY" role="status">
        <p className="lm-state-title">분석은 끝났지만 지도에 올릴 구조 제안은 없었어요</p>
        <p className="lm-state-desc">자료 내용은 상담과 계획에서 그대로 쓰여요.</p>
      </div>
    );
  }
  return (
    <>
      {states.includes('NO_MATERIAL') && (
        <div className="lm-state" data-state="NO_MATERIAL" role="status">
          <p className="lm-state-title">아직 올린 자료가 없어요</p>
          <p className="lm-state-desc">강의 자료나 교재 목차를 올리면 여기에 주제 지도가 만들어져요.</p>
          {onOpenMaterials && (
            <button type="button" className="btn-ghost btn-sm" onClick={onOpenMaterials}>자료 올리기</button>
          )}
        </div>
      )}
      {states.includes('PROPOSAL_WAITING') && (
        <div className="lm-state" data-state="PROPOSAL_WAITING" role="status">
          <p className="lm-state-title">승인을 기다리는 구조 제안이 있어요</p>
          <p className="lm-state-desc">
            아래 지도에 &quot;자동 분석 제안(승인 전)&quot;으로 미리 보여요. 적용하기 전에는 지도가 바뀌지 않고,
            승인하지 않아도 상담·계획에는 자료 내용이 쓰여요.
          </p>
          {onReviewProposals && (
            <button type="button" className="btn-ghost btn-sm" onClick={() => onReviewProposals(null)}>
              제안 검토하기
            </button>
          )}
        </div>
      )}
      {states.includes('ANALYSIS_PENDING') && (
        <div className="lm-state" data-state="ANALYSIS_PENDING" role="status">
          <p className="lm-state-title">자료 {s.analysisPending}개를 분석하려고 기다리는 중이에요</p>
          <p className="lm-state-desc">끝나면 구조 제안이 여기에 나타나요. 기다리는 동안에도 상담은 할 수 있어요.</p>
          <button type="button" className="btn-ghost btn-sm" onClick={onReload}>지금 다시 확인</button>
        </div>
      )}
      {states.includes('ANALYSIS_FAILED') && (
        <div className="lm-state is-problem" data-state="ANALYSIS_FAILED" role="status">
          <p className="lm-state-title">분석하지 못한 자료가 {s.analysisFailed}개 있어요</p>
          <p className="lm-state-desc">그 자료의 내용은 지도에 없어요. 다시 시도할 수 있어요.</p>
          <button type="button" className="btn-ghost btn-sm" disabled={retrying} onClick={onRetryFailed}>
            {retrying ? '다시 시도하는 중...' : '분석 다시 시도'}
          </button>
        </div>
      )}
      {states.includes('NO_RECORDS') && (
        <div className="lm-state" data-state="NO_RECORDS" role="status">
          <p className="lm-state-title">아직 학습 기록이 없어요</p>
          <p className="lm-state-desc">
            계획한 일을 기록하면 주제마다 진행이 쌓여요. 이미 아는 내용이 있다면 점검 활동으로 먼저 알려 줄 수 있어요.
          </p>
          {onStartSelfCheck && (
            <button type="button" className="btn-ghost btn-sm" onClick={onStartSelfCheck}>점검 활동 해보기 (선택)</button>
          )}
        </div>
      )}
    </>
  );
}

function TopicList({ nodes, scope, depth, insideMatch, shared }) {
  const [limit, setLimit] = useState(SIBLING_PAGE);
  const { search } = shared;
  const visible = search.active && !insideMatch
    ? nodes.filter((n) => search.matched.has(n.topicId) || search.ancestors.has(n.topicId))
    : nodes;
  const shown = visible.slice(0, limit);

  if (visible.length === 0) return null;
  return (
    <ul className="lm-tree">
      {shown.map((topic) => (
        <TopicNode key={topic.topicId} topic={topic} scope={scope} depth={depth} insideMatch={insideMatch} shared={shared} />
      ))}
      {visible.length > shown.length && (
        <li className="lm-more">
          <button type="button" className="btn-ghost btn-sm" onClick={() => setLimit((v) => v + SIBLING_PAGE)}>
            나머지 {visible.length - shown.length}개 더 보기
          </button>
        </li>
      )}
    </ul>
  );
}

function TopicNode({ topic, scope, depth, insideMatch, shared }) {
  const {
    overlay, showProposed, search, query, isExpanded, toggle, rowRefs, selectedTopicId, onSelect, onMarkTopic,
  } = shared;
  const key = `${scope}:${topic.topicId}`;
  const children = topic.children ?? [];
  const proposedHere = showProposed ? overlay.byTopic.get(topic.topicId) ?? [] : [];
  const hasChildren = children.length > 0 || proposedHere.length > 0;
  const open = hasChildren && isExpanded(key, topic.topicId);
  const StatusIcon = STATUS_ICON[topic.progressStatus] ?? Circle;
  const isMatch = search.active && search.matched.has(topic.topicId);
  const materials = topic.materials ?? [];
  const mark = topic.userMark ?? null;

  return (
    <li className="lm-node">
      <div className={`lm-row${selectedTopicId === topic.topicId ? ' is-selected' : ''}${isMatch ? ' is-match' : ''}`}
        style={{ '--lm-depth': depth }}>
        {hasChildren ? (
          <button type="button" className="lm-toggle" aria-expanded={open}
            aria-label={`${topic.title} ${open ? '접기' : '펼치기'}`} onClick={() => toggle(key, topic.topicId)}>
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : <span className="lm-toggle-spacer" aria-hidden="true" />}

        <div className="lm-row-main">
          <button type="button" className="lm-title-btn" aria-current={selectedTopicId === topic.topicId ? 'true' : undefined}
            ref={(el) => { if (el) rowRefs.current.set(key, el); else rowRefs.current.delete(key); }}
            onClick={() => onSelect(topic)}>
            <StatusIcon size={14} aria-hidden="true" className={`lm-status-icon lm-status-${topic.progressStatus}`} />
            <span className="lm-title"><Highlight text={topic.title} query={query} /></span>
          </button>

          <span className="lm-meta">
            <span className="lm-progress">{TOPIC_PROGRESS_STATUS_LABEL[topic.progressStatus] ?? '진행 미확인'}</span>
            {topic.plannedItems != null && (
              <span>계획한 일 {topic.plannedItems}개 · 끝낸 일 {topic.doneItems ?? 0}개</span>
            )}
            {SELF_CHECK_LABEL[topic.selfCheck] && (
              <span className="chip chip-status">자기평가: {SELF_CHECK_LABEL[topic.selfCheck]}</span>
            )}
            {topic.classWeek != null && (
              <span className="chip">실제 수업 {topic.classWeek}주차{topic.classSeq != null ? ` · ${topic.classSeq}번째` : ''}</span>
            )}
            {topic.classWeek == null && topic.classSeq != null && (
              <span className="chip">실제 수업 {topic.classSeq}번째</span>
            )}
            {topic.scopeLabel != null && (
              <span className="chip chip-status">{topic.scopeLabel || '이번 계획'} 범위에서 뺌</span>
            )}
            {topic.priorTextbook && (
              <span className="chip chip-status" title="교재를 바꾸기 전 책의 목차에서 온 항목이에요. 기록은 그대로이고, 지금 교재의 범위로 세지 않아요.">
                이전 교재 목차
              </span>
            )}
            {!topic.priorTextbook && topic.tocOrigin === 'WEB' && (
              <span className="chip chip-status" title="서점 페이지의 목차에서 온 항목이에요. 목차 제목·쪽만 확인했고 본문은 보지 않았어요.">
                웹 목차
              </span>
            )}
            {topic.mergedDoneItems > 0 && (
              <span className="chip chip-warn" title="병합으로 보관된 항목에 남아 있는 기록이에요. 이 항목의 상태는 직접 확인해 주세요.">
                합친 항목의 끝낸 일 {topic.mergedDoneItems}개 · 상태 확인 필요
              </span>
            )}
            {mark === 'KNOWN' && <span className="chip chip-status">이미 알아요</span>}
            {mark === 'DEFER' && <span className="chip chip-status">나중에</span>}
            {!open && proposedHere.length > 0 && (
              <span className="chip lm-proposed-chip">승인 전 제안 {proposedHere.length}개</span>
            )}
          </span>

          {materials.length > 0 && (
            <ul className="lm-materials" aria-label={`${topic.title}에 연결된 자료`}>
              {materials.map((m, i) => (
                <li key={`${m.materialId}-${m.sectionId ?? i}`} className="lm-material">
                  <FileText size={12} aria-hidden="true" />
                  <span className="lm-material-name"><Highlight text={m.filename} query={query} /></span>
                  {m.locator && <span className="lm-material-locator">{m.locator}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {onMarkTopic && (
          <span className="lm-marks">
            <button type="button" className={`btn-ghost btn-sm${mark === 'KNOWN' ? ' is-active' : ''}`}
              aria-pressed={mark === 'KNOWN'} onClick={() => onMarkTopic(topic.topicId, mark === 'KNOWN' ? null : 'KNOWN')}>
              이미 알아요
            </button>
            <button type="button" className={`btn-ghost btn-sm${mark === 'DEFER' ? ' is-active' : ''}`}
              aria-pressed={mark === 'DEFER'} onClick={() => onMarkTopic(topic.topicId, mark === 'DEFER' ? null : 'DEFER')}>
              나중에
            </button>
          </span>
        )}
      </div>

      {/* 접힌 가지의 자식은 아예 만들지 않는다. 펼칠 때 처음 그려진다. */}
      {open && (
        <>
          {proposedHere.length > 0 && (
            <ul className="lm-tree lm-tree-proposed">
              {proposedHere.map((node) => (
                <ProposedNode key={`${node.proposalId}-${node.tempId}`} node={node} depth={depth + 1} shared={shared} />
              ))}
            </ul>
          )}
          <TopicList nodes={children} scope={scope} depth={depth + 1}
            insideMatch={insideMatch || isMatch} shared={shared} />
        </>
      )}
    </li>
  );
}

/**
 * 승인 전 제안 한 줄. 읽기 전용이다 — 진도 아이콘도, 표식 버튼도, 선택도 없다.
 * 점선 테두리만으로 구분하지 않고 "자동 분석 제안(승인 전)"을 글자로 적는다.
 */
function ProposedNode({ node, depth, shared }) {
  const { overlay, query, onReviewProposals } = shared;
  const nested = overlay.byTemp.get(node.tempId) ?? [];
  const structural = node.op === 'MERGE' || node.op === 'SPLIT' || node.op === 'MOVE';
  return (
    <li className="lm-node lm-proposed" data-proposed="true">
      <div className="lm-row lm-proposed-row" style={{ '--lm-depth': depth }}>
        <span className="lm-toggle-spacer" aria-hidden="true" />
        <div className="lm-row-main">
          <span className="lm-proposed-head">
            <span className="chip lm-proposed-chip">자동 분석 제안(승인 전)</span>
            <span className="chip chip-status">{CHANGE_OP_LABEL[node.op] ?? '변경'}</span>
          </span>
          <span className="lm-title"><Highlight text={node.title} query={query} /></span>
          <span className="lm-meta">
            {node.filename && <span><FileText size={12} aria-hidden="true" /> {node.filename}</span>}
            {(node.sections ?? []).map((sec) => (
              <span key={sec.sectionId} className="lm-material-locator">
                {sec.title}{sec.locator ? ` (${sec.locator})` : ''}
              </span>
            ))}
          </span>
          {structural && <p className="lm-proposed-note">{STRUCTURAL_NOTE}</p>}
          {onReviewProposals && (
            <button type="button" className="btn-ghost btn-sm lm-proposed-review"
              onClick={() => onReviewProposals(node.proposalId)}>
              변경안에서 검토·적용하기
            </button>
          )}
        </div>
      </div>
      {nested.length > 0 && (
        <ul className="lm-tree lm-tree-proposed">
          {nested.map((child) => (
            <ProposedNode key={`${child.proposalId}-${child.tempId}`} node={child} depth={depth + 1} shared={shared} />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * 자료 주차 확인 알림. 추천은 여기서 보여 주지 않는다 — 몇 개가 남았는지와 여는 길만.
 * 확인할 것이 없으면 한 줄로 줄이고 고치는 길만 남긴다.
 */
function WeekReviewNotice({ review, hasWeeks, onOpen }) {
  if ((review.needsReview ?? 0) > 0) {
    return (
      <div className="lm-state" data-state="WEEK_REVIEW" role="status">
        <p className="lm-state-title">자료 주차 확인 필요 {review.needsReview}개</p>
        <p className="lm-state-desc">
          주차별 보기는 확인한 자료로만 만들어요. AI가 추천한 주차를 한 화면에서 보고, 맞으면 적용하고 다르면 옮기세요.
        </p>
        <button type="button" className="btn-ghost btn-sm" onClick={onOpen}>자료 주차 확인하기</button>
      </div>
    );
  }
  return (
    <p className="lm-week-review view-dim">
      {hasWeeks ? '모든 자료의 주차를 확인했어요.' : '확인한 자료 중 특정 주차에 놓인 것이 없어요.'}
      <button type="button" className="btn-ghost btn-sm" onClick={onOpen}>자료 주차 고치기</button>
    </p>
  );
}

/**
 * 주차별 보기. 주차 → 그 주차에 확인된 자료 → 그 자료와 직접 연결된 항목. 한 항목이 여러 주차에 나와도 같은
 * 항목이고 진도는 하나다. 같은 주차 안에서 상위 항목 아래에 이미 보이는 항목은 따로 되풀이하지 않는다.
 * 어느 주차에도 없는 항목은 버리지 않고 맨 아래에 모은다.
 */
function WeekView({ weeks, topics, topicById, model, shared, onOpenReview }) {
  const filenameById = new Map();
  flattenTopics(topics).forEach((t) => (t.materials ?? []).forEach((m) => filenameById.set(m.materialId, m.filename)));
  (model.unlinked ?? []).forEach((m) => filenameById.set(m.materialId, m.filename));
  weeks.forEach((w) => (w.materials ?? []).forEach((m) => filenameById.set(m.materialId, m.filename)));

  const placed = new Set();
  weeks.forEach((w) => (w.topicIds ?? []).forEach((id) => placed.add(id)));
  const leftovers = topics.filter((t) => !flattenTopics([t]).some((n) => placed.has(n.topicId)));
  const courseWide = model.weekReview?.courseWide ?? [];

  return (
    <div className="lm-weeks">
      {weeks.map((week, i) => {
        const ids = new Set(week.topicIds ?? []);
        // 상위 항목이 이 주차에 있으면 하위 항목은 그 아래에 이미 보인다 — 맨 위에 한 번 더 놓지 않는다.
        const weekTopics = (week.topicIds ?? [])
          .filter((id) => !(ancestorIdsOf(topics, id) ?? []).some((a) => a !== id && ids.has(a)))
          .map((id) => topicById.get(id)).filter(Boolean);
        const files = (week.materialIds ?? []).map((id) => filenameById.get(id)).filter(Boolean);
        return (
          <section key={`${week.label}-${i}`} className="lm-week" aria-label={week.label}>
            <h3 className="lm-week-title">{week.label}</h3>
            {week.confirmed !== true && <p className="lm-week-note">{UNCONFIRMED_WEEK_NOTE}</p>}
            {files.length > 0 && <p className="lm-week-files">자료: {files.join(' · ')}</p>}
            {weekTopics.length > 0
              ? <TopicList nodes={weekTopics} scope={`w${i}`} depth={0} insideMatch={false} shared={shared} />
              : <p className="view-dim">이 주차 자료에 연결된 주제가 아직 없어요.</p>}
          </section>
        );
      })}
      {leftovers.length > 0 && (
        <section className="lm-week" aria-label="주차가 정해지지 않은 항목">
          <h3 className="lm-week-title">주차가 정해지지 않은 항목</h3>
          <TopicList nodes={leftovers} scope="wx" depth={0} insideMatch={false} shared={shared} />
        </section>
      )}
      {courseWide.length > 0 && (
        <p className="lm-week-reference">
          전체 참고자료: {courseWide.map((m) => m.filename).join(' · ')}
          {onOpenReview && (
            <button type="button" className="btn-ghost btn-sm" onClick={onOpenReview}>자료 주차 고치기</button>
          )}
        </p>
      )}
    </div>
  );
}

function UnlinkedGroup({ unlinked, query }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="lm-unlinked" aria-label="아직 주제에 연결되지 않은 자료">
      <button type="button" className="collapse-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <span className="lm-unlinked-title">아직 주제에 연결되지 않은 자료</span>
        <span className="view-dim">{unlinked.length}개</span>
      </button>
      {open && (
        <>
          <p className="section-desc">주제에 연결되지 않아도 상담·계획에서는 이 자료 내용을 그대로 써요.</p>
          <ul className="lm-unlinked-list">
            {unlinked.map((m) => (
              <li key={m.materialId} className="lm-unlinked-item">
                <span className="lm-unlinked-name">
                  <FileText size={13} aria-hidden="true" /> <Highlight text={m.filename} query={query} />
                  {m.analysisState && <span className="chip chip-status">{analysisStateLabel(m.analysisState).label}</span>}
                </span>
                {(m.sections ?? []).length > 0 && (
                  <ul className="lm-unlinked-sections">
                    {m.sections.map((sec) => (
                      <li key={sec.sectionId}>
                        {sec.locator && <span className="lm-material-locator">{sec.locator}</span>}
                        <span>{sec.title}</span>
                        {(sec.roles ?? []).map((r) => <span key={r} className="chip chip-status">{sectionRoleLabel(r)}</span>)}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
