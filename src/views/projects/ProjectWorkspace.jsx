/**
 * 프로젝트 작업 공간.
 *
 * 관리 페이지가 아니다. 열었을 때 가장 먼저 느껴야 하는 것은 "여기에서 AI와 이 주제를 계속
 * 이어갈 수 있다"이고, 그래서 맨 위가 현재 상태 + 이어서 물어볼 것이다. 오른쪽 AI 패널은
 * 이 화면에 들어온 순간 이 프로젝트로 범위가 바뀌어 있다.
 *
 * 학습 구조(topic 트리)는 항상 관리해야 하는 핵심 UI가 아니라, 필요할 때 펼쳐 보는 보조
 * 정보다 — 기본은 접혀 있다.
 *
 * 자료는 올리는 순간부터 AI가 쓸 수 있다. 구조 분석(topic 트리 만들기)은 계획·진도 관리를
 * 하고 싶을 때만 누르는 별도 선택지이고, 검수를 마쳐야 질문할 수 있는 구조가 아니다.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft, ChevronDown, ChevronRight, FileText, Sparkles, Upload, Archive, Pencil, Loader2, Link2, X,
} from 'lucide-react';
import ExecutionRow from '../../components/ExecutionRow.jsx';
import DraftRow from '../../components/DraftRow.jsx';
import LearningMap from '../learning/LearningMap.jsx';
import TopicDetail from '../learning/TopicDetail.jsx';
import MaterialReview from '../learning/MaterialReview.jsx';
import { adjustmentFor } from '../../ai/useProposalDraft.js';
import {
  courseAPI, courseNoteAPI, executionItemAPI, materialAPI, materialAnalysisAPI, materialStoreAPI, topicAPI,
} from '../../api/api.js';
import {
  MaterialType, MATERIAL_TYPE_HINT, EXTRACTION_STATUS_LABEL, ExtractionStatus,
} from '../../types/learning.js';
import MaterialTypeSelect from '../../components/MaterialTypeSelect.jsx';
import { todayString } from '../../lib/datetime.js';

function flatten(topics) {
  const out = [];
  const walk = (nodes) => nodes.forEach((n) => { out.push(n); if (n.children?.length) walk(n.children); });
  walk(topics ?? []);
  return out;
}

function findAncestors(topics, targetId, path = []) {
  for (const node of topics) {
    if (node.topicId === targetId) return path;
    if (node.children?.length) {
      const found = findAncestors(node.children, targetId, [...path, { topicId: node.topicId, title: node.title }]);
      if (found) return found;
    }
  }
  return null;
}

export default function ProjectWorkspace({
  courseId, onBack, onAsk, draft, onPatchCard, onToggleExclude, onProjectsChanged, refreshToken,
}) {
  const [project, setProject] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [topics, setTopics] = useState([]);
  const [notes, setNotes] = useState([]);
  const [executions, setExecutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const [structureOpen, setStructureOpen] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState(null);
  const [renaming, setRenaming] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [projectData, materialsData, topicsData, notesData, executionsData] = await Promise.all([
        courseAPI.get(courseId),
        materialAPI.listByCourse(courseId),
        topicAPI.getTree(courseId),
        courseNoteAPI.list(courseId),
        executionItemAPI.getByCourse(courseId, todayString()),
      ]);
      setProject(projectData);
      setMaterials(materialsData ?? []);
      setTopics(topicsData ?? []);
      setNotes(notesData ?? []);
      setExecutions(executionsData ?? []);
    } catch (err) {
      setError(err.message || '프로젝트를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => { load(); }, [load, refreshToken]);

  const flatTopics = flatten(topics);
  const currentTopic = flatTopics.find((t) => t.progressStatus === 'IN_PROGRESS')
    ?? flatTopics.find((t) => t.progressStatus === 'NOT_STARTED')
    ?? null;
  const learnedCount = flatTopics.filter((t) => t.progressStatus === 'LEARNED').length;
  const selectedTopic = flatTopics.find((t) => t.topicId === selectedTopicId) ?? null;
  const assessments = notes.filter((n) => n.category === 'ASSESSMENT');

  /*
   * 끝난 것도 함께 보여준다 — 이 프로젝트로 오늘 무엇을 했는지가 안 보이면 "아직 아무것도
   * 없다"는 잘못된 인상을 준다. 아직 할 것이 위로 오도록 정렬만 바꾼다.
   */
  const relatedExecutions = [...executions].sort((a, b) => {
    const rank = (s) => (s === 'PLANNED' ? 0 : s === 'HOLD' ? 1 : 2);
    return rank(a.status) - rank(b.status)
      || String(a.scheduledDate ?? '').localeCompare(String(b.scheduledDate ?? ''));
  });
  const projectDraftCards = (draft?.cards ?? []).filter((c) => c.operation === 'CREATE');

  const handleAction = async (action, item, payload) => {
    setBusyId(item.executionItemId);
    try {
      if (action === 'complete') await executionItemAPI.complete(item.executionItemId, item.version);
      else if (action === 'partial') await executionItemAPI.partial(item.executionItemId, { version: item.version, ...payload });
      else if (action === 'reduce') await executionItemAPI.reduce(item.executionItemId, { version: item.version, ...payload });
      else if (action === 'move') {
        await executionItemAPI.move(item.executionItemId, payload.toDate, item.version, {
          startTime: payload.startTime ?? null,
          endTime: payload.endTime ?? null,
        });
      }
      // 보류 항목은 이 화면에도 그대로 나타난다 — 여기서도 다시 꺼내거나 지울 수 있어야
      // 오늘 화면에서만 손댈 수 있는 반쪽짜리가 되지 않는다.
      else if (action === 'resume') await executionItemAPI.resume(item.executionItemId, item.version);
      else if (action === 'delete') await executionItemAPI.delete(item.executionItemId, item.version);
      await load();
    } catch (err) {
      setError(err.message || '처리하지 못했습니다.');
    } finally {
      setBusyId(null);
    }
  };

  if (loading && !project) {
    return <div className="view"><p className="view-dim">불러오는 중...</p></div>;
  }

  return (
    <div className="view">
      <header className="view-head">
        <div className="project-head">
          <button type="button" className="icon-btn" onClick={onBack} aria-label="프로젝트 목록으로">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="view-title">{project?.title}</h1>
            <p className="view-sub">
              {project?.groupLabel && <span className="chip">{project.groupLabel}</span>}
              {project?.textbookTitle && <span className="view-sub-dim"> 교재 {project.textbookTitle}</span>}
            </p>
          </div>
        </div>
        <div className="project-head-actions">
          <button type="button" className="icon-btn" onClick={() => setRenaming(true)} aria-label="이름/분류 수정" title="이름·분류 수정">
            <Pencil size={15} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="프로젝트 보관"
            title="프로젝트 보관"
            onClick={async () => {
              // 보관함(C-3)이 실제로 있으므로 "다시 꺼낼 수 있다"는 말이 지켜진다.
              // 복원 UI가 없던 시절의 "나중에 다시 꺼낼 수 있어요"는 거짓말이었다.
              if (!window.confirm(
                '보관할까요? 현재 프로젝트 목록에서 숨겨져요.\n'
                + '보관함에서 다시 꺼낼 수 있고, 기존 기록은 그대로 유지됩니다.',
              )) return;
              try {
                await courseAPI.archive(courseId);
                await onProjectsChanged?.();
                onBack();
              } catch (err) {
                setError(err.message || '보관하지 못했습니다.');
              }
            }}
          >
            <Archive size={15} />
          </button>
        </div>
      </header>

      {renaming && (
        <RenameForm
          project={project}
          onCancel={() => setRenaming(false)}
          onSaved={async () => { setRenaming(false); await load(); await onProjectsChanged?.(); }}
        />
      )}

      {error && <p className="view-error">{error}</p>}

      <section className="project-status">
        <div className="project-status-line">
          <span className="project-status-label">현재 상태</span>
          <span className="project-status-value">
            {currentTopic
              ? `${currentTopic.progressStatus === 'IN_PROGRESS' ? '진행 중' : '다음'} · ${currentTopic.title}`
              : materials.length > 0
                ? '자료는 있고, 아직 학습 구조는 정하지 않았어요'
                : '이제 막 시작했어요'}
          </span>
          {flatTopics.length > 0 && (
            <span className="chip">{learnedCount}/{flatTopics.length} 완료</span>
          )}
        </div>
        {assessments.length > 0 && (
          <div className="project-status-line">
            <span className="project-status-label">중요 일정</span>
            <span className="project-status-value">
              {assessments.slice(0, 3).map((n) => `${n.label} ${n.detail}`).join(' · ')}
            </span>
          </div>
        )}
        <div className="project-ask-row">
          {currentTopic && (
            <button type="button" className="btn-primary btn-sm"
              onClick={() => onAsk(`${currentTopic.title} 이어서 공부하려고 해. 어디부터 보면 좋을까?`)}>
              <Sparkles size={13} /> 이어하기
            </button>
          )}
          <button type="button" className="btn-ghost btn-sm" onClick={() => onAsk('오늘 30분만 해보고 싶어. 뭘 하면 좋을까?')}>
            오늘 30분 해보기
          </button>
          {materials.length > 0 && (
            <button type="button" className="btn-ghost btn-sm" onClick={() => onAsk('올린 자료 내용을 요약해줘.')}>
              자료 내용 물어보기
            </button>
          )}
          <button type="button" className="btn-ghost btn-sm" onClick={() => onAsk('이번 주 계획을 짜줘.')}>
            이번 주 계획 요청
          </button>
        </div>
      </section>

      <section className="view-section">
        <h2 className="section-title">관련 실행</h2>
        {relatedExecutions.length === 0 && projectDraftCards.length === 0 ? (
          <p className="view-dim">아직 이 프로젝트로 잡힌 것이 없어요. AI와 이야기해서 만들어보세요.</p>
        ) : (
          <div className="row-list">
            {relatedExecutions.map((item) => (
              <ExecutionRow
                key={item.executionItemId}
                item={item}
                adjustment={adjustmentFor(draft, item.executionItemId)}
                onAdjustmentPatch={onPatchCard}
                onAdjustmentExclude={onToggleExclude}
                onAction={handleAction}
                busy={busyId === item.executionItemId}
              />
            ))}
            {projectDraftCards.map((card) => (
              <DraftRow key={card.proposalItemId} card={card} showDate
                onPatch={onPatchCard} onToggleExclude={onToggleExclude} />
            ))}
          </div>
        )}
      </section>

      <MaterialsSection
        courseId={courseId}
        materials={materials}
        onChanged={load}
        onAsk={onAsk}
      />

      <section className="view-section">
        <button type="button" className="collapse-head" onClick={() => setStructureOpen((v) => !v)}>
          {structureOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          <span className="section-title">학습 상태 자세히</span>
          <span className="view-dim">
            {flatTopics.length > 0 ? `${flatTopics.length}개 항목` : '아직 없음'}
          </span>
        </button>
        {structureOpen && (
          flatTopics.length === 0 ? (
            <p className="view-dim">
              자료의 구조를 분석해 적용하면 여기에 진도 관리용 목차가 생겨요. 없어도 AI와 이야기하는 데는
              지장이 없어요.
            </p>
          ) : (
            <div className="structure-shell">
              <LearningMap
                topics={topics}
                selectedTopicId={selectedTopicId}
                onSelectTopic={(topic) => setSelectedTopicId(topic.topicId)}
              />
              <TopicDetail
                courseTitle={project?.title}
                ancestors={selectedTopicId != null ? findAncestors(topics, selectedTopicId) ?? [] : []}
                topic={selectedTopic}
                onProgressChanged={load}
                onStartTutor={(topic) => onAsk(`${topic.title}에 대해 알려줘.`)}
              />
            </div>
          )
        )}
      </section>
    </div>
  );
}

function RenameForm({ project, onCancel, onSaved }) {
  const [title, setTitle] = useState(project?.title ?? '');
  const [groupLabel, setGroupLabel] = useState(project?.groupLabel ?? '');
  const [saving, setSaving] = useState(false);

  return (
    <form
      className="project-create"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          await courseAPI.update(project.courseId, { title: title.trim(), groupLabel: groupLabel.trim() || null });
          await onSaved();
        } finally {
          setSaving(false);
        }
      }}
    >
      <input className="project-create-title" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="프로젝트 이름" />
      <input className="project-create-group" value={groupLabel} placeholder="분류 (선택)"
        onChange={(e) => setGroupLabel(e.target.value)} aria-label="분류" />
      <button type="submit" className="btn-primary" disabled={saving || !title.trim()}>저장</button>
      <button type="button" className="btn-ghost" onClick={onCancel}>취소</button>
    </form>
  );
}

/**
 * 자료 영역. 이 프로젝트가 "소유한" 자료가 아니라 "참고하는" 자료 목록이다.
 *
 * 자료 원본은 자료함이 갖고, 여기 있는 것은 연결이다. 그래서 각 행의 제거 액션은
 * 연결 해제이지 파일 삭제가 아니다 — 같은 자료를 다른 프로젝트도 쓰고 있을 수 있고,
 * 원본을 지우는 것은 자료 탭에서만 할 수 있다.
 *
 * 업로드가 끝나면 그 자리에서 "AI가 이 자료를 사용할 수 있어요"가 보인다 — 구조 분석은
 * 그다음에 원할 때 누르는 선택지이고, 분석 결과를 전부 검수해야 질문할 수 있는 구조가 아니다.
 */
function MaterialsSection({ courseId, materials, onChanged, onAsk }) {
  const [error, setError] = useState(null);
  const [analyses, setAnalyses] = useState({});
  const [analyzingId, setAnalyzingId] = useState(null);
  const [picking, setPicking] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);

  /**
   * 이 프로젝트에서의 역할을 바꾼다. 연결 해제 후 재연결이 아니라 링크만 고치는 것이라
   * linked_at도 분석 이력도 그대로 남는다.
   */
  const handleRoleChange = async (materialId, materialType) => {
    setBusyId(materialId);
    setError(null);
    try {
      await materialStoreAPI.updateLinkType(materialId, courseId, materialType);
      await onChanged();
    } catch (err) {
      setError(err.message || '자료 역할을 바꾸지 못했습니다.');
    } finally {
      setBusyId(null);
    }
  };

  const handleAnalyze = async (materialId) => {
    setAnalyzingId(materialId);
    setError(null);
    try {
      const analysis = await materialAnalysisAPI.analyze(courseId, materialId);
      setAnalyses((prev) => ({ ...prev, [materialId]: analysis }));
    } catch (err) {
      setError(err.message || '분석하지 못했습니다.');
    } finally {
      setAnalyzingId(null);
    }
  };

  /** 연결 해제. 자료 원본도, 다른 프로젝트 연결도, 이미 적용한 학습 내용도 그대로 남는다. */
  const handleUnlink = async (materialId) => {
    setBusyId(materialId);
    setError(null);
    try {
      await materialStoreAPI.removeLink(materialId, courseId);
      await onChanged();
    } catch (err) {
      setError(err.message || '연결을 끊지 못했습니다.');
    } finally {
      setBusyId(null);
    }
  };

  const clearAnalysis = (materialId) => {
    setAnalyses((prev) => {
      const next = { ...prev };
      delete next[materialId];
      return next;
    });
  };

  return (
    <section className="view-section">
      <h2 className="section-title">연결된 자료 {materials.length > 0 ? materials.length : ''}</h2>
      <p className="section-desc">
        연결하면 AI가 이 프로젝트에서 그 자료를 참고해 답해요. 같은 자료를 여러 프로젝트에서 쓸 수 있어요.
      </p>

      {error && <p className="view-error">{error}</p>}

      {materials.length === 0 ? (
        <p className="view-dim">아직 연결된 자료가 없어요. 없어도 AI와 이야기할 수 있어요.</p>
      ) : (
        <ul className="material-list">
          {materials.map((m) => (
            <li key={m.materialId} className="material-item">
              <FileText size={14} />
              <span className="material-name">{m.originalFilename}</span>
              {/* 역할은 자료가 아니라 이 연결의 속성이라 여기서 바로 바꿀 수 있어야 한다. */}
              <MaterialTypeSelect
                value={m.materialType ?? MaterialType.OTHER}
                disabled={busyId === m.materialId}
                label={`${m.originalFilename}의 자료 역할`}
                onChange={(t) => handleRoleChange(m.materialId, t)}
              />
              {m.extractionStatus === ExtractionStatus.SUCCESS ? (
                <span className="chip chip-ok">AI가 사용할 수 있어요</span>
              ) : (
                <span className="chip chip-warn">{EXTRACTION_STATUS_LABEL[m.extractionStatus]}</span>
              )}
              <span className="material-actions">
                {m.extractionStatus === ExtractionStatus.SUCCESS && (
                  <>
                    <button type="button" className="btn-ghost btn-sm"
                      onClick={() => onAsk(`${m.originalFilename} 내용 중에 중요한 걸 알려줘.`)}>
                      이 자료로 질문
                    </button>
                    {!analyses[m.materialId] && (
                      <button type="button" className="btn-ghost btn-sm" disabled={analyzingId === m.materialId}
                        onClick={() => handleAnalyze(m.materialId)}>
                        {analyzingId === m.materialId ? '분석 중...' : '구조 분석'}
                      </button>
                    )}
                  </>
                )}
                <button type="button" className="btn-ghost btn-sm" disabled={busyId === m.materialId}
                  title="이 프로젝트에서만 연결을 끊어요. 자료는 자료함에 남아요."
                  onClick={() => handleUnlink(m.materialId)}>
                  <X size={13} /> 연결 해제
                </button>
              </span>
              {analyses[m.materialId] && (
                <div className="material-review-slot">
                  <MaterialReview
                    analysis={analyses[m.materialId]}
                    onApplied={async () => { clearAnalysis(m.materialId); await onChanged(); }}
                    onDismiss={async () => {
                      await materialAnalysisAPI.dismiss(analyses[m.materialId].analysisId);
                      clearAnalysis(m.materialId);
                    }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="material-detail-actions">
        <button type="button" className="btn-ghost btn-sm" onClick={() => setUploadOpen((v) => !v)}>
          <Upload size={13} /> 새 자료 업로드
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setPicking(true)}>
          <Link2 size={13} /> 내 자료에서 연결
        </button>
      </div>

      {uploadOpen && (
        <UploadForm
          courseId={courseId}
          onCancel={() => setUploadOpen(false)}
          onUploaded={async () => { setUploadOpen(false); await onChanged(); }}
        />
      )}

      {picking && (
        <MaterialPicker
          courseId={courseId}
          linkedIds={new Set(materials.map((m) => m.materialId))}
          onCancel={() => setPicking(false)}
          onLinked={async () => { setPicking(false); await onChanged(); }}
        />
      )}
    </section>
  );
}

/**
 * 새 자료를 올리면서 이 프로젝트에 바로 연결한다. 역할을 여기서 고를 수 있게 한 이유는
 * 예전 경로가 사용자에게 묻지도 않고 OTHER로 확정한 뒤 "성격은 자료 상세에서 바꾼다"고만
 * 적어뒀는데, 그 기능이 실제로는 없었기 때문이다.
 *
 * 다만 필수 입력으로 만들지는 않는다 — 파일 하나 올리는 데 선택을 강제하면 마찰이 크다.
 * 기본값 OTHER로 두고 그대로 올려도 되고, 나중에 목록에서 바꿔도 된다.
 */
function UploadForm({ courseId, onCancel, onUploaded }) {
  const [file, setFile] = useState(null);
  const [materialType, setMaterialType] = useState(MaterialType.OTHER);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file || uploading) return;
    setUploading(true);
    setError(null);
    try {
      await materialAPI.upload(courseId, materialType, file);
      await onUploaded();
    } catch (err) {
      setError(err.message || '업로드하지 못했습니다.');
      setUploading(false);
    }
  };

  return (
    <form className="material-link-form" onSubmit={handleSubmit}>
      <input type="file" accept=".pdf,.pptx" aria-label="새 자료 파일" disabled={uploading}
        onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <MaterialTypeSelect value={materialType} onChange={setMaterialType} disabled={uploading} />
      <button type="submit" className="btn-ghost btn-sm" disabled={!file || uploading}>
        {uploading ? <><Loader2 size={13} className="spin" /> 올리는 중</> : '업로드'}
      </button>
      <button type="button" className="btn-ghost btn-sm" onClick={onCancel} disabled={uploading}>취소</button>
      <p className="material-form-hint">{MATERIAL_TYPE_HINT}</p>
      {error && <p className="view-error">{error}</p>}
    </form>
  );
}

/**
 * 이미 올려둔 자료를 이 프로젝트에 연결한다. 여기서 materialType을 고르는 이유는
 * 그 값이 자료가 아니라 이 연결에 붙기 때문이다 — 같은 파일이 프로젝트마다 다를 수 있다.
 */
function MaterialPicker({ courseId, linkedIds, onCancel, onLinked }) {
  const [available, setAvailable] = useState(null);
  const [error, setError] = useState(null);
  const [materialId, setMaterialId] = useState('');
  const [materialType, setMaterialType] = useState(MaterialType.OTHER);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    materialStoreAPI.list()
      .then((all) => {
        if (!alive) return;
        const list = all.filter((m) => !linkedIds.has(m.materialId));
        setAvailable(list);
        setMaterialId(list[0]?.materialId ?? '');
      })
      .catch((err) => { if (alive) setError(err.message || '자료를 불러오지 못했습니다.'); });
    return () => { alive = false; };
    // linkedIds는 매 렌더 새 Set이라 의존성에 넣지 않는다 — 열릴 때 한 번만 읽는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <p className="view-error">{error}</p>;
  if (available === null) return <p className="view-dim">자료를 불러오는 중...</p>;

  if (available.length === 0) {
    return (
      <div className="material-link-form">
        <span className="view-dim">연결할 수 있는 다른 자료가 없어요.</span>
        <button type="button" className="btn-ghost btn-sm" onClick={onCancel}>닫기</button>
      </div>
    );
  }

  return (
    <form
      className="material-link-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await materialStoreAPI.addLink(Number(materialId), courseId, materialType);
          await onLinked();
        } catch (err) {
          setError(err.message || '연결하지 못했습니다.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <select className="material-type" value={materialId} aria-label="연결할 자료"
        onChange={(e) => setMaterialId(e.target.value)}>
        {available.map((m) => (
          <option key={m.materialId} value={m.materialId}>{m.originalFilename}</option>
        ))}
      </select>
      <MaterialTypeSelect value={materialType} onChange={setMaterialType} disabled={busy} />
      <button type="submit" className="btn-ghost btn-sm" disabled={busy || !materialId}>연결</button>
      <button type="button" className="btn-ghost btn-sm" onClick={onCancel} disabled={busy}>취소</button>
      <p className="material-form-hint">{MATERIAL_TYPE_HINT}</p>
    </form>
  );
}
