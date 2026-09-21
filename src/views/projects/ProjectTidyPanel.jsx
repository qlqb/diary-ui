/**
 * 프로젝트 자료 정리 — 요청부터 검토·적용까지 한 구역에서.
 *
 * 왜 자료별 카드가 아닌가: 같은 개념을 강의 슬라이드·교재·실습 안내가 서로 다른 이름으로
 * 다루면, 자료별로는 각자 옳은 제안이 나오고 적용하면 중복 항목만 남는다. 사용자가 판단하는
 * 단위는 "스택이 어떻게 되는가"이지 "3번 파일이 무엇을 제안했는가"가 아니다. 그래서 변경을
 * <영향을 받는 항목>으로 묶어 보여준다.
 *
 * 화면이 지키는 것:
 *  - 정리는 사용자가 누를 때만 시작된다. 자료 분석이 끝나도 여기 아무것도 생기지 않는다.
 *  - 검토 중 고친 것(제목·제외)은 자동 저장되지만 <트리는 바뀌지 않는다>. 저장 실패를 삼키지 않는다.
 *  - 새 자료가 끝나도 지금 보고 있는 안은 그대로다. "반영할 수 있어요"로만 알리고, 다시 만드는 것은
 *    사용자가 누를 때다. 다시 만들다 실패하면 기존 안과 편집이 그대로 남는다.
 *  - 딸린 변경(새 부모 ↔ 그 아래 새 항목)은 체크가 연동된다. 한쪽만 적용되게 두지 않는다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown, ChevronRight, Loader2, Sparkles, RefreshCw, AlertCircle,
} from 'lucide-react';
import { projectTidyAPI } from '../../api/api.js';
import {
  TIDY_OP_LABEL, applyButtonLabel, collectDependents, dependentsOf,
  describeJob, describeReadiness, describeScope, partialNote, saveStateText,
} from '../../lib/tidyLabels.js';

/** 편집을 서버에 밀어 넣기 전에 기다리는 시간. 타자를 칠 때마다 보내지 않는다. */
const AUTOSAVE_MS = 700;

export default function ProjectTidyPanel({ courseId, refreshToken = 0, onApplied = null, onOpenMaterials = null }) {
  const [view, setView] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saveState, setSaveState] = useState(null);
  const [openGroups, setOpenGroups] = useState(() => new Set());
  const [detailOpen, setDetailOpen] = useState(false);

  /** 화면이 들고 있는 편집. 서버 저장은 이 값을 따라간다. */
  const [edits, setEdits] = useState({});
  const editRevisionRef = useRef(0);
  const ticketRef = useRef(0);
  const saveTimerRef = useRef(null);
  /** 마지막으로 서버에 보낸 편집. 같은 값을 다시 보내지 않으려고 둔다. */
  const savedRef = useRef('{}');

  const load = useCallback(async () => {
    const mine = ticketRef.current + 1;
    ticketRef.current = mine;
    try {
      const next = await projectTidyAPI.get(courseId);
      if (ticketRef.current !== mine) return;
      setView(next);
      setEdits(next?.edits ?? {});
      editRevisionRef.current = next?.editRevision ?? 0;
      savedRef.current = JSON.stringify(next?.edits ?? {});
      setError(null);
    } catch (err) {
      if (ticketRef.current === mine) setError(err.message || '정리 상태를 불러오지 못했어요.');
    } finally {
      if (ticketRef.current === mine) setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    setLoading(true);
    load();
    return () => { ticketRef.current += 1; };
  }, [load, refreshToken]);

  /* 만드는 중이면 끝날 때까지 지켜본다. 끝나면 멈춘다 — 조용한 화면에서 계속 묻지 않는다. */
  const generating = view?.job?.status === 'QUEUED' || view?.job?.status === 'RUNNING';
  useEffect(() => {
    if (!generating) return undefined;
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [generating, load]);

  const changes = useMemo(() => view?.changes ?? [], [view]);
  const changeById = useMemo(() => {
    const map = {};
    changes.forEach((c) => { map[c.changeId] = c; });
    return map;
  }, [changes]);
  const dependents = useMemo(() => dependentsOf(view?.dependsOn), [view]);

  const isExcluded = useCallback((changeId) => edits[changeId]?.excluded === true, [edits]);
  const selectedIds = changes.map((c) => c.changeId).filter((id) => !isExcluded(id));

  /** 편집을 바꾸고 잠시 뒤 저장한다. 트리는 바뀌지 않는다 — 검토 초안일 뿐이다. */
  const patchEdits = useCallback((next) => {
    setEdits(next);
    setSaveState('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const payload = JSON.stringify(next);
      if (payload === savedRef.current) {
        setSaveState('saved');
        return;
      }
      try {
        const saved = await projectTidyAPI.saveEdits(view.proposalId, {
          editRevision: editRevisionRef.current,
          edits: next,
        });
        editRevisionRef.current = saved?.editRevision ?? editRevisionRef.current;
        savedRef.current = JSON.stringify(saved?.edits ?? next);
        setEdits(saved?.edits ?? next);
        setSaveState('saved');
      } catch (err) {
        if (err.code === 'E409_029') {
          // 다른 탭이 먼저 고쳤다. 고친 것을 버리지 않고 최신을 읽어 화면에 올린 뒤 알린다.
          setSaveState('stale');
          await load();
        } else {
          setSaveState('error');
        }
      }
    }, AUTOSAVE_MS);
  }, [view, load]);

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  /** 체크를 풀면 이 변경에 딸린 것도 함께 푼다. 반쪽 적용을 만들지 않는다. */
  const toggleChange = (changeId) => {
    const nowExcluded = !isExcluded(changeId);
    const next = { ...edits };
    const targets = nowExcluded
      ? [changeId, ...collectDependents(changeId, dependents)]
      : [changeId, ...(view?.dependsOn?.[changeId] ?? [])];
    targets.forEach((id) => {
      next[id] = { ...(next[id] ?? {}), excluded: nowExcluded };
    });
    patchEdits(next);
  };

  const setTitle = (changeId, title) => {
    patchEdits({ ...edits, [changeId]: { ...(edits[changeId] ?? {}), title } });
  };

  const run = async (fn, failureText) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err.message || failureText);
    } finally {
      setBusy(false);
    }
  };

  const requestTidy = (refresh = false) => run(async () => {
    setView(await projectTidyAPI.request(courseId, { refresh }));
  }, '정리를 시작하지 못했어요.');

  const apply = () => run(async () => {
    const titleOverrides = {};
    Object.entries(edits).forEach(([changeId, edit]) => {
      if (edit?.title) titleOverrides[changeId] = edit.title;
    });
    const result = await projectTidyAPI.apply(view.proposalId, {
      revision: view.revision,
      editRevision: editRevisionRef.current,
      baseTreeVersion: view.baseTreeVersion,
      selectedChangeIds: selectedIds,
      titleOverrides,
    });
    setView(result);
    await onApplied?.();
    await load();
  }, '적용하지 못했어요.');

  const dismiss = () => run(async () => {
    setView(await projectTidyAPI.dismiss(courseId));
    setEdits({});
  }, '버리지 못했어요.');

  if (loading) {
    return (
      <section className="view-section project-tidy">
        <h2 className="section-title">이 프로젝트 자료 정리</h2>
        <p className="view-dim"><Loader2 size={14} className="spin" /> 불러오는 중…</p>
      </section>
    );
  }

  const jobNote = describeJob(view?.job);
  const hasProposal = !!view?.proposalId && view.status === 'PROPOSED';

  return (
    <section className="view-section project-tidy" aria-label="이 프로젝트 자료 정리">
      <div className="project-tidy-head">
        <h2 className="section-title">이 프로젝트 자료 정리</h2>
        {!hasProposal && !generating && (
          <button type="button" className="btn-primary btn-sm" disabled={busy || view?.readyMaterialCount === 0}
            onClick={() => requestTidy(false)}>
            <Sparkles size={13} /> 이 프로젝트 자료 정리
          </button>
        )}
      </div>

      {!hasProposal && (
        <p className={view?.readyMaterialCount === 0 ? 'view-dim' : 'view-sub-dim'}>
          {describeReadiness(view)}
        </p>
      )}
      {!hasProposal && view?.legacyProposalCount > 0 && (
        <p className="view-sub-dim">
          예전 방식(자료 하나씩)으로 만든 변경안 {view.legacyProposalCount}개는 이력으로 남겨 뒀어요.
          이제 프로젝트에 연결된 자료를 함께 보고 한 번에 정리해요.
        </p>
      )}

      {jobNote && (
        <p className={jobNote.tone === 'problem' ? 'view-error' : 'view-dim'}>
          {jobNote.tone === 'busy' ? <Loader2 size={13} className="spin" /> : <AlertCircle size={13} />}
          {' '}{jobNote.text}
          {view?.job?.retryable && (
            <button type="button" className="btn-ghost btn-sm" disabled={busy}
              onClick={() => requestTidy(false)}>다시 시도</button>
          )}
        </p>
      )}

      {error && <p className="view-error">{error}</p>}

      {hasProposal && (
        <>
          <div className="project-tidy-summary">
            <p className="project-tidy-headline">{view.summary?.headline}</p>
            <p className="view-sub-dim">{describeScope(view.scope)}</p>
            {partialNote(view.scope) && <p className="view-sub-dim">{partialNote(view.scope)}</p>}
            {(view.scope?.excluded ?? []).length > 0 && (
              <ul className="project-tidy-excluded">
                {view.scope.excluded.map((item) => (
                  <li key={`${item.materialId}`}>
                    <span className="chip chip-status">{item.reasonLabel}</span>
                    {' '}{item.filename ?? `자료 ${item.materialId}`}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {view.treeChanged && (
            <p className="project-tidy-warn">
              이 정리안을 만든 뒤 학습 구조가 바뀌었어요. 그대로 적용하지 않아요 —
              <button type="button" className="btn-ghost btn-sm" disabled={busy}
                onClick={() => requestTidy(true)}>다시 정리</button>
            </p>
          )}
          {view.newMaterialCount > 0 && (
            <p className="project-tidy-info">
              그 사이 분석이 끝난 자료 {view.newMaterialCount}개가 있어요. 지금 보는 정리안에는 들어 있지 않아요.
              <button type="button" className="btn-ghost btn-sm" disabled={busy}
                onClick={() => requestTidy(true)}>
                <RefreshCw size={12} /> 새 자료 반영해 다시 정리
              </button>
            </p>
          )}

          <ul className="project-tidy-groups">
            {(view.groups ?? []).map((group) => {
              const open = openGroups.has(group.key) || detailOpen;
              const groupChanges = group.changeIds.map((id) => changeById[id]).filter(Boolean);
              return (
                <li key={group.key} className="project-tidy-group">
                  <button type="button" className="collapse-head" aria-expanded={open}
                    onClick={() => setOpenGroups((prev) => {
                      const next = new Set(prev);
                      if (next.has(group.key)) next.delete(group.key); else next.add(group.key);
                      return next;
                    })}>
                    {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    {/* 새로 만들 항목도 이름으로 부른다 — "새로 만들 항목"만 있으면 무엇인지 알 수 없다. */}
                    {group.kind === 'NEW' && <span className="chip chip-status">새 항목</span>}
                    <span className="project-tidy-group-title">{group.title}</span>
                    {group.parentTitle && (
                      <span className="view-sub-dim"> · {group.parentTitle} 아래</span>
                    )}
                    <span className="project-tidy-group-count">변경 {groupChanges.length}</span>
                  </button>
                  {!open && (
                    <ul className="project-tidy-brief">
                      {groupChanges.map((change) => (
                        <li key={change.changeId} className={isExcluded(change.changeId) ? 'is-excluded' : ''}>
                          <span className={`chip ${change.structural ? 'chip-warn' : 'chip-status'}`}>
                            {change.label ?? TIDY_OP_LABEL[change.op]}
                          </span>
                          {' '}{change.text}
                        </li>
                      ))}
                    </ul>
                  )}
                  {open && (
                    <ul className="project-tidy-changes">
                      {groupChanges.map((change) => (
                        <ChangeRow key={change.changeId} change={change} busy={busy}
                          excluded={isExcluded(change.changeId)}
                          edit={edits[change.changeId]}
                          onToggle={() => toggleChange(change.changeId)}
                          onTitle={(value) => setTitle(change.changeId, value)} />
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="project-tidy-foot">
            <button type="button" className="btn-ghost btn-sm" onClick={() => setDetailOpen((v) => !v)}>
              {detailOpen ? '자세히 접기' : '전부 펼쳐 보기'}
            </button>
            {saveStateText(saveState) && (
              <span className={`project-tidy-save${saveState === 'error' ? ' is-problem' : ''}`}>
                {saveStateText(saveState)}
              </span>
            )}
          </div>

          <div className="project-tidy-actions">
            {/*
              저장 중에는 적용을 막는다. 아직 서버에 닿지 않은 편집이 있는 채로 적용하면 판 번호가
              어긋나 409가 나는데, 사용자가 보기엔 방금 고친 것이 이유 없이 거절당한 것이다.
            */}
            <button type="button" className="btn-primary"
              disabled={busy || view.treeChanged || selectedIds.length === 0
                || saveState === 'error' || saveState === 'saving'}
              onClick={apply}>
              {busy ? <Loader2 size={14} className="spin" /> : null}
              {applyButtonLabel(selectedIds.length, changes.length)}
            </button>
            {onOpenMaterials && (
              <button type="button" className="btn-ghost" disabled={busy} onClick={onOpenMaterials}>나중에</button>
            )}
            <button type="button" className="btn-ghost" disabled={busy} onClick={dismiss}>버리기</button>
          </div>
          <p className="view-sub-dim">
            「나중에」는 검토 내용을 그대로 두고 화면만 옮겨요. 「버리기」는 이 정리안을 없애요 — 되살아나지 않아요.
          </p>
        </>
      )}

      {view?.status === 'EMPTY' && (
        <p className="view-dim">자료를 함께 봤지만 바꿀 것이 없었어요. 학습 구조는 그대로예요.</p>
      )}
    </section>
  );
}

/** 변경 하나의 줄. 체크·제목 고치기·근거 보기. */
function ChangeRow({ change, excluded, edit, busy, onToggle, onTitle }) {
  const [showEvidence, setShowEvidence] = useState(false);
  return (
    <li className={`project-tidy-change${change.structural ? ' is-structural' : ''}${excluded ? ' is-excluded' : ''}`}>
      <label className="project-tidy-change-head">
        <input type="checkbox" checked={!excluded} disabled={busy} onChange={onToggle} />
        <span className={`chip ${change.structural ? 'chip-warn' : 'chip-status'}`}>
          {change.label ?? TIDY_OP_LABEL[change.op]}
        </span>
        <span className="project-tidy-change-text">{change.text}</span>
      </label>
      {change.titleEditable && (
        <input type="text" className="input project-tidy-title-input" aria-label="항목 제목 고치기"
          value={edit?.title ?? change.title ?? ''} disabled={busy || excluded}
          onChange={(e) => onTitle(e.target.value)} />
      )}
      {edit?.needsConfirm && (
        <p className="project-tidy-confirm">
          이전 판에서 옮겨 온 편집이에요. 같은 변경이 맞는지 확인해 주세요
        </p>
      )}
      {change.reason && <p className="project-tidy-reason">{change.reason}</p>}
      {change.caution && <p className="hint">{change.caution}</p>}
      {(change.sections ?? []).length > 0 && (
        <>
          <button type="button" className="btn-ghost btn-sm project-tidy-evidence-toggle" aria-expanded={showEvidence}
            onClick={() => setShowEvidence((v) => !v)}>
            근거 {change.sections.length}곳 {showEvidence ? '접기' : '보기'}
          </button>
          {showEvidence && (
            <ul className="project-tidy-evidence">
              {change.sections.map((section) => (
                <li key={section.sectionId}>
                  <span className="project-tidy-evidence-source">
                    {section.materialFilename ?? '자료'} · {section.locator}
                  </span>
                  <span className="project-tidy-evidence-title">{section.title}</span>
                  {section.excerpt && <p className="project-tidy-evidence-excerpt">{section.excerpt}</p>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </li>
  );
}
