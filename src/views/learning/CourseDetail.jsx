/**
 * 과목 상세 shell. 자료 업로드/분석 검토/적용과 학습 지도(LearningMap+TopicDetail)를 묶는다.
 *
 * "학습" 탭: 확정된 topic 트리를 계층 그대로 보여주고(LearningMap), 선택한 topic 하나의
 * 상세(TopicDetail)와 다음 학습 추천(RecommendationPanel)을 연결한다.
 * "자료" 탭: 업로드 -> 분석(DRAFT) -> 편집 가능한 검토(MaterialReview)/적용. 적용 전에는
 * course_topics가 전혀 바뀌지 않는다.
 *
 * AI 과외는 이 화면 안에서 펼치지 않는다 — onStartTutor로 부모(LearningView)에게 전환을
 * 맡기고, 부모가 화면 전체를 TutorView로 바꾼다.
 */

import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { ViewHeader, SubTabs, EmptyState } from '../shared.jsx';
import { courseAPI, materialAPI, materialAnalysisAPI, topicAPI } from '../../api/api.js';
import { MaterialType, MATERIAL_TYPE_LABEL, EXTRACTION_STATUS_LABEL, ExtractionStatus } from '../../types/learning.js';
import LearningMap from './LearningMap.jsx';
import TopicDetail from './TopicDetail.jsx';
import MaterialReview from './MaterialReview.jsx';
import RecommendationPanel from './RecommendationPanel.jsx';

const SUB_TABS = [
  { key: 'topics', label: '학습' },
  { key: 'materials', label: '자료' },
];

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

export default function CourseDetail({ courseId, onBack, onStartTutor }) {
  const [course, setCourse] = useState(null);
  const [sub, setSub] = useState('topics');
  const [materials, setMaterials] = useState([]);
  const [topics, setTopics] = useState([]);
  const [selectedTopicId, setSelectedTopicId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [courseData, materialsData, topicsData] = await Promise.all([
        courseAPI.get(courseId),
        materialAPI.listByCourse(courseId),
        topicAPI.getTree(courseId),
      ]);
      setCourse(courseData);
      setMaterials(materialsData ?? []);
      setTopics(topicsData ?? []);
    } catch (err) {
      setError(err.message || '과목 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const flatTopics = flattenTopics(topics);
  const learnedCount = flatTopics.filter((t) => t.progressStatus === 'LEARNED').length;
  const progressPct = flatTopics.length > 0 ? Math.round((learnedCount / flatTopics.length) * 100) : 0;
  const selectedTopic = flatTopics.find((t) => t.topicId === selectedTopicId) ?? null;

  return (
    <div className="learning-panel">
      <ViewHeader
        title={
          <span className="learning-back-row">
            <button type="button" className="learning-icon-btn" onClick={onBack} aria-label="학습으로">
              <ArrowLeft size={18} />
            </button>
            {course?.title ?? '과목'}
            {flatTopics.length > 0 && <span className="learning-course-progress-badge">{progressPct}%</span>}
          </span>
        }
        question={course?.textbookTitle ? `교재: ${course.textbookTitle}` : undefined}
      />

      <SubTabs tabs={SUB_TABS} active={sub} onChange={setSub} />

      {loading && <p className="v6-section-desc">불러오는 중...</p>}
      {error && <p className="learning-error">{error}</p>}

      {!loading && sub === 'topics' && (
        <div>
          {topics.length === 0 ? (
            <EmptyState
              title="아직 확정된 학습 구조가 없어요"
              desc="자료 탭에서 강의계획서나 교재 목차를 올리고 분석을 적용하면 여기에 나타나요."
            />
          ) : (
            <div className="learning-map-shell">
              <LearningMap
                topics={topics}
                selectedTopicId={selectedTopicId}
                onSelectTopic={(topic) => setSelectedTopicId(topic.topicId)}
              />
              <TopicDetail
                courseTitle={course?.title}
                topic={selectedTopic}
                onProgressChanged={loadAll}
                onStartTutor={(topic) => onStartTutor?.(course, topic)}
              />
            </div>
          )}
          <section className="v6-section">
            <h2 className="v6-section-title">다음 학습</h2>
            <RecommendationPanel courseId={courseId} onApplied={loadAll} />
          </section>
        </div>
      )}

      {!loading && sub === 'materials' && (
        <MaterialsPanel courseId={courseId} materials={materials} onChanged={loadAll} />
      )}
    </div>
  );
}

function MaterialsPanel({ courseId, materials, onChanged }) {
  const [materialType, setMaterialType] = useState(MaterialType.SYLLABUS);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [analyses, setAnalyses] = useState({}); // materialId -> analysis draft

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file || uploading) return;
    setUploading(true);
    setError(null);
    try {
      await materialAPI.upload(courseId, materialType, file);
      setFile(null);
      await onChanged?.();
    } catch (err) {
      setError(err.message || '업로드에 실패했습니다.');
    } finally {
      setUploading(false);
    }
  };

  const handleAnalyze = async (materialId) => {
    setError(null);
    try {
      const analysis = await materialAnalysisAPI.analyze(courseId, materialId);
      setAnalyses((prev) => ({ ...prev, [materialId]: analysis }));
    } catch (err) {
      setError(err.message || '분석에 실패했습니다.');
    }
  };

  const clearAnalysis = (materialId) => {
    setAnalyses((prev) => {
      const next = { ...prev };
      delete next[materialId];
      return next;
    });
  };

  const handleApplied = async (materialId) => {
    clearAnalysis(materialId);
    await onChanged?.();
  };

  const handleDismiss = async (materialId) => {
    const analysis = analyses[materialId];
    if (!analysis) return;
    await materialAnalysisAPI.dismiss(analysis.analysisId);
    clearAnalysis(materialId);
  };

  return (
    <div>
      <form className="learning-upload-form" onSubmit={handleUpload}>
        <select
          className="learning-input"
          value={materialType}
          onChange={(e) => setMaterialType(e.target.value)}
        >
          {Object.values(MaterialType).map((t) => (
            <option key={t} value={t}>{MATERIAL_TYPE_LABEL[t]}</option>
          ))}
        </select>
        <input
          type="file"
          accept=".pdf,.pptx"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <button type="submit" className="v6-btn-small" disabled={!file || uploading}>
          {uploading ? '업로드 중...' : '업로드'}
        </button>
      </form>

      {error && <p className="learning-error">{error}</p>}

      {materials.length === 0 ? (
        <EmptyState title="아직 올린 자료가 없어요" desc="강의계획서 PDF나 교재 목차를 올려보세요." />
      ) : (
        <div className="v6-item-list">
          {materials.map((m) => (
            <article key={m.materialId} className="v6-item-card">
              <div className="v6-item-main">
                <span className="v6-item-title-button">{m.originalFilename}</span>
                <div className="v6-item-meta">
                  <span className="v6-item-tag">{MATERIAL_TYPE_LABEL[m.materialType]}</span>
                  <span className="v6-item-status">{EXTRACTION_STATUS_LABEL[m.extractionStatus]}</span>
                </div>
                {m.extractionError && <p className="learning-error">{m.extractionError}</p>}

                {m.extractionStatus === ExtractionStatus.SUCCESS && !analyses[m.materialId] && (
                  <button type="button" className="v6-btn-small" onClick={() => handleAnalyze(m.materialId)}>
                    분석하기
                  </button>
                )}

                {analyses[m.materialId] && (
                  <MaterialReview
                    analysis={analyses[m.materialId]}
                    onApplied={() => handleApplied(m.materialId)}
                    onDismiss={() => handleDismiss(m.materialId)}
                  />
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
