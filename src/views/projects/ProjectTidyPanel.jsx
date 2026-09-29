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
import { projectTidyAPI, structureAPI } from '../../api/api.js';
import {
  CHANGE_BY_LABEL, TIDY_OP_LABEL, applyButtonLabel, collectDependents, dependentsOf,
  describeJob, describeReadiness, describeScope, impactLine, partialNote, saveStateText,
} from '../../lib/tidyLabels.js';
import { hasStructureChange, previewStructure } from '../../lib/structurePreview.js';
import * as tidyEdits from '../../lib/tidyEditStore.js';
import MaterialFileLink from '../../components/MaterialFileLink.jsx';
import '../../styles/learning-flow.css';

export default function ProjectTidyPanel({ courseId, refreshToken = 0, onApplied = null, onOpenMaterials = null }) {
  const [view, setView] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [openGroups, setOpenGroups] = useState(() => new Set());
  const [detailOpen, setDetailOpen] = useState(false);
  /** 다시 정리 전에 편집 저장을 기다리는 중. 입력을 막고 그 사실을 말한다. */
  const [savingBeforeRequest, setSavingBeforeRequest] = useState(false);
  /** 학습 구조 조정 요청(말로). 해석 결과는 정리안에 더해지고, 요지·되묻기만 여기 남는다. */
  const [adjustText, setAdjustText] = useState('');
  const [adjustNote, setAdjustNote] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);

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

  /*
    생명 번호. 조회 번호(ticket)와 따로 둔다 — 폴링 조회도 ticket을 올리므로, 그것으로
    "기다리는 사이 무슨 일이 있었나"를 판단하면 평범한 폴링이 다시 정리를 취소해 버린다.
    이 번호는 버리기·적용 성공과 프로젝트 전환·unmount에서만 오른다.
  */
  const lifeRef = useRef(0);
  const courseRef = useRef(courseId);
  courseRef.current = courseId;

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
    return () => { lifeRef.current += 1; };
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

  /** 같은 입력으로 한 번 더. 새 자료는 섞지 않는다. */
  const retryTidy = () => run(async () => {
    const result = await projectTidyAPI.retry(courseId);
    invalidate();
    setView(result);
  }, '다시 시도하지 못했어요.');

  /**
   * [이 프로젝트 자료 정리]·[다시 정리].
   *
   * 다시 만들기 전에 남은 편집이 <서버에 확인될 때까지> 기다린다. 서버는 저장된 편집만 새 판으로
   * 옮기므로, 확인되지 않은 편집을 두고 만들면 사용자가 본 마지막 내용이 새 판에서 사라진다.
   * flush는 "보내 둬"일 뿐 저장 보장이 아니다 — 이미 전송 중이면 기다리지 않고, 실패도 삼킨다.
   * 기다리는 동안 입력은 막는다(busy). 저장이 실패·충돌하거나, 그 사이 정리안이 없어지거나,
   * 프로젝트·계정이 바뀌면 만들지 않는다.
   */
  const requestTidy = (refresh = false) => run(async () => {
    const life = lifeRef.current;
    const course = courseId;
    const stillHere = () => lifeRef.current === life && courseRef.current === course;

    setSavingBeforeRequest(true);
    let saved;
    try {
      saved = await tidyEdits.ensureSaved(course);
    } finally {
      if (stillHere()) setSavingBeforeRequest(false);
    }
    if (!stillHere()) return;
    if (!saved.ok) {
      setError(describeSaveBlock(saved.reason));
      return;
    }

    const result = await projectTidyAPI.request(course, { refresh });
    if (!stillHere()) return;
    invalidate();
    setView(result);
  }, '정리를 시작하지 못했어요.');

  /**
   * "교재 5장을 3장보다 먼저 수업했어" 같은 요청을 변경안으로. 바로 바뀌는 것은 없다 — 정리안에 더해져 검토한다.
   * 모호하면 서버가 되묻는 문장을 준다.
   */
  const requestAdjust = () => run(async () => {
    const text = adjustText.trim();
    if (!text) return;
    await tidyEdits.ensureSaved(courseId);
    const result = await structureAPI.request(courseId, text);
    invalidate();
    setView(result.tidy);
    tidyEdits.adopt(courseId, result.tidy);
    setAdjustNote({ summary: result.summary, question: result.question, added: result.added,
      dropped: result.dropped ?? [] });
    if (result.added > 0) setAdjustText('');
  }, '요청을 변경안으로 옮기지 못했어요.');

  /** 지시를 붙여 자료를 다시 보며 정리한다(비동기). 기존 안과 편집은 새 안이 나올 때까지 남는다. */
  const requestTidyWithInstruction = () => run(async () => {
    const text = adjustText.trim();
    if (!text) return;
    const saved = await tidyEdits.ensureSaved(courseId);
    if (!saved.ok) {
      setError(describeSaveBlock(saved.reason));
      return;
    }
    const result = await projectTidyAPI.request(courseId, { refresh: true, instruction: text });
    invalidate();
    setView(result);
    setAdjustNote({ summary: '자료를 다시 보며 정리하고 있어요. 요청이 반영된 안이 나오면 여기 보여요.', added: 0, dropped: [] });
    setAdjustText('');
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
    lifeRef.current += 1;
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
    lifeRef.current += 1;
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
          {/*
            [다시 시도]는 요청 때의 입력 그대로 한 번 더 한다. 입력이 바뀌어 멈춘 실패는 같은 입력으로
            다시 해도 또 멈추므로 [새로 정리]를 준다 — 지금 자료와 구조로 새로 만든다.
          */}
          {view?.job?.retryable && (
            <button type="button" className="btn-ghost btn-sm" disabled={busy}
              onClick={retryTidy}>다시 시도</button>
          )}
          {view?.job?.needsNewRequest && (
            <button type="button" className="btn-ghost btn-sm" disabled={busy}
              onClick={() => requestTidy(true)}>지금 자료로 새로 정리</button>
          )}
        </p>
      )}

      {/*
        학습 구조 조정: 교재와 실제 수업이 다를 때 말로 정정한다. 교재상의 위치·실제 수업 순서·이번 시험 범위·구조(나누기·합치기)를
        서버가 구분해 변경안으로 만들고, 여기서 검토한 것만 적용된다. 학습 지도를 정리하지 않아도 계획·학습은 할 수 있다.
      */}
      {!generating && (
        <div className="project-adjust">
          <label className="project-adjust-label" htmlFor={`adjust-${courseId}`}>
            학습 구조 조정 <span className="view-sub-dim">(선택 · 교재와 실제 수업이 다를 때)</span>
          </label>
          <textarea id={`adjust-${courseId}`} className="input project-adjust-input" rows={2} maxLength={1000}
            placeholder="예: 교재 5장을 3장보다 먼저 수업했어 / 이 실습은 3주차야 / 이번 중간고사에는 4장이 빠져 / 스택 항목은 너무 넓으니 나눠줘"
            value={adjustText} disabled={busy} onChange={(e) => setAdjustText(e.target.value)} />
          <div className="project-adjust-actions">
            <button type="button" className="btn-primary btn-sm" disabled={busy || !adjustText.trim()}
              onClick={requestAdjust}>
              {busy ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />} 조정안 만들기
            </button>
            <button type="button" className="btn-ghost btn-sm"
              disabled={busy || !adjustText.trim() || view?.readyMaterialCount === 0}
              title="자료 구간을 다시 읽으며 이 요청을 반영해 정리해요(시간이 걸려요)"
              onClick={requestTidyWithInstruction}>
              자료를 다시 보며 정리
            </button>
          </div>
          {adjustNote && (
            <div className="project-adjust-note" role="status">
              {adjustNote.summary && <p>{adjustNote.summary}</p>}
              {adjustNote.added > 0 && <p className="view-sub-dim">변경 {adjustNote.added}개를 아래 검토 목록에 더했어요. 적용 전에는 아무것도 바뀌지 않아요.</p>}
              {adjustNote.question && <p className="project-tidy-warn">확인이 필요해요: {adjustNote.question}</p>}
              {adjustNote.dropped.length > 0 && (
                <p className="view-sub-dim">근거가 없거나 가리키는 항목이 없어 뺀 것 {adjustNote.dropped.length}개</p>
              )}
            </div>
          )}
        </div>
      )}

      {error && <p className="view-error">{error}</p>}
      {savingBeforeRequest && (
        <p className="view-dim" role="status">
          <Loader2 size={13} className="spin" /> 고친 내용을 저장한 뒤 다시 정리해요…
        </p>
      )}

      {hasProposal && (
        <>
          <div className="project-tidy-summary">
            <p className="project-tidy-headline">
              {view.origin === 'USER' && <span className="chip chip-status">직접 고른 조정</span>}
              {view.origin === 'REQUEST' && <span className="chip chip-status">내 요청</span>}
              {' '}{view.summary?.headline}
            </p>
            {view.userRequest && <p className="view-sub-dim">요청: “{view.userRequest}”</p>}
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

          <StructurePreview view={view} selectedIds={selectedIds} open={previewOpen}
            onToggle={() => setPreviewOpen((v) => !v)} />

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
          {editState.recovered?.legacy && editState.conflicts.length > 0 && (
            <p className="project-tidy-warn" role="status">
              새로고침 전에 저장되지 못한 편집을 찾았어요. 예전 저장 형식이라 어느 것이 내가 바꾼 것인지
              알 수 없어 자동으로 보내지 않았어요 — 항목마다 어느 쪽을 쓸지 골라 주세요.
            </p>
          )}
          {editState.conflicts.length > 0 && (
            <ul className="project-tidy-conflicts">
              {editState.conflicts.map((conflict) => {
                const label = changeById[conflict.changeId]?.text ?? conflict.changeId;
                return (
                  <li key={conflict.changeId}>
                    <p className="project-tidy-conflict-what">{label}</p>
                    <p className="view-sub-dim">
                      {conflict.recovered ? '새로고침 전 편집' : '내가 고친 값'}: {describeEditValue(conflict.mine)}
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

/**
 * 변경 전·후 구조. 고른 변경만 반영해 화면에서 계산한다(서버 호출 없음). 실제 수업 주차·범위 제외는 구조가 아니라 표시다.
 */
function StructurePreview({ view, selectedIds, open, onToggle }) {
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const preview = useMemo(
    () => previewStructure(view.tree ?? [], view.changes ?? [], selected),
    [view, selected],
  );
  if (!(view.tree ?? []).length && !(view.changes ?? []).some((c) => c.op === 'ADD')) return null;
  return (
    <div className="structure-preview">
      <button type="button" className="collapse-head" aria-expanded={open} onClick={onToggle}>
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />} 구조 전후 보기
        {!hasStructureChange(preview.after) && <span className="view-sub-dim"> · 고른 변경으로 바뀌는 곳 없음</span>}
      </button>
      {open && (
        <div className="structure-preview-cols">
          <div>
            <p className="structure-preview-label">지금</p>
            <PreviewTree nodes={preview.before} />
          </div>
          <div>
            <p className="structure-preview-label">고른 변경을 적용하면</p>
            <PreviewTree nodes={preview.after} />
          </div>
        </div>
      )}
    </div>
  );
}

const PREVIEW_STATUS = { renamed: '이름 바뀜', moved: '위치 바뀜', added: '새 항목', absorbed: '합쳐짐' };

function PreviewTree({ nodes }) {
  if (!nodes.length) return <p className="view-sub-dim">비어 있음</p>;
  return (
    <ul className="structure-preview-tree">
      {nodes.map((n) => (
        <li key={n.key} className={`is-${n.status}`}>
          <span>{n.title}</span>
          {PREVIEW_STATUS[n.status] && <span className="chip chip-status">{PREVIEW_STATUS[n.status]}</span>}
          {n.marks.map((m) => <span key={m} className="chip">{m}</span>)}
          {n.children.length > 0 && <PreviewTree nodes={n.children} />}
        </li>
      ))}
    </ul>
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
        {CHANGE_BY_LABEL[change.by] && <span className="chip">{CHANGE_BY_LABEL[change.by]}</span>}
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
      {(change.impact ?? []).map((impact) => impactLine(impact)).filter(Boolean).map((line) => (
        <p key={line} className="hint project-tidy-impact">{line} — 기록은 옮기거나 지우지 않아요</p>
      ))}
      {(change.sections ?? []).length > 0 && (
        <>
          <button type="button" className="btn-ghost btn-sm project-tidy-evidence-toggle" aria-expanded={showEvidence}
            onClick={() => setShowEvidence((v) => !v)}>
            근거 {change.sections.length}곳 {showEvidence ? '접기' : '보기'}
          </button>
          {showEvidence && (
            <ul className="project-tidy-evidence">
              {change.sections.map((section) => (
                <EvidenceItem key={section.sectionId} section={section} />
              ))}
            </ul>
          )}
        </>
      )}
    </li>
  );
}

/** 저장 보장이 막힌 이유를 사람 말로. 입력은 그대로 있다는 것을 함께 말한다. */
function describeSaveBlock(reason) {
  switch (reason) {
    case 'conflict':
      return '다른 곳에서 같은 항목을 고쳤어요. 어느 쪽을 쓸지 고른 뒤 다시 정리해 주세요.';
    case 'timeout':
      return '저장 응답이 오지 않아 다시 정리하지 않았어요. 고친 내용은 그대로 있어요 — 잠시 뒤 다시 눌러 주세요.';
    case 'busy':
      return '고친 내용이 계속 바뀌고 있어 다시 정리하지 않았어요. 잠시 뒤 다시 눌러 주세요.';
    case 'replaced':
      return '그 사이 이 정리안이 바뀌었거나 없어져서 다시 정리하지 않았어요.';
    case 'switched':
      return '계정이 바뀌어 다시 정리하지 않았어요.';
    default:
      return '고친 내용을 저장하지 못해 다시 정리하지 않았어요. 고친 내용은 그대로 있어요 — 다시 눌러 주세요.';
  }
}

/** 충돌 화면에 쓰는 한 줄. 제목과 "빼기"를 사람 말로 쓴다. */
function describeEditValue(value) {
  if (!value) return '고치지 않음';
  const parts = [];
  if (value.title) parts.push(`제목 「${value.title}」`);
  parts.push(value.excluded ? '이 변경 빼기' : '이 변경 적용');
  return parts.join(' · ');
}

function isPdfName(name) {
  return String(name ?? '').toLowerCase().endsWith('.pdf');
}

/**
 * 근거 하나. 무엇을 근거로 삼았는지 읽고, 원본을 그 자리에서 열 수 있게 한다.
 *
 * 되는 것만 되는 것처럼 보인다:
 *  - PDF이고 지금 파일의 쪽이면 [PDF p.N 열기] — 그 쪽에서 열린다.
 *  - 다른 형식은 쪽으로 뛸 수 없다. 파일을 여는 버튼과 위치를 글로 준다("열어서 찾아 주세요").
 *  - 발췌가 예전 파일의 것이면 그렇다고 말하고, 원본 버튼은 "지금 파일"을 연다고 밝힌다.
 *  - 자료가 지워졌거나 구간 기록이 없으면 버튼을 두지 않는다 — 다른 파일을 여는 일이 없게.
 * 원본은 새 탭(또는 내려받기)으로 열리므로 이 화면의 검토 편집은 그대로 남는다.
 */
function EvidenceItem({ section }) {
  const availability = section.availability ?? 'OK';
  if (availability === 'MISSING') {
    return (
      <li className="is-unavailable">
        <span className="project-tidy-evidence-source">근거 구간을 찾을 수 없어요</span>
        <span className="view-sub-dim"> — 이 근거는 확인할 수 없어요. 다시 정리하면 지금 자료로 새로 찾아요</span>
      </li>
    );
  }
  const name = section.materialFilename ?? '자료';
  const pdf = isPdfName(section.materialFilename);
  return (
    <li className={availability === 'OK' ? '' : 'is-unavailable'}>
      <span className="project-tidy-evidence-source">{name} · {section.locator}</span>
      <span className="project-tidy-evidence-title">{section.title}</span>
      {section.excerpt && <p className="project-tidy-evidence-excerpt">{section.excerpt}</p>}

      {availability === 'MATERIAL_DELETED' && (
        <p className="project-tidy-evidence-note">자료가 지워져 원본을 열 수 없어요.</p>
      )}
      {availability === 'OUTDATED' && (
        <p className="project-tidy-evidence-note">
          이 발췌는 예전 파일(또는 예전 분석)에서 나왔어요. 원본을 열면 지금 파일이 열려요 — 내용이 다를 수 있어요.
        </p>
      )}
      {availability !== 'MATERIAL_DELETED' && section.materialId && (
        <div className="project-tidy-evidence-open">
          <MaterialFileLink
            materialId={section.materialId}
            filename={section.materialFilename}
            page={availability === 'OK' ? section.page : null}
            label={availability === 'OUTDATED'
              ? (pdf ? '지금 파일 열기' : '지금 파일 내려받기')
              : (pdf && section.page ? `PDF ${section.locator} 열기` : null)} />
          {!(pdf && availability === 'OK' && section.page) && (
            <span className="view-sub-dim">
              {pdf ? ' 첫 쪽부터 열려요' : ' 이 형식은 위치로 바로 가지 못해요'} — 위치: {section.locator}
            </span>
          )}
        </div>
      )}
    </li>
  );
}
