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

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  ChevronDown, ChevronRight, Loader2, Sparkles, RefreshCw, AlertCircle,
} from 'lucide-react';
import { projectTidyAPI } from '../../api/api.js';
import {
  TIDY_OP_LABEL, applyButtonLabel, collectDependents, dependentsOf,
  describeJob, describeReadiness, describeScope, partialNote, saveStateText,
} from '../../lib/tidyLabels.js';
import * as tidyEdits from '../../lib/tidyEditStore.js';

export default function ProjectTidyPanel({ courseId, refreshToken = 0, onApplied = null, onOpenMaterials = null }) {
  const [view, setView] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [openGroups, setOpenGroups] = useState(() => new Set());
  const [detailOpen, setDetailOpen] = useState(false);

  /*
    편집은 이 컴포넌트가 들고 있지 않다. tidyEditStore가 주인이고 여기서는 구독만 한다.
    패널은 구역을 옮길 때마다 unmount되는데, 고친 것과 저장 타이머가 여기 있으면 그 순간
    전부 사라지기 때문이다. 저장은 패널이 사라진 뒤에도 이어진다.
  */
  const subscribe = useCallback((fn) => tidyEdits.subscribe(courseId, fn), [courseId]);
  const getSnap = useCallback(() => tidyEdits.getSnapshot(courseId), [courseId]);
  const editState = useSyncExternalStore(subscribe, getSnap, getSnap);
  const edits = editState.edits;
  const saveState = editState.status;

  /*
    생명주기 표. 조회·적용·폐기가 서로를 무효로 만드는 규칙을 한 숫자로 모은다.

    ticket은 "지금 유효한 조회"를 가리킨다. 늦게 온 GET이 화면을 되돌리지 못하게 하려면
    조회를 띄울 때 번호를 매기는 것만으로는 부족하다 — 버리기·적용이 <성공한 순간>에도
    번호를 올려야, 그 전에 떠난 조회가 돌아와 버린 정리안을 다시 그리지 못한다.
    2026-09-21 판에는 이 두 번째 올림이 없었다.
  */
  const ticketRef = useRef(0);
  const invalidate = useCallback(() => { ticketRef.current += 1; return ticketRef.current; }, []);

  const load = useCallback(async () => {
    const mine = invalidate();
    try {
      const next = await projectTidyAPI.get(courseId);
      if (ticketRef.current !== mine) return;
      setView(next);
      tidyEdits.adopt(courseId, next);
      setError(null);
    } catch (err) {
      if (ticketRef.current === mine) setError(err.message || '정리 상태를 불러오지 못했어요.');
    } finally {
      if (ticketRef.current === mine) setLoading(false);
    }
  }, [courseId, invalidate]);

  useEffect(() => {
    // 다시 읽는 동안 화면을 비우지 않는다. 검토 중인 정리안이 깜빡이며 사라지면,
    // 사용자는 자기가 고치던 것이 날아갔다고 읽는다. 첫 조회일 때만 "불러오는 중"을 쓴다.
    setView((current) => {
      if (!current) setLoading(true);
      return current;
    });
    load();
    return () => { ticketRef.current += 1; };
  }, [load, refreshToken]);

  /* 프로젝트를 옮기면 앞 프로젝트의 화면 상태는 버린다 — 늦게 온 응답이 섞이지 않게. */
  useEffect(() => {
    setView(null);
    setLoading(true);
    setError(null);
  }, [courseId]);

  /*
    떠나기 직전에 남은 편집을 곧바로 보낸다. 응답을 기다리지 않는다 — 저장 주인은
    이 컴포넌트보다 오래 살기 때문에, 화면 전환을 네트워크 속도에 묶을 이유가 없다.
  */
  useEffect(() => () => { void tidyEdits.flush(courseId); }, [courseId]);

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

  /** 편집을 바꾼다. 화면은 즉시, 저장은 잠시 뒤. 트리는 바뀌지 않는다 — 검토 초안일 뿐이다. */
  const patchEdits = useCallback((next) => {
    tidyEdits.update(courseId, next);
  }, [courseId]);

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
    // 다시 만들기 전에 남은 편집을 먼저 확정한다. 아직 서버에 없는 편집은 새 판으로
    // 승계될 수 없다 — 승계는 저장된 것만 옮긴다.
    await tidyEdits.flush(courseId);
    const result = await projectTidyAPI.request(courseId, { refresh });
    invalidate();
    setView(result);
  }, '정리를 시작하지 못했어요.');

  const apply = () => run(async () => {
    const titleOverrides = {};
    Object.entries(edits).forEach(([changeId, edit]) => {
      if (edit?.title) titleOverrides[changeId] = edit.title;
    });
    const result = await projectTidyAPI.apply(view.proposalId, {
      revision: view.revision,
      editRevision: editState.editRevision,
      baseTreeVersion: view.baseTreeVersion,
      selectedChangeIds: selectedIds,
      titleOverrides,
    });
    // 서버가 확정한 뒤에야 정리한다. 미리 비우면 실패했을 때 편집을 잃는다.
    invalidate();
    tidyEdits.clear(courseId);
    setView(result);
    await onApplied?.();
    await load();
  }, '적용하지 못했어요.');

  const dismiss = () => run(async () => {
    const result = await projectTidyAPI.dismiss(courseId);
    // 이 두 줄이 "버린 안이 돌아오지 않는다"를 지킨다. 폐기 <성공> 시점에 조회 번호와
    // 편집 세대를 함께 올려, 그 전에 떠난 GET·PUT의 응답을 전부 무효로 만든다.
    invalidate();
    tidyEdits.clear(courseId);
    setView(result);
  }, '버리지 못했어요.');

  /** [나중에]. 남은 편집을 곧바로 보내고 화면만 옮긴다. */
  const later = () => {
    void tidyEdits.flush(courseId);
    onOpenMaterials?.();
  };

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
                          onTitle={(value) => setTitle(change.changeId, value)}
                          onKeepCarried={() => tidyEdits.resolveCarried(courseId, change.changeId, 'KEEP')}
                          onDropCarried={() => tidyEdits.resolveCarried(courseId, change.changeId, 'DROP')} />
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
              <span className={`project-tidy-save${saveState === 'error' || saveState === 'conflict' ? ' is-problem' : ''}`}>
                {saveStateText(saveState)}
              </span>
            )}
          </div>

          {/*
            저장이 실패했을 때 무엇이 어떻게 됐는지 그대로 말한다. 고친 내용은 남아 있고
            다시 보낼 수 있다는 사실이 화면에 있어야, 사용자가 같은 것을 또 치지 않는다.
          */}
          {editState.errorText && (
            <p className="view-error project-tidy-save-error">
              <AlertCircle size={13} /> {editState.errorText}
              {' '}고친 내용은 그대로 있어요.
              <button type="button" className="btn-ghost btn-sm" disabled={busy}
                onClick={() => tidyEdits.flush(courseId)}>다시 저장</button>
            </p>
          )}

          {/*
            같은 변경을 두 곳에서 다르게 고쳤다. 한쪽을 임의로 이기게 하면 다른 쪽이
            소리 없이 사라진다 — 무엇과 무엇이 부딪혔는지 보여주고 사용자가 정한다.
          */}
          {editState.conflicts.length > 0 && (
            <ul className="project-tidy-conflicts">
              {editState.conflicts.map((conflict) => {
                const label = changeById[conflict.changeId]?.text ?? conflict.changeId;
                return (
                  <li key={conflict.changeId}>
                    <p className="project-tidy-conflict-what">{label}</p>
                    <p className="view-sub-dim">
                      내가 고친 값: {describeEditValue(conflict.mine)}
                      {' · '}다른 곳의 값: {describeEditValue(conflict.theirs)}
                    </p>
                    <button type="button" className="btn-ghost btn-sm" disabled={busy}
                      onClick={() => tidyEdits.resolveConflict(courseId, conflict.changeId, 'mine')}>
                      내 편집 유지
                    </button>
                    <button type="button" className="btn-ghost btn-sm" disabled={busy}
                      onClick={() => tidyEdits.resolveConflict(courseId, conflict.changeId, 'theirs')}>
                      다른 곳의 값 사용
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {editState.unconfirmed.length > 0 && (
            <p className="project-tidy-warn" role="status">
              이전 판에서 옮겨 온 편집 {editState.unconfirmed.length}건을 확인해야 적용할 수 있어요:
              {' '}{editState.unconfirmed.map((id) => changeById[id]?.text ?? id).join(', ')}
              {!detailOpen && (
                <button type="button" className="btn-ghost btn-sm" onClick={() => setDetailOpen(true)}>
                  확인할 항목 펼치기
                </button>
              )}
            </p>
          )}

          <div className="project-tidy-actions">
            {/*
              아직 서버에 닿지 않은 편집이 하나라도 있으면 적용을 막는다(editState.dirty).
              그대로 보내면 판 번호가 어긋나 409가 나는데, 사용자가 보기엔 방금 고친 것이
              이유 없이 거절당한 것이다. "요청 하나가 끝났다"가 아니라 "보낼 것이 남지
              않았다"가 기준이어야 한다 — 앞엣것은 전송 중에 더 고친 경우를 놓친다.
            */}
            <button type="button" className="btn-primary"
              disabled={busy || view.treeChanged || selectedIds.length === 0
                || editState.dirty || saveState === 'error' || saveState === 'conflict'
                || editState.unconfirmed.length > 0}
              onClick={apply}>
              {busy ? <Loader2 size={14} className="spin" /> : null}
              {applyButtonLabel(selectedIds.length, changes.length)}
            </button>
            {onOpenMaterials && (
              <button type="button" className="btn-ghost" disabled={busy} onClick={later}>나중에</button>
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
function ChangeRow({ change, excluded, edit, busy, onToggle, onTitle, onKeepCarried, onDropCarried }) {
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
      {/*
        판이 바뀌며 옮겨 온 편집. "확인해 주세요"만 쓰면 무엇과 무엇을 비교하라는 건지 알 수
        없다. 전에 붙어 있던 제안, 무엇이 달라졌는지, 내 편집을 나란히 두고 고르게 한다.
      */}
      {edit?.needsConfirm && (
        <div className="project-tidy-confirm" role="group" aria-label="옮겨 온 편집 확인">
          <p className="project-tidy-confirm-head">
            <AlertCircle size={13} /> 확인 필요 · 이전 판에서 옮겨 온 편집이에요
          </p>
          {edit.carriedFrom?.text && (
            <p className="view-sub-dim">전에 붙어 있던 제안: {edit.carriedFrom.text}</p>
          )}
          {edit.carriedFrom?.reason && (
            <p className="view-sub-dim">{edit.carriedFrom.reason}</p>
          )}
          <p className="view-sub-dim">
            내 편집: {edit.excluded ? '이 변경 빼기' : '이 변경 적용'}
            {edit.title ? ` · 제목 「${edit.title}」` : ''}
          </p>
          <div className="project-tidy-confirm-actions">
            <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={onKeepCarried}>
              이 편집 유지
            </button>
            <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={onDropCarried}>
              새 제안 사용
            </button>
          </div>
        </div>
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

/** 충돌 화면에 쓰는 한 줄. 제목과 "빼기"를 사람 말로 쓴다. */
function describeEditValue(value) {
  if (!value) return '고치지 않음';
  const parts = [];
  if (value.title) parts.push(`제목 「${value.title}」`);
  parts.push(value.excluded ? '이 변경 빼기' : '이 변경 적용');
  return parts.join(' · ');
}
