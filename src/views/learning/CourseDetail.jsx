/**
 * 과목 상세. 자료 업로드/분석 검토/적용과 학습 topic 트리를 하나로 묶는다.
 *
 * "자료" 탭: 업로드 -> 분석(draft) -> 검토(수정 가능)/적용. 적용 전에는 course_topics가
 * 전혀 바뀌지 않는다.
 * "학습" 탭: 확정된 topic 트리 + 진행 상태 + Learning/Planning Agent 흐름.
 */

import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { ViewHeader, SubTabs, EmptyState } from '../shared.jsx';
import { courseAPI, materialAPI, materialAnalysisAPI, topicAPI } from '../../api/api.js';
import { MaterialType, MATERIAL_TYPE_LABEL, EXTRACTION_STATUS_LABEL, ExtractionStatus, MaterialAnalysisStatus } from '../../types/learning.js';
import TopicTree from './TopicTree.jsx';
import RecommendationPanel from './RecommendationPanel.jsx';

const SUB_TABS = [
  { key: 'materials', label: '자료' },
  { key: 'topics', label: '학습' },
];

export default function CourseDetail({ courseId, onBack }) {
  const [course, setCourse] = useState(null);
  const [sub, setSub] = useState('materials');
  const [materials, setMaterials] = useState([]);
  const [topics, setTopics] = useState([]);
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

  return (
    <div className="learning-panel">
      <ViewHeader
        title={
          <span className="learning-back-row">
            <button type="button" className="learning-icon-btn" onClick={onBack} aria-label="과목 목록으로">
              <ArrowLeft size={18} />
            </button>
            {course?.title ?? '과목'}
          </span>
        }
        question={course?.textbookTitle ? `교재: ${course.textbookTitle}` : undefined}
      />

      <SubTabs tabs={SUB_TABS} active={sub} onChange={setSub} />

      {loading && <p className="v6-section-desc">불러오는 중...</p>}
      {error && <p className="learning-error">{error}</p>}

      {!loading && sub === 'materials' && (
        <MaterialsPanel
          courseId={courseId}
          materials={materials}
          onChanged={loadAll}
        />
      )}

      {!loading && sub === 'topics' && (
        <div>
          {topics.length === 0 ? (
            <EmptyState
              title="아직 확정된 학습 구조가 없어요"
              desc="자료 탭에서 강의계획서나 교재 목차를 올리고 분석을 적용하면 여기에 나타나요."
            />
          ) : (
            <TopicTree topics={topics} onProgressChanged={loadAll} />
          )}
          <section className="v6-section">
            <h2 className="v6-section-title">다음 학습</h2>
            <RecommendationPanel courseId={courseId} onApplied={loadAll} />
          </section>
        </div>
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

  const handleApply = async (materialId) => {
    const analysis = analyses[materialId];
    if (!analysis) return;
    setError(null);
    try {
      await materialAnalysisAPI.apply(analysis.analysisId);
      setAnalyses((prev) => {
        const next = { ...prev };
        delete next[materialId];
        return next;
      });
      await onChanged?.();
    } catch (err) {
      setError(err.message || '적용에 실패했습니다.');
    }
  };

  const handleDismiss = async (materialId) => {
    const analysis = analyses[materialId];
    if (!analysis) return;
    await materialAnalysisAPI.dismiss(analysis.analysisId);
    setAnalyses((prev) => {
      const next = { ...prev };
      delete next[materialId];
      return next;
    });
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
                  <AnalysisReview
                    analysis={analyses[m.materialId]}
                    onApply={() => handleApply(m.materialId)}
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

function AnalysisReview({ analysis, onApply, onDismiss }) {
  if (analysis.status === MaterialAnalysisStatus.FAILED || !analysis.payload) {
    return (
      <p className="learning-error">
        분석에 실패했어요: {analysis.failureReason || '알 수 없는 오류'}
      </p>
    );
  }

  const { payload } = analysis;

  return (
    <div className="learning-analysis-review">
      <p className="v6-section-desc">{payload.summary}</p>
      {payload.courseFields?.textbookTitle && (
        <p className="v6-item-tag">교재: {payload.courseFields.textbookTitle}</p>
      )}
      {payload.topics.length === 0 ? (
        <p className="learning-error">목차 근거를 찾지 못했어요 — 교재 목차 자료를 올려주세요.</p>
      ) : (
        <ul className="learning-topic-preview">
          {payload.topics.map((t, i) => (
            <AnalysisTopicPreview key={i} node={t} depth={0} />
          ))}
        </ul>
      )}
      <div className="learning-chat-input-row">
        <button type="button" className="v6-btn-small" onClick={onApply} disabled={payload.topics.length === 0}>
          검토 완료 — 적용
        </button>
        <button type="button" className="v6-btn-small" onClick={onDismiss}>
          폐기
        </button>
      </div>
    </div>
  );
}

function AnalysisTopicPreview({ node, depth }) {
  return (
    <li style={{ marginLeft: depth * 16 }}>
      <span>{node.title}</span>{' '}
      <span className={`learning-badge learning-badge-${node.sourceType === 'SOURCE' ? 'source' : 'derived'}`}>
        {node.sourceType === 'SOURCE' ? '원문 근거' : 'AI 세분화'}
      </span>
      {node.children?.length > 0 && (
        <ul>
          {node.children.map((c, i) => (
            <AnalysisTopicPreview key={i} node={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}
