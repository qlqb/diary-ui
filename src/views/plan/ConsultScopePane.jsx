/**
 * 상담 작업 공간의 왼쪽 칸 — 이번 요청이 무엇을 대상으로 하고, 어떤 자료를 실제로 봤는가.
 *
 * ★ 대상 프로젝트는 "이번 요청"의 것이다. 초안이 있으면 초안이 다룬 프로젝트(strategy.projects), 없으면
 *   지금 대화의 범위(프로젝트 하나 또는 진행 중인 전체)다.
 * ★ 프로젝트 옆의 상태는 대화 상태다(이야기 중 / 확인 전 / 확인한 내용 있음). 학습을 얼마나 했는지와
 *   섞지 않는다 — 그건 학습 지도가 말한다.
 * ★ 프로젝트를 누르면 대화 범위가 그 프로젝트로 바뀐다. 사용자가 누를 때만 바뀐다 — 한 프로젝트 이야기가
 *   끝났다고 다음 프로젝트로 알아서 넘어가지 않는다.
 * ★ 자료는 초안이 실제로 쓴 것만 보인다(고른 구간과 읽은 결과). 올려 둔 자료 전체 목록이 아니다.
 */

import { useEffect, useMemo, useState } from 'react';
import { Map as MapIcon } from 'lucide-react';
import { contextAPI } from '../../api/api.js';
import MaterialFileLink from '../../components/MaterialFileLink.jsx';
import { TALK_STATUS_LABEL, talkStatusOf } from '../../ai/consultLabels.js';
import { PROJECT_DISPOSITION_LABEL } from '../../lib/planLabels.js';

const READ_OUTCOMES = new Set(['FULL', 'PARTIAL', 'EXCERPT_ONLY']);

export default function ConsultScopePane({
  projects = [], scopeCourseId = null, onSelectScope, consultState = null, draft = null,
  onOpenLearningMap, onOpenSource, onOpenManual,
}) {
  /*
   * "확인한 내용 있음"의 근거: 그 프로젝트에 묶여 저장된 이해한 내용. 못 읽으면 표시를 낮춰 "확인 전"으로
   * 둘 뿐 화면을 막지 않는다 — 대화 상태 라벨은 보조 정보다.
   */
  const [knownCourseIds, setKnownCourseIds] = useState(() => new Set());
  useEffect(() => {
    // 응답을 기다리는 동안에는 읽지 않는다 — 턴이 끝난 뒤의 상태가 필요한 것이다.
    if (consultState?.sending) return undefined;
    let cancelled = false;
    let list = null;
    try { list = contextAPI?.list ?? null; } catch { list = null; }
    if (!list) return undefined;
    Promise.resolve()
      .then(() => list())
      .then((contexts) => {
        if (cancelled) return;
        setKnownCourseIds(new Set((contexts ?? []).map((c) => c.courseId).filter((id) => id != null)));
      })
      .catch(() => { /* 라벨의 근거일 뿐이다 */ });
    return () => { cancelled = true; };
    // 대화가 한 턴 끝날 때마다 다시 읽는다 — 방금 기억해 둔 내용이 라벨에 바로 보이게.
  }, [consultState?.sending]);

  const outcomes = draft?.strategy?.projects ?? null;
  const targets = useMemo(() => {
    if (outcomes && outcomes.length > 0) {
      return outcomes.map((o) => ({
        courseId: o.courseId,
        title: o.courseTitle ?? projects.find((p) => p.courseId === o.courseId)?.title ?? '프로젝트',
        outcome: o,
      }));
    }
    const list = scopeCourseId != null ? projects.filter((p) => p.courseId === scopeCourseId) : projects;
    return list.map((p) => ({ courseId: p.courseId, title: p.title, outcome: null }));
  }, [outcomes, projects, scopeCourseId]);

  const understanding = consultState?.understanding ?? [];
  const sections = (draft?.materialSelection?.sections ?? []).filter((s) => READ_OUTCOMES.has(s.outcome));
  const sectionById = new Map(sections.map((s) => [s.sectionId, s]));
  const usedByCourse = (target) => (target.outcome?.sectionIds ?? []).map((id) => sectionById.get(id)).filter(Boolean);
  const claimed = new Set(targets.flatMap((t) => usedByCourse(t).map((s) => s.sectionId)));
  const unclaimed = sections.filter((s) => !claimed.has(s.sectionId));

  return (
    <div className="consult-scope">
      <h2 className="consult-pane-title">범위·자료</h2>

      <section aria-label="이번 요청의 대상 프로젝트">
        <p className="consult-pane-label">이번 요청의 대상</p>
        <button type="button"
          className={`consult-scope-all${scopeCourseId == null ? ' is-current' : ''}`}
          aria-pressed={scopeCourseId == null}
          onClick={() => onSelectScope?.(null)}>
          전체 프로젝트로 이야기하기{scopeCourseId == null ? ' · 지금 범위' : ''}
        </button>
        {targets.length === 0 && <p className="hint">진행 중인 프로젝트가 아직 없어요.</p>}
        <ul className="consult-scope-projects">
          {targets.map((target) => {
            const inScope = scopeCourseId === target.courseId;
            const status = talkStatusOf({
              inScope,
              hasMessages: Boolean(consultState?.hasMessages) && consultState?.courseId === target.courseId,
              hasKnowledge: knownCourseIds.has(target.courseId)
                || understanding.some((line) => line.scopeLabel && line.scopeLabel === target.title),
            });
            const used = usedByCourse(target);
            return (
              <li key={target.courseId} className={`consult-scope-project${inScope ? ' is-current' : ''}`}>
                <div className="consult-scope-project-head">
                  <button type="button" className="consult-scope-project-name" aria-pressed={inScope}
                    title="이 프로젝트로 대화 범위 바꾸기"
                    onClick={() => onSelectScope?.(target.courseId)}>
                    {target.title}
                  </button>
                  <span className={`consult-status consult-status-${status.toLowerCase()}`}>
                    {TALK_STATUS_LABEL[status]}
                  </span>
                </div>
                {target.outcome && (
                  <p className="consult-scope-outcome">
                    초안: {PROJECT_DISPOSITION_LABEL[target.outcome.disposition] ?? '상태 미확인'}
                    {target.outcome.itemCount ? ` · 항목 ${target.outcome.itemCount}개` : ''}
                  </p>
                )}
                {used.length > 0 && <UsedSections sections={used} />}
                <div className="consult-scope-project-actions">
                  {onOpenLearningMap && (
                    <button type="button" className="btn-ghost btn-sm"
                      aria-label={`${target.title} 학습 지도`}
                      onClick={() => onOpenLearningMap(target.courseId)}>
                      <MapIcon size={13} /> 학습 지도
                    </button>
                  )}
                  {onOpenSource && (
                    <button type="button" className="btn-ghost btn-sm"
                      aria-label={`${target.title} 프로젝트에서 보기`}
                      onClick={() => onOpenSource('COURSE', target.courseId)}>
                      프로젝트에서 보기
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-label="이번 초안이 실제로 읽은 자료">
        <p className="consult-pane-label">이번 초안이 실제로 읽은 자료</p>
        {!draft && <p className="hint">아직 초안이 없어요. 자료 원문은 초안을 만들 때 읽어요.</p>}
        {draft && sections.length === 0 && (
          <p className="hint">이번 초안은 자료 원문을 읽지 않고 만들었어요.</p>
        )}
        {sections.length > 0 && unclaimed.length === 0 && (
          <p className="hint">읽은 구간 {sections.length}개는 위 프로젝트마다 나눠 적었어요.</p>
        )}
        {unclaimed.length > 0 && <UsedSections sections={unclaimed} />}
      </section>

      {onOpenManual && (
        <p className="consult-scope-foot">
          <button type="button" className="btn-ghost btn-sm" onClick={onOpenManual}>직접 조건 정해서 만들기</button>
        </p>
      )}
    </div>
  );
}

/** 초안이 읽은 자료 구간. 위치는 글자로 보여 주고, 파일을 알면 같은 자리에서 바로 연다. */
function UsedSections({ sections }) {
  return (
    <ul className="consult-scope-materials">
      {sections.map((s) => (
        <li key={s.sectionId}>
          <span className="consult-scope-material-title">{s.title}{s.locator ? ` (${s.locator})` : ''}</span>
          {s.filename && <span className="consult-scope-material-file">{s.filename}</span>}
          {s.materialId != null && (
            <MaterialFileLink materialId={s.materialId} filename={s.filename} contentType={s.contentType} />
          )}
        </li>
      ))}
    </ul>
  );
}
