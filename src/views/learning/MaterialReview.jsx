/**
 * Material Agent 분석 draft 편집 화면.
 *
 * 흐름: AI 분석(DRAFT) -> 편집 가능한 초안(이 화면) -> 사용자 수정 -> 적용 -> course_topics 확정.
 * 적용 전에는 어떤 조작도 course_topics를 바꾸지 않는다 — materialAnalysisAPI.edit는 DRAFT의
 * editedJson만 갱신하고, apply를 눌러야만 확정된다.
 *
 * provenance 규칙: 사용자가 새로 추가한 항목은 원문 근거가 없으므로 항상 AI_DERIVED로 만든다.
 * 기존 SOURCE 항목의 제목을 고쳐도 sourceType은 그대로 둔다 — "제목을 다듬었다"와 "근거가
 * 없어졌다"는 다른 일이다.
 */

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { materialAnalysisAPI } from '../../api/api.js';
import { MaterialAnalysisStatus } from '../../types/learning.js';

let localIdSeq = 0;
const nextLocalId = () => `local-${++localIdSeq}`;

function cloneWithLocalIds(node) {
  return {
    ...node,
    _localId: nextLocalId(),
    children: (node.children ?? []).map(cloneWithLocalIds),
  };
}

function stripLocalIds(node) {
  const { _localId, children, ...rest } = node;
  return { ...rest, children: (children ?? []).map(stripLocalIds) };
}

function updateNode(nodes, localId, updater) {
  return nodes.map((node) => {
    if (node._localId === localId) return updater(node);
    if (node.children?.length) {
      return { ...node, children: updateNode(node.children, localId, updater) };
    }
    return node;
  });
}

function removeNode(nodes, localId) {
  return nodes
    .filter((node) => node._localId !== localId)
    .map((node) => ({ ...node, children: removeNode(node.children ?? [], localId) }));
}

function addChild(nodes, parentLocalId) {
  const newNode = { _localId: nextLocalId(), title: '', sourceType: 'AI_DERIVED', sourceLocator: null, children: [] };
  if (parentLocalId === null) return [...nodes, newNode];
  return nodes.map((node) => {
    if (node._localId === parentLocalId) {
      return { ...node, children: [...(node.children ?? []), newNode] };
    }
    if (node.children?.length) {
      return { ...node, children: addChild(node.children, parentLocalId) };
    }
    return node;
  });
}

const COURSE_FIELD_LABELS = [
  ['textbookTitle', '교재명'],
  ['textbookAuthor', '저자'],
  ['textbookPublisher', '출판사'],
  ['textbookIsbn', 'ISBN'],
];

export default function MaterialReview({ analysis, onApplied, onDismiss }) {
  const [courseFields, setCourseFields] = useState(analysis.payload?.courseFields ?? {});
  const [topics, setTopics] = useState((analysis.payload?.topics ?? []).map(cloneWithLocalIds));
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState(null);

  if (analysis.status === MaterialAnalysisStatus.FAILED || !analysis.payload) {
    return (
      <p className="learning-error">
        분석에 실패했어요: {analysis.failureReason || '알 수 없는 오류'}
      </p>
    );
  }

  const hasTopics = topics.length > 0;

  const buildPayload = () => ({
    summary: analysis.payload.summary,
    courseFields,
    keyDates: analysis.payload.keyDates ?? [],
    topics: topics.map(stripLocalIds),
  });

  const handleApply = async () => {
    setApplying(true);
    setError(null);
    try {
      // 수정 내용을 먼저 저장한 뒤 적용한다 — "저장을 깜빡해서 옛 버전이 적용되는" 실수를 없앤다.
      await materialAnalysisAPI.edit(analysis.analysisId, buildPayload());
      await materialAnalysisAPI.apply(analysis.analysisId);
      await onApplied?.();
    } catch (err) {
      setError(err.message || '적용에 실패했습니다.');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="learning-analysis-review material-review">
      <p className="v6-section-desc">{analysis.payload.summary}</p>

      <div className="material-review-fields">
        {COURSE_FIELD_LABELS.map(([key, label]) => (
          <label key={key} className="material-review-field-row">
            <span>{label}</span>
            <input
              type="text"
              className="learning-input material-review-input"
              value={courseFields?.[key] ?? ''}
              onChange={(e) => setCourseFields((prev) => ({ ...prev, [key]: e.target.value || null }))}
              placeholder="미확인"
            />
          </label>
        ))}
      </div>

      {!hasTopics ? (
        <p className="learning-error">목차 근거를 찾지 못했어요 — 교재 목차 자료를 올려주세요.</p>
      ) : (
        <ul className="learning-topic-preview material-review-tree">
          {topics.map((node) => (
            <MaterialReviewNode
              key={node._localId}
              node={node}
              depth={0}
              onChangeTitle={(localId, title) =>
                setTopics((prev) => updateNode(prev, localId, (n) => ({ ...n, title })))
              }
              onRemove={(localId) => setTopics((prev) => removeNode(prev, localId))}
              onAddChild={(localId) => setTopics((prev) => addChild(prev, localId))}
            />
          ))}
        </ul>
      )}

      <button
        type="button"
        className="v6-btn-small material-review-add-root"
        onClick={() => setTopics((prev) => addChild(prev, null))}
      >
        <Plus size={13} /> 최상위 항목 추가
      </button>

      {error && <p className="learning-error">{error}</p>}

      <div className="learning-chat-input-row">
        <button type="button" className="v6-btn-small" onClick={handleApply} disabled={applying || !hasTopics}>
          {applying ? '적용 중...' : '검토 완료 — 적용'}
        </button>
        <button type="button" className="v6-btn-small" onClick={() => onDismiss?.()} disabled={applying}>
          폐기
        </button>
      </div>
    </div>
  );
}

function MaterialReviewNode({ node, depth, onChangeTitle, onRemove, onAddChild }) {
  return (
    <li style={{ marginLeft: depth * 16 }} className="material-review-node">
      <div className="material-review-topic-row">
        <input
          type="text"
          className="learning-input material-review-input material-review-title-input"
          value={node.title}
          onChange={(e) => onChangeTitle(node._localId, e.target.value)}
          placeholder="항목 제목"
        />
        <span className={`learning-badge learning-badge-${node.sourceType === 'SOURCE' ? 'source' : 'derived'}`}>
          {node.sourceType === 'SOURCE' ? '원문 근거' : 'AI 세분화'}
        </span>
        <button
          type="button"
          className="learning-icon-btn"
          onClick={() => onAddChild(node._localId)}
          title="하위 항목 추가"
        >
          <Plus size={14} />
        </button>
        <button
          type="button"
          className="learning-icon-btn material-review-remove-btn"
          onClick={() => onRemove(node._localId)}
          title="이 항목 제거"
        >
          <X size={14} />
        </button>
      </div>
      {node.children?.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <MaterialReviewNode
              key={child._localId}
              node={child}
              depth={depth + 1}
              onChangeTitle={onChangeTitle}
              onRemove={onRemove}
              onAddChild={onAddChild}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
