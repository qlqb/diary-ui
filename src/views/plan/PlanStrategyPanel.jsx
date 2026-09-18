/**
 * "이번 계획은 이렇게 봤어요" — 초안을 만든 판단을 사용자가 읽을 수 있게 편다.
 *
 * 이게 없으면 계획은 "AI가 준 목록"이다. 왜 이 과목이 먼저인지, 왜 어떤 내용이 빠졌는지
 * 사용자가 알 수 없고, 그러면 고칠 수도 없다 — 무엇을 고쳐야 결과가 달라지는지 모르니까.
 *
 * 맨 위에는 목표·도달점·유지한 결정·과목 순서·줄인 범위·이번에 달라진 이유가 온다. 가정·질문·읽지 못한 범위는
 * "확인된 사실"이 아니라는 표시와 함께 따로 둔다 — 추정이 등록된 사실과 같은 무게로 읽히면 안 된다.
 *
 * 기본은 펼침이다. 접어 두면 아무도 열지 않고, 그러면 판단층은 저장만 되고 읽히지 않는다.
 * 카드나 아이콘을 쓰지 않는다. 여기서 필요한 것은 훑어보기다.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { EXISTING_ACTION_LABEL } from '../../lib/planLabels.js';

export default function PlanStrategyPanel({ strategy, projectTitles = {} }) {
  const [open, setOpen] = useState(true);
  const [excludedOpen, setExcludedOpen] = useState(false);

  if (!strategy) return null;

  const courses = strategy.courses ?? [];
  // 조각이 만들어지지 않은 것들. 판단에서 사라진 게 아니라 이번에 안 하기로 한 것이다.
  const excluded = (strategy.topics ?? []).filter((t) => t.treatment === 'SKIP');
  const excludedIds = new Set(excluded.map((t) => t.topicId));
  // 학습 항목을 가리키지 않는 "줄인 범위"(자료 범위·과목 전체 등). 항목이 있는 것은 위 접힘 영역과 겹치지 않게 뺀다.
  const deferred = (strategy.deferred ?? []).filter((d) => d.topicId == null || !excludedIds.has(d.topicId));
  const kept = strategy.keptDecisions ?? [];
  const changes = strategy.changes ?? [];
  const assumptions = strategy.assumptions ?? [];
  const questions = strategy.openQuestions ?? [];
  const unread = strategy.unreadNotes ?? [];
  const existing = (strategy.existingDecisions ?? []).filter((d) => d.action && d.action !== 'KEEP');
  const keptExisting = (strategy.existingDecisions ?? []).filter((d) => !d.action || d.action === 'KEEP');
  const hasBody = strategy.goal || strategy.strategySummary || strategy.reach || courses.length > 0 || kept.length > 0
    || deferred.length > 0 || excluded.length > 0 || changes.length > 0 || assumptions.length > 0
    || questions.length > 0 || unread.length > 0 || existing.length > 0;
  if (!hasBody) return null;

  return (
    <section className="plan-strategy">
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
          {strategy.goal && (
            <p className="plan-strategy-goal">
              <span className="plan-strategy-label">목표</span>
              {strategy.goal}
            </p>
          )}
          {strategy.reach && (
            <p className="plan-strategy-summary">
              <span className="plan-strategy-label">이번 기간 도달점</span>
              {strategy.reach}
            </p>
          )}
          {strategy.strategySummary && (
            <p className="plan-strategy-summary">
              <span className="plan-strategy-label">요약</span>
              {strategy.strategySummary}
            </p>
          )}

          {kept.length > 0 && (
            <div className="plan-strategy-list">
              <span className="plan-strategy-label">유지한 결정</span>
              <ul>
                {kept.map((text) => <li key={text}>{text}</li>)}
              </ul>
            </div>
          )}

          {courses.length > 0 && (
            <div className="plan-strategy-courses">
              <span className="plan-strategy-label">과목 순서</span>
              <ol>
                {courses.map((course) => (
                  <li key={course.courseId}>
                    <span className="plan-strategy-course-name">
                      {projectTitles[course.courseId] ?? '프로젝트'}
                    </span>
                    {course.focus && <span className="plan-strategy-course-focus">{course.focus}</span>}
                    {course.reason && <span className="plan-strategy-course-reason">{course.reason}</span>}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {(deferred.length > 0 || excluded.length > 0) && (
            <div className="plan-strategy-excluded">
              <button
                type="button"
                className="plan-strategy-toggle plan-strategy-toggle-sub"
                onClick={() => setExcludedOpen((v) => !v)}
                aria-expanded={excludedOpen}
              >
                {excludedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span>
                  {excluded.length > 0 ? `이번에는 제외한 내용 ${excluded.length}개` : ''}
                  {excluded.length > 0 && deferred.length > 0 ? ' · ' : ''}
                  {deferred.length > 0 ? `이번에 줄이거나 미룬 범위 ${deferred.length}개` : ''}
                </span>
              </button>
              {excludedOpen && (
                <ul>
                  {excluded.map((topic) => (
                    <li key={`t-${topic.topicId}`}>
                      <span className="plan-strategy-excluded-title">
                        {topic.topicTitle ?? '학습 항목'}
                      </span>
                      <span className="plan-strategy-excluded-reason">
                        {/*
                          서버가 되돌린 것과 모델이 그렇게 본 것을 구분해 말한다. 사용자가
                          직접 표시해서 빠진 것인데 "AI가 그렇게 판단했다"처럼 읽히면
                          자기가 한 일을 자기가 못 알아본다.
                        */}
                        {topic.reason}
                        {topic.adjustedBy === 'SERVER' && ' (표시에 따라 조정)'}
                      </span>
                    </li>
                  ))}
                  {deferred.map((d, i) => (
                    <li key={`d-${i}`}>
                      <span className="plan-strategy-excluded-title">{d.title}</span>
                      <span className="plan-strategy-excluded-reason">{d.reason}</span>
                    </li>
                  ))}
                </ul>
              )}
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

          {changes.length > 0 && (
            <div className="plan-strategy-list plan-strategy-changes">
              <span className="plan-strategy-label">이번에 달라진 점</span>
              <ul>
                {changes.map((c, i) => (
                  <li key={`c-${i}`}>
                    <span className="plan-strategy-excluded-title">{c.what}</span>
                    {c.why && <span className="plan-strategy-excluded-reason">{c.why}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(assumptions.length > 0 || questions.length > 0 || unread.length > 0) && (
            <div className="plan-strategy-list plan-strategy-uncertain">
              <span className="plan-strategy-label">확인된 사실이 아니라 가정·질문이에요</span>
              <ul>
                {questions.map((q) => <li key={`q-${q}`} className="plan-strategy-question">물어볼 것: {q}</li>)}
                {assumptions.map((a) => <li key={`a-${a}`}>가정: {a}</li>)}
                {unread.map((u) => <li key={`u-${u}`}>읽지 못한 범위: {u}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
