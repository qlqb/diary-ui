/**
 * "이번 계획은 이렇게 봤어요" — 초안을 만든 판단을 사용자가 읽을 수 있게 편다.
 *
 * 이게 없으면 계획은 "AI가 준 목록"이다. 왜 이 과목이 먼저인지, 왜 어떤 내용이 빠졌는지
 * 사용자가 알 수 없고, 그러면 고칠 수도 없다 — 무엇을 고쳐야 결과가 달라지는지 모르니까.
 *
 * 기본은 펼침이다. 접어 두면 아무도 열지 않고, 그러면 판단층은 저장만 되고 읽히지 않는다.
 *
 * 카드나 아이콘을 쓰지 않는다. 여기서 필요한 것은 훑어보기이고, 장식이 붙으면 조각 목록과
 * 시각적 무게가 같아져 무엇이 본문인지 흐려진다.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { TREATMENT_LABEL } from '../../lib/planLabels.js';

export default function PlanStrategyPanel({ strategy, projectTitles = {} }) {
  const [open, setOpen] = useState(true);
  const [excludedOpen, setExcludedOpen] = useState(false);

  if (!strategy) return null;

  const courses = strategy.courses ?? [];
  // 조각이 만들어지지 않은 것들. 판단에서 사라진 게 아니라 이번에 안 하기로 한 것이다.
  const excluded = (strategy.topics ?? []).filter((t) => t.treatment === 'SKIP');

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
          {strategy.strategySummary && (
            <p className="plan-strategy-summary">
              <span className="plan-strategy-label">요약</span>
              {strategy.strategySummary}
            </p>
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
                  </li>
                ))}
              </ol>
            </div>
          )}

          {excluded.length > 0 && (
            <div className="plan-strategy-excluded">
              <button
                type="button"
                className="plan-strategy-toggle plan-strategy-toggle-sub"
                onClick={() => setExcludedOpen((v) => !v)}
                aria-expanded={excludedOpen}
              >
                {excludedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span>이번에는 제외한 내용 {excluded.length}개</span>
              </button>
              {excludedOpen && (
                <ul>
                  {excluded.map((topic) => (
                    <li key={topic.topicId}>
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
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
