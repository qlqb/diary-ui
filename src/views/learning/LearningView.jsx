/**
 * 학습 화면 진입점. overview(과목 현황) <-> course(과목 상세) <-> tutor(개인과외) 세 모드를
 * 이 화면 하나가 소유한다.
 *
 * "학습"을 눌렀을 때 가장 먼저 보이는 화면은 과목을 관리하는 개발자용 목록이 아니라
 * "지금 무엇을 배우고 있고 어디까지 했는가"다. 과목 카드의 "이어 학습"은 상세를 거치지 않고
 * 바로 개인과외(TutorView)로 들어간다.
 *
 * 이 화면이 학습 기능의 유일한 진입점이다 — PlanView 등 다른 위치에서 별도의 LearningView
 * 인스턴스를 독립적으로 띄우지 않는다.
 */

import { useEffect, useState } from 'react';
import { ArrowRight, GraduationCap } from 'lucide-react';
import { EmptyState } from '../shared.jsx';
import { courseAPI, topicAPI } from '../../api/api.js';
import CourseDetail from './CourseDetail.jsx';
import TutorView from './TutorView.jsx';

function flattenTopics(topics) {
  const result = [];
  const walk = (nodes) => {
    for (const node of nodes) {
      result.push(node);
      if (node.children?.length) walk(node.children);
    }
  };
  walk(topics ?? []);
  return result;
}

function summarize(flat) {
  const learned = flat.filter((t) => t.progressStatus === 'LEARNED').length;
  const progressPct = flat.length > 0 ? Math.round((learned / flat.length) * 100) : 0;
  const current = flat.find((t) => t.progressStatus === 'IN_PROGRESS') ?? null;
  const next = current ? null : flat.find((t) => t.progressStatus === 'NOT_STARTED') ?? null;
  return { progressPct, current, next };
}

export default function LearningView() {
  const [mode, setMode] = useState('overview'); // overview | course | tutor
  const [courses, setCourses] = useState([]);
  const [summaries, setSummaries] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const [selectedCourseId, setSelectedCourseId] = useState(null);
  const [tutorTarget, setTutorTarget] = useState(null); // { course, topic }
  const [returnMode, setReturnMode] = useState('overview');

  const loadCourses = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await courseAPI.list();
      setCourses(list ?? []);
      const entries = await Promise.all(
        (list ?? []).map(async (course) => {
          try {
            const tree = await topicAPI.getTree(course.courseId);
            return [course.courseId, summarize(flattenTopics(tree))];
          } catch {
            return [course.courseId, summarize([])];
          }
        }),
      );
      setSummaries(Object.fromEntries(entries));
    } catch (err) {
      setError(err.message || '과목을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCourses();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newTitle.trim() || creating) return;
    setCreating(true);
    try {
      const created = await courseAPI.create({ title: newTitle.trim() });
      setNewTitle('');
      await loadCourses();
      setSelectedCourseId(created.courseId);
      setMode('course');
    } catch (err) {
      alert(err.message || '과목 생성에 실패했습니다.');
    } finally {
      setCreating(false);
    }
  };

  const openCourse = (courseId) => {
    setSelectedCourseId(courseId);
    setMode('course');
  };

  const startTutor = (course, topic, from) => {
    setTutorTarget({ course, topic });
    setReturnMode(from);
    setMode('tutor');
  };

  const handleExitTutor = async (action) => {
    setMode(returnMode);
    setTutorTarget(null);
    if (action === 'COMPLETED') {
      await loadCourses();
    }
  };

  if (mode === 'tutor' && tutorTarget) {
    return <TutorView course={tutorTarget.course} topic={tutorTarget.topic} onExit={handleExitTutor} />;
  }

  if (mode === 'course' && selectedCourseId) {
    return (
      <CourseDetail
        courseId={selectedCourseId}
        onBack={() => { setMode('overview'); loadCourses(); }}
        onStartTutor={(course, topic) => startTutor(course, topic, 'course')}
      />
    );
  }

  return (
    <div className="learning-panel learning-overview">
      <header className="v6-view-header">
        <div>
          <h1 className="v6-view-title">학습</h1>
          <p className="v6-view-question">지금 무엇을 배우고 있고, 어디까지 했을까?</p>
        </div>
      </header>

      {loading && <p className="v6-section-desc">불러오는 중...</p>}
      {error && <p className="learning-error">{error}</p>}

      {!loading && !error && courses.length === 0 && (
        <EmptyState
          title="아직 만든 과목이 없어요"
          desc="과목을 만들고 강의계획서나 교재 목차를 올리면 학습 구조를 분석해요."
        />
      )}

      {!loading && courses.length > 0 && (
        <div className="learning-overview-grid">
          {courses.map((course) => (
            <CourseOverviewCard
              key={course.courseId}
              course={course}
              summary={summaries[course.courseId] ?? { progressPct: 0, current: null, next: null }}
              onOpenCourse={() => openCourse(course.courseId)}
              onContinue={(target) => startTutor(course, target, 'overview')}
            />
          ))}
        </div>
      )}

      <form className="learning-course-create" onSubmit={handleCreate}>
        <input
          type="text"
          className="learning-input"
          placeholder="과목 이름 (예: 자료구조)"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />
        <button type="submit" className="v6-btn-small" disabled={creating || !newTitle.trim()}>
          {creating ? '만드는 중...' : '과목 만들기'}
        </button>
      </form>
    </div>
  );
}

function CourseOverviewCard({ course, summary, onOpenCourse, onContinue }) {
  const { progressPct, current, next } = summary;
  const continueTarget = current ?? next;

  return (
    <article className="learning-course-card">
      <div className="learning-course-card-head">
        <button type="button" className="learning-course-card-title" onClick={onOpenCourse}>
          {course.title}
        </button>
        <span className="learning-course-card-pct">진행 {progressPct}%</span>
      </div>
      <div className="learning-progress-bar">
        <span style={{ width: `${progressPct}%` }} />
      </div>

      {current ? (
        <div className="learning-course-card-status">
          <span className="learning-course-card-status-label">현재 학습</span>
          <span className="learning-course-card-status-value">{current.title}</span>
        </div>
      ) : next ? (
        <div className="learning-course-card-status">
          <span className="learning-course-card-status-label">다음 학습</span>
          <span className="learning-course-card-status-value">{next.title}</span>
        </div>
      ) : (
        <p className="v6-section-desc">
          {course.topicCount > 0 ? '모든 항목을 학습했어요.' : '아직 학습 구조가 없어요 — 자료를 올려보세요.'}
        </p>
      )}

      <div className="learning-course-card-actions">
        <button
          type="button"
          className="btn-primary"
          disabled={!continueTarget}
          onClick={() => continueTarget && onContinue(continueTarget)}
        >
          <GraduationCap size={14} /> 이어 학습
        </button>
        <button type="button" className="btn-ghost" onClick={onOpenCourse}>
          과목 보기 <ArrowRight size={13} />
        </button>
      </div>
    </article>
  );
}
