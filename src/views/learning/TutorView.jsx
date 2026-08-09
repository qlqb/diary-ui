/**
 * 개인과외 전용 화면. topic 하나를 화면 전체 크기로 학습한다.
 *
 * 학습 지도 아래로 펼쳐지는 인라인 채팅이나 좁은 사이드바가 아니다 — "AI 과외 시작"을 누르면
 * 이 화면으로 완전히 전환된다. course/topic context는 진입 시점에 이미 정해져 있으므로
 * LearningChat이 topicId를 넘기고, 사용자에게 과목·주제를 다시 묻지 않는다.
 *
 * "오늘은 여기까지"는 아무 진행 상태도 바꾸지 않고 학습 지도로 돌아간다.
 * "학습 완료"만 topic 진행 상태를 LEARNED로 바꾼다 — 대화가 끝났다는 이유만으로
 * 자동으로 완료 처리하지 않는다(사용자의 명시적 액션이어야 한다).
 */

import { useState } from 'react';
import { ArrowLeft, FileText, X } from 'lucide-react';
import LearningChat from './LearningChat.jsx';
import { topicAPI, materialAPI } from '../../api/api.js';
import { MATERIAL_TYPE_LABEL } from '../../types/learning.js';

export default function TutorView({ course, topic, onExit }) {
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [materials, setMaterials] = useState(null);
  const [finishing, setFinishing] = useState(false);

  const openMaterials = async () => {
    setMaterialsOpen(true);
    if (materials !== null) return;
    try {
      const data = await materialAPI.listByCourse(course.courseId);
      setMaterials(data ?? []);
    } catch {
      setMaterials([]);
    }
  };

  const handlePause = () => onExit?.('PAUSED');

  const handleComplete = async () => {
    setFinishing(true);
    try {
      await topicAPI.updateProgress(topic.topicId, 'LEARNED');
      onExit?.('COMPLETED');
    } catch (err) {
      alert(err.message || '학습 완료 처리에 실패했습니다.');
      setFinishing(false);
    }
  };

  return (
    <div className="tutor-view">
      <header className="tutor-header">
        <button type="button" className="learning-icon-btn" onClick={handlePause} aria-label="학습 지도로 돌아가기">
          <ArrowLeft size={18} />
        </button>
        <div className="tutor-header-titles">
          <span className="tutor-header-course">{course?.title}</span>
          <span className="tutor-header-topic">{topic?.title}</span>
        </div>
        <span className="tutor-header-badge">AI 개인과외</span>
      </header>

      <div className="tutor-body">
        <LearningChat topicId={topic?.topicId} topicTitle={topic?.title} />
      </div>

      <footer className="tutor-footer">
        <div className="tutor-footer-context">
          <span className="tutor-footer-path">
            {course?.title} <span className="tutor-footer-path-sep">›</span> {topic?.title}
          </span>
          <button type="button" className="v6-btn-link tutor-materials-btn" onClick={openMaterials}>
            <FileText size={13} /> 자료 보기
          </button>
        </div>
        <div className="tutor-footer-actions">
          <button type="button" className="btn-ghost" onClick={handlePause}>오늘은 여기까지</button>
          <button type="button" className="btn-primary" disabled={finishing} onClick={handleComplete}>
            {finishing ? '처리 중...' : '학습 완료'}
          </button>
        </div>
      </footer>

      {materialsOpen && (
        <div className="tutor-materials-modal-backdrop" onClick={() => setMaterialsOpen(false)}>
          <div className="tutor-materials-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="tutor-materials-modal-head">
              <h3>관련 자료</h3>
              <button type="button" className="learning-icon-btn" onClick={() => setMaterialsOpen(false)} aria-label="닫기">
                <X size={16} />
              </button>
            </div>
            {topic?.sourceLocator && (
              <p className="v6-section-desc">이 주제의 출처: {topic.sourceLocator}</p>
            )}
            {materials === null ? (
              <p className="v6-section-desc">불러오는 중...</p>
            ) : materials.length === 0 ? (
              <p className="v6-section-desc">아직 올린 자료가 없어요.</p>
            ) : (
              <ul className="tutor-materials-list">
                {materials.map((m) => (
                  <li key={m.materialId}>
                    <span>{m.originalFilename}</span>
                    <span className="learning-badge">{MATERIAL_TYPE_LABEL[m.materialType]}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
