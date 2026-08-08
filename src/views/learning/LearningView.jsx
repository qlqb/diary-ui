/**
 * 학습 화면 진입점. 과목 목록 <-> 과목 상세를 전환한다.
 *
 * 실제 데이터 소유는 각 하위 화면(CourseDetail)이 필요할 때 API로 가져온다 —
 * 여기서는 "지금 어떤 과목을 보고 있는가"라는 네비게이션 상태만 갖는다.
 */

import { useEffect, useState } from 'react';
import { EmptyState } from '../shared.jsx';
import { courseAPI } from '../../api/api.js';
import CourseDetail from './CourseDetail.jsx';

export default function LearningView() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCourseId, setSelectedCourseId] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const loadCourses = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await courseAPI.list();
      setCourses(data ?? []);
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
    } catch (err) {
      alert(err.message || '과목 생성에 실패했습니다.');
    } finally {
      setCreating(false);
    }
  };

  if (selectedCourseId) {
    return (
      <CourseDetail
        courseId={selectedCourseId}
        onBack={() => setSelectedCourseId(null)}
      />
    );
  }

  return (
    <div className="learning-panel">
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

      {loading && <p className="v6-section-desc">불러오는 중...</p>}
      {error && <p className="learning-error">{error}</p>}

      {!loading && !error && courses.length === 0 && (
        <EmptyState
          title="아직 만든 과목이 없어요"
          desc="과목을 만들고 강의계획서나 교재 목차를 올리면 학습 구조를 분석해요."
        />
      )}

      {!loading && courses.length > 0 && (
        <div className="v6-item-list">
          {courses.map((course) => (
            <article key={course.courseId} className="v6-item-card">
              <div className="v6-item-main">
                <button
                  type="button"
                  className="v6-item-title-button"
                  onClick={() => setSelectedCourseId(course.courseId)}
                >
                  {course.title}
                </button>
                <div className="v6-item-meta">
                  {course.textbookTitle && (
                    <span className="v6-item-tag">교재: {course.textbookTitle}</span>
                  )}
                  <span className="v6-item-tag">학습 항목 {course.topicCount}개</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
