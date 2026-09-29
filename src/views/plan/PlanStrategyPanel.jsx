/**
 * "이번 계획은 이렇게 봤어요" — 모르는 과목의 계획도 판단할 수 있게 초안을 만든 판단을 편다.
 *
 * 기본 화면에는 핵심만 둔다: 목표 · 다룰 범위와 순서 · 왜 이렇게 · 이 계획이 아는 내 상태 · 확인하지 못한 가정 ·
 * 빼거나 읽지 못한 범위 · 자료 근거와 난이도의 구분. 나머지(유지한 결정·프로젝트별 이유·달라진 점·기존 항목 변경·
 * 전체 목록)는 [자세히 보기]에서 연다. 필수 설문이나 승인 단계를 늘리지 않는다 — 읽기만 한다.
 *
 * 자료에 근거했다는 것과 사용자에게 맞는 분량이라는 것은 다른 말이다. 앞의 것은 서버가 센 읽기 결과로, 뒤의 것은
 * 사용자 상태(말함·자기평가·실제 수행)로만 말하고, 근거가 없으면 추정이라고 적는다(lib/planUnderstanding.js).
 */

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { EXISTING_ACTION_LABEL } from '../../lib/planLabels.js';
import '../../styles/learning-flow.css';
import {
  buildPlanUnderstanding, fitLine, groundingLine, USER_STATE_KIND_LABEL,
} from '../../lib/planUnderstanding.js';

export default function PlanStrategyPanel({
  strategy, projectTitles = {}, provenance = null, selection = null, items = [], defaultOpen = true,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [more, setMore] = useState(false);
  const [excludedOpen, setExcludedOpen] = useState(false);
  const u = useMemo(
    () => buildPlanUnderstanding({ strategy, provenance, selection, items, projectTitles }),
    [strategy, provenance, selection, items, projectTitles],
  );

  if (!strategy) return null;

  const existing = u.existing.filter((d) => d.action && d.action !== 'KEEP');
  const keptExisting = u.existing.filter((d) => !d.action || d.action === 'KEEP');
  const uncertainCount = u.assumptions.length + u.questions.length;
  const leftOutCount = u.skipped.length + u.deferred.length;
  const unreadCount = u.unread.length + u.unreviewed.length;
  const hasBody = u.goal || u.why || u.reach || u.order.length > 0 || u.kept.length > 0 || leftOutCount > 0
    || u.scoped.length > 0
    || u.changes.length > 0 || uncertainCount > 0 || unreadCount > 0 || existing.length > 0;
  if (!hasBody) return null;

  return (
    <section className="plan-strategy" aria-label="이번 계획은 이렇게 봤어요">
      <button
        type="button"
        className="plan-strategy-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span>이번 계획은 이렇게 봤어요</span>
      </button>

      {open && (
        <div className="plan-strategy-body">
          {u.goal && (
            <p className="plan-strategy-goal">
              <span className="plan-strategy-label">목표</span>
              {u.goal}
            </p>
          )}
          {u.reach && (
            <p className="plan-strategy-summary">
              <span className="plan-strategy-label">이번 기간 도달점</span>
              {u.reach}
            </p>
          )}

          {(u.order.length > 0 || u.firstItems.length > 0) && (
            <div className="plan-strategy-courses">
              <span className="plan-strategy-label">프로젝트 순서</span>
              {u.order.length > 0 && (
                <ol>
                  {u.order.map((course) => (
                    <li key={course.courseId}>
                      <span className="plan-strategy-course-name">{course.title}</span>
                      {course.focus && <span className="plan-strategy-course-focus">{course.focus}</span>}
                      {more && course.reason && <span className="plan-strategy-course-reason">{course.reason}</span>}
                    </li>
                  ))}
                </ol>
              )}
              {u.firstItems.length > 0 && (
                <p className="plan-strategy-scope">
                  할 일 {u.itemCount}개를 이 순서로: {u.firstItems.join(' → ')}{u.itemCount > u.firstItems.length ? ' → …' : ''}
                </p>
              )}
            </div>
          )}

          {u.why && (
            <p className="plan-strategy-summary">
              <span className="plan-strategy-label">왜 이렇게</span>
              {u.why}
            </p>
          )}

          {/* 이 계획이 아는 나. 확인된 것과 추정을 같은 무게로 쓰지 않는다. */}
          <div className="plan-strategy-list plan-strategy-state">
            <span className="plan-strategy-label">이 계획이 참고한 내 상태</span>
            {u.userState.length === 0 && u.historyCount === 0 && u.agreementCount === 0 ? (
              <p>아직 확인한 내 상태가 없어요. 처음 보는 과목이어도 괜찮아요 — 해 본 결과가 다음 계획에 쓰여요.</p>
            ) : (
              <p>
                {[
                  u.userState.length > 0 ? `내가 말하거나 평가한 것 ${u.userState.length}개` : null,
                  u.historyCount > 0 ? `실제 수행 기록 ${u.historyCount}건` : null,
                  u.agreementCount > 0 ? `상담에서 합의한 것 ${u.agreementCount}개` : null,
                ].filter(Boolean).join(' · ')}
              </p>
            )}
            {more && u.userState.length > 0 && (
              <ul>
                {u.userState.map((s, i) => (
                  <li key={`s-${i}`}>
                    <span className="plan-item-tag">{USER_STATE_KIND_LABEL[s.kind]}</span> {s.text}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="plan-strategy-summary plan-strategy-basis">
            <span className="plan-strategy-label">자료 근거</span>
            {groundingLine(u.grounding)}
          </p>
          <p className="plan-strategy-summary plan-strategy-basis">
            <span className="plan-strategy-label">분량·난이도</span>
            {fitLine(u.fit)}
          </p>

          {(uncertainCount > 0 || unreadCount > 0) && (
            <div className="plan-strategy-list plan-strategy-uncertain">
              <span className="plan-strategy-label">확인된 사실이 아니라 가정·질문이에요</span>
              <ul>
                {u.questions.map((q) => <li key={`q-${q}`} className="plan-strategy-question">물어볼 것: {q}</li>)}
                {(more ? u.assumptions : u.assumptions.slice(0, 2)).map((a) => <li key={`a-${a}`}>가정: {a}</li>)}
                {!more && u.assumptions.length > 2 && <li className="hint">가정 {u.assumptions.length - 2}개 더 있어요</li>}
                {(more ? u.unread : u.unread.slice(0, 1)).map((x) => <li key={`u-${x}`}>읽지 못한 범위: {x}</li>)}
                {u.unreviewed.length > 0 && (
                  <li>
                    살펴보지 못한 자료 범위 {u.unreviewed.length}곳
                    {more && `: ${u.unreviewed.map((r) => [r.courseTitle, r.title].filter(Boolean).join(' · ')).join(', ')}`}
                  </li>
                )}
              </ul>
            </div>
          )}

          {leftOutCount > 0 && (
            <div className="plan-strategy-excluded">
              <button
                type="button"
                className="plan-strategy-toggle plan-strategy-toggle-sub"
                onClick={() => setExcludedOpen((v) => !v)}
                aria-expanded={excludedOpen}
              >
                {excludedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span>
                  {u.skipped.length > 0 ? `이번에는 제외한 내용 ${u.skipped.length}개` : ''}
                  {u.skipped.length > 0 && u.deferred.length > 0 ? ' · ' : ''}
                  {u.deferred.length > 0 ? `이번에 줄이거나 미룬 범위 ${u.deferred.length}개` : ''}
                </span>
              </button>
              {excludedOpen && (
                <ul>
                  {u.skipped.map((topic) => (
                    <li key={`t-${topic.topicId}`}>
                      <span className="plan-strategy-excluded-title">{topic.topicTitle ?? '학습 항목'}</span>
                      <span className="plan-strategy-excluded-reason">
                        {/* 사용자가 직접 표시해서 빠진 것을 "AI가 그렇게 판단했다"처럼 읽히게 두지 않는다. */}
                        {topic.reason}
                        {topic.adjustedBy === 'SERVER' && ' (표시에 따라 조정)'}
                      </span>
                    </li>
                  ))}
                  {u.deferred.map((d, i) => (
                    <li key={`d-${i}`}>
                      <span className="plan-strategy-excluded-title">{d.title}</span>
                      <span className="plan-strategy-excluded-reason">{d.reason}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {u.scoped.length > 0 && (
            <p className="plan-strategy-summary">
              <span className="plan-strategy-label">내가 범위에서 뺀 항목</span>
              {u.scoped.map((x) => `${x.title}(${x.label})`).join(', ')} — 학습을 마친 것으로 보지 않아요. 학습 지도에서 풀 수 있어요.
            </p>
          )}

          {more && u.kept.length > 0 && (
            <div className="plan-strategy-list">
              <span className="plan-strategy-label">유지한 결정</span>
              <ul>{u.kept.map((text) => <li key={text}>{text}</li>)}</ul>
            </div>
          )}

          {existing.length > 0 && (
            <div className="plan-strategy-list">
              <span className="plan-strategy-label">이미 있던 항목의 변경</span>
              <ul>
                {existing.map((d) => (
                  <li key={`e-${d.executionItemId}`}>
                    <span className="plan-strategy-excluded-title">{d.title}</span>
                    <span className="plan-strategy-excluded-reason">
                      {EXISTING_ACTION_LABEL[d.action] ?? d.action}
                      {d.action === 'REDUCE' && d.expectedMinutes ? ` (${d.expectedMinutes}분으로)` : ''}
                      {d.action === 'MOVE' && d.toDate ? ` (${d.toDate}로)` : ''}
                      {d.reason ? ` · ${d.reason}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
              {keptExisting.length > 0 && (
                <p className="hint">그대로 두는 항목 {keptExisting.length}개는 새로 만들지 않았어요.</p>
              )}
            </div>
          )}

          {/* 실행 기록·답변이 무엇을 바꿨는지. 기록에서 온 조정은 기존 계획을 덮지 않고 이 초안의 제안일 뿐이다. */}
          {u.changes.length > 0 && (
            <div className="plan-strategy-list plan-strategy-changes">
              <span className="plan-strategy-label">이번에 달라진 점</span>
              <ul>
                {u.changes.map((c, i) => (
                  <li key={`c-${i}`}>
                    <span className="plan-strategy-excluded-title">{c.what}</span>
                    {c.why && <span className="plan-strategy-excluded-reason">{c.why}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button type="button" className="btn-ghost btn-sm plan-strategy-more" aria-expanded={more}
            onClick={() => setMore((v) => !v)}>
            {more ? '간단히 보기' : '자세히 보기'}
          </button>
        </div>
      )}
    </section>
  );
}
