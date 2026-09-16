/**
 * 이번 초안에서 AI가 고른 자료와 실제로 읽은 범위.
 *
 * 전체 자료를 검토한 것처럼 말하지 않는 것이 이 패널의 일이다: 고른 구간마다 원문을 얼마나 읽었는지(읽은 범위),
 * 그 사이 삭제·변경돼 싣지 못한 구간, 입력 한도 때문에 원문을 싣지 못한 구간, 후보 목록으로도 보지 못한 범위를
 * 따로 보여 준다. 선택 이유는 모델이 쓴 짧은 한 문장이다.
 *
 * 지시에 쓴 자료 이름이 여럿에 해당하면 고르지 않고 여기서 묻는다 — 필요한 경우에만.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

const OUTCOME_LABEL = {
  FULL: '원문 전체를 읽음',
  PARTIAL: '원문 일부를 읽음',
  EXCERPT_ONLY: '원문이 없어 발췌만 읽음',
  DROPPED_DELETED: '그 사이 삭제돼 싣지 않음',
  DROPPED_CHANGED: '그 사이 파일이 바뀌어 싣지 않음',
  DROPPED_SCOPE: '프로젝트 연결이 바뀌어 싣지 않음',
  NOT_RETRIEVED_BUDGET: '입력 한도 때문에 원문을 싣지 못함',
};

const READ = new Set(['FULL', 'PARTIAL', 'EXCERPT_ONLY']);

export default function PlanMaterialSelection({ selection, onChooseRequestedMaterial = null, busy = false }) {
  const [open, setOpen] = useState(false);
  if (!selection || selection.status === 'NO_CANDIDATES') return null;

  const sections = selection.sections ?? [];
  const topics = selection.topics ?? [];
  const read = sections.filter((s) => READ.has(s.outcome));
  const notRead = sections.filter((s) => !READ.has(s.outcome));
  const unreviewed = selection.unreviewed ?? [];
  const ambiguities = selection.ambiguities ?? [];
  const requested = selection.requestedMaterials ?? [];
  // 여러 프로젝트면 같은 주차 이름이 겹친다 — 그때만 프로젝트 이름을 붙인다.
  const manyCourses = new Set(unreviewed.map((u) => u.courseTitle)).size > 1;
  const summarizedOnly = unreviewed.length > 0 && unreviewed.every((u) => u.summarized);

  return (
    <section className="plan-material-selection" aria-label="AI가 고른 자료">
      <button type="button" className="plan-material-selection-head" aria-expanded={open}
        onClick={() => setOpen((v) => !v)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>
          AI가 이번 계획을 위해 고른 자료 {sections.length}개
          {topics.length > 0 ? ` · 학습 항목 ${topics.length}개` : ''}
          {' · 원문을 읽은 구간 '}{read.length}개
        </span>
      </button>

      {selection.status === 'EMPTY' && (
        <p className="hint">이번에는 원문을 읽을 자료를 고르지 않았어요. 진행 상태와 마감만 보고 만든 초안이에요.</p>
      )}
      {selection.insufficientEvidence && (
        <p className="plan-material-selection-warn">
          자료가 충분하지 않다고 봤어요{selection.note ? `: ${selection.note}` : ''}. 없는 문제나 쪽수는 만들지 않았어요.
        </p>
      )}
      {requested.length > 0 && (
        <p className="hint">
          이번 요청에서 지정한 자료: {requested.map((m) => m.filename).join(', ')}
        </p>
      )}

      {ambiguities.map((a) => (
        <div key={a.mention} className="plan-material-selection-ask" role="group" aria-label="자료 고르기">
          <span>「{a.mention}」이 여러 개예요. 어느 자료를 중심으로 볼까요?</span>
          {a.candidates.map((c) => (
            <button key={c.materialId} type="button" className="btn-ghost btn-sm"
              disabled={!onChooseRequestedMaterial || busy}
              onClick={() => onChooseRequestedMaterial?.(c.materialId)}>
              {c.filename}{c.courseId ? '' : ''} (자료 {c.materialId})
            </button>
          ))}
        </div>
      ))}

      {open && (
        <>
          {read.length > 0 && (
            <ul className="plan-material-selection-list">
              {read.map((s) => (
                <li key={s.sectionId}>
                  <span className="plan-material-selection-title">
                    {s.title}{s.locator ? ` (${s.locator})` : ''}
                  </span>
                  <span className="plan-material-selection-meta">
                    {[s.filename, OUTCOME_LABEL[s.outcome], s.retrievedRange].filter(Boolean).join(' · ')}
                  </span>
                  {s.reason && <span className="plan-material-selection-reason">{s.reason}</span>}
                </li>
              ))}
            </ul>
          )}
          {topics.length > 0 && (
            <p className="hint">초점으로 고른 학습 항목: {topics.map((t) => t.title).join(', ')}</p>
          )}
          {notRead.length > 0 && (
            <ul className="plan-material-selection-list is-dim">
              {notRead.map((s) => (
                <li key={s.sectionId}>
                  <span className="plan-material-selection-title">{s.title}</span>
                  <span className="plan-material-selection-meta">{OUTCOME_LABEL[s.outcome] ?? s.outcome}</span>
                </li>
              ))}
            </ul>
          )}
          {unreviewed.length > 0 && (
            <p className="hint">
              {summarizedOnly ? '묶음 요약만 보고 안의 항목은 하나씩 보지 않은 범위: ' : '이번에 목록으로도 보지 못한 범위: '}
              {unreviewed.slice(0, 6)
                .map((u) => `${manyCourses && u.courseTitle ? `${u.courseTitle} · ` : ''}${u.title}(구간 ${u.sections})`)
                .join(', ')}
              {unreviewed.length > 6 ? ` 외 ${unreviewed.length - 6}묶음` : ''}
              {summarizedOnly ? ' — 이 안의 구간은 하나씩 검토하지 않았어요.' : ' — 이 범위는 검토하지 않았어요.'}
            </p>
          )}
          <p className="hint">
            후보 {selection.candidateTotal}개 중 {selection.candidateShown}개를 목록으로 보고 골랐어요
            {selection.expanded ? ' (묶음을 한 번 펼쳐 봤어요)' : ''}.
          </p>
        </>
      )}
    </section>
  );
}
